import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  WALLET_COMMAND_EXCHANGE,
  WALLET_COMMAND_QUEUE,
  WALLET_COMMAND_RESULT_QUEUE,
  WALLET_COMMAND_RESULT_ROUTING_KEY,
  WALLET_COMMAND_ROUTING_KEY,
  type WalletCommandDto,
  type WalletCommandOutcomeDto,
} from "@crash/contracts";
import amqp, {
  type Channel,
  type ChannelModel,
  type ConsumeMessage,
} from "amqplib";
import { Subject, type Observable } from "rxjs";
import {
  GAME_REPOSITORY,
  type GameRepository,
} from "./game.repository";

interface PendingCommand {
  reject: (error: Error) => void;
  resolve: (outcome: WalletCommandOutcomeDto) => void;
  timer: ReturnType<typeof setTimeout>;
}

@Injectable()
export class WalletsEventsClient implements OnModuleInit, OnModuleDestroy {
  private connection?: ChannelModel;
  private channel?: Channel;
  private publisherTimer?: ReturnType<typeof setInterval>;
  private readonly outcomesSubject = new Subject<WalletCommandOutcomeDto>();
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private readonly timeoutMs = readIntegerEnv("WALLET_COMMAND_TIMEOUT_MS", 5_000);

  constructor(
    @Inject(GAME_REPOSITORY)
    private readonly gameRepository: GameRepository,
  ) {}

  get outcomes$(): Observable<WalletCommandOutcomeDto> {
    return this.outcomesSubject.asObservable();
  }

  async onModuleInit(): Promise<void> {
    await this.gameRepository.migrate();
    await this.connect();
    this.publisherTimer = setInterval(() => {
      void this.publishPendingOutbox();
    }, readIntegerEnv("OUTBOX_PUBLISH_INTERVAL_MS", 250));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.publisherTimer) {
      clearInterval(this.publisherTimer);
    }

    for (const pending of this.pendingCommands.values()) {
      clearTimeout(pending.timer);
      pending.reject(new WalletsClientError("WALLET_CLIENT_STOPPED"));
    }

    this.pendingCommands.clear();
    this.outcomesSubject.complete();
    await this.channel?.close();
    await this.connection?.close();
  }

  async executeCommand(
    command: WalletCommandDto,
  ): Promise<WalletCommandOutcomeDto> {
    const previousOutcome = await this.gameRepository.findInboxOutcome(
      command.idempotencyKey,
    );

    if (previousOutcome) {
      return previousOutcome;
    }

    await this.gameRepository.enqueueWalletCommand(
      WALLET_COMMAND_ROUTING_KEY,
      command,
    );

    const outcomePromise = new Promise<WalletCommandOutcomeDto>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingCommands.delete(command.idempotencyKey);
          reject(new WalletsClientError("WALLET_COMMAND_TIMEOUT"));
        }, this.timeoutMs);

        this.pendingCommands.set(command.idempotencyKey, {
          reject,
          resolve,
          timer,
        });
      },
    );

    await this.publishPendingOutbox();
    return outcomePromise;
  }

  private async connect(): Promise<void> {
    this.connection = await amqp.connect(
      process.env.RABBITMQ_URL ?? "amqp://admin:admin@localhost:5672",
    );
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange(WALLET_COMMAND_EXCHANGE, "direct", {
      durable: true,
    });
    await this.channel.assertQueue(WALLET_COMMAND_QUEUE, { durable: true });
    await this.channel.assertQueue(WALLET_COMMAND_RESULT_QUEUE, {
      durable: true,
    });
    await this.channel.bindQueue(
      WALLET_COMMAND_QUEUE,
      WALLET_COMMAND_EXCHANGE,
      WALLET_COMMAND_ROUTING_KEY,
    );
    await this.channel.bindQueue(
      WALLET_COMMAND_RESULT_QUEUE,
      WALLET_COMMAND_EXCHANGE,
      WALLET_COMMAND_RESULT_ROUTING_KEY,
    );
    await this.channel.prefetch(25);
    await this.channel.consume(
      WALLET_COMMAND_RESULT_QUEUE,
      (message) => {
        void this.handleOutcomeMessage(message);
      },
      { noAck: false },
    );
    await this.publishPendingOutbox();
  }

  private async handleOutcomeMessage(
    message: ConsumeMessage | null,
  ): Promise<void> {
    if (!message || !this.channel) {
      return;
    }

    try {
      const outcome = JSON.parse(
        message.content.toString("utf8"),
      ) as WalletCommandOutcomeDto;
      const idempotencyKey = getOutcomeIdempotencyKey(outcome);

      if (!idempotencyKey) {
        this.channel.ack(message);
        return;
      }

      await this.gameRepository.saveInboxOutcome(idempotencyKey, outcome);
      const pending = this.pendingCommands.get(idempotencyKey);

      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(outcome);
        this.pendingCommands.delete(idempotencyKey);
      }

      this.outcomesSubject.next(outcome);
      this.channel.ack(message);
    } catch (error) {
      console.error("Wallet outcome processing failed", error);
      this.channel.nack(message, false, true);
    }
  }

  private async publishPendingOutbox(): Promise<void> {
    if (!this.channel) {
      return;
    }

    const messages = await this.gameRepository.listUnpublishedOutbox(50);

    for (const message of messages) {
      this.channel.publish(
        WALLET_COMMAND_EXCHANGE,
        message.routingKey,
        Buffer.from(JSON.stringify(message.payload)),
        {
          contentType: "application/json",
          deliveryMode: 2,
          persistent: true,
        },
      );
      await this.gameRepository.markOutboxPublished(message.id);
    }
  }
}

export class WalletsClientError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function getOutcomeIdempotencyKey(
  outcome: WalletCommandOutcomeDto,
): string | undefined {
  return outcome.accepted
    ? outcome.ledgerEntry.idempotencyKey
    : outcome.idempotencyKey;
}

function readIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
