import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  WALLET_COMMAND_EXCHANGE,
  WALLET_COMMAND_QUEUE,
  WALLET_COMMAND_RESULT_QUEUE,
  WALLET_COMMAND_RESULT_ROUTING_KEY,
  WALLET_COMMAND_ROUTING_KEY,
  type WalletCommandDto,
  type WalletCommandOutcomeDto,
  type WalletCommandRejectedDto,
} from "@crash/contracts";
import amqp, {
  type Channel,
  type ChannelModel,
  type ConsumeMessage,
} from "amqplib";
import { WalletDomainError } from "../domain/wallet.errors";
import { WalletsService } from "../application/wallets.service";
import {
  WALLETS_REPOSITORY,
  type WalletsRepository,
} from "./wallets.repository";

@Injectable()
export class WalletsRabbitMqService implements OnModuleInit, OnModuleDestroy {
  private connection?: ChannelModel;
  private channel?: Channel;
  private publisherTimer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly walletsService: WalletsService,
    @Inject(WALLETS_REPOSITORY)
    private readonly walletsRepository: WalletsRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.walletsRepository.migrate();
    await this.connect();
    this.publisherTimer = setInterval(() => {
      void this.publishPendingOutbox();
    }, readIntegerEnv("OUTBOX_PUBLISH_INTERVAL_MS", 250));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.publisherTimer) {
      clearInterval(this.publisherTimer);
    }

    await this.channel?.close();
    await this.connection?.close();
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
    await this.channel.prefetch(10);
    await this.channel.consume(
      WALLET_COMMAND_QUEUE,
      (message) => {
        void this.handleCommandMessage(message);
      },
      { noAck: false },
    );
    await this.publishPendingOutbox();
  }

  private async handleCommandMessage(
    message: ConsumeMessage | null,
  ): Promise<void> {
    if (!message || !this.channel) {
      return;
    }

    try {
      const command = JSON.parse(message.content.toString("utf8")) as
        | WalletCommandDto
        | undefined;

      if (!command?.idempotencyKey) {
        this.channel.ack(message);
        return;
      }

      const previousOutcome = await this.walletsRepository.findInboxResult(
        command.idempotencyKey,
      );
      const outcome =
        previousOutcome ?? (await this.executeCommandAsOutcome(command));

      if (!previousOutcome) {
        await this.walletsRepository.saveInboxResult(
          command.idempotencyKey,
          outcome,
        );
        await this.walletsRepository.enqueueOutbox(
          WALLET_COMMAND_RESULT_ROUTING_KEY,
          outcome,
        );
      }

      await this.publishPendingOutbox();
      this.channel.ack(message);
    } catch (error) {
      console.error("Wallet command processing failed", error);
      this.channel.nack(message, false, true);
    }
  }

  private async executeCommandAsOutcome(
    command: WalletCommandDto,
  ): Promise<WalletCommandOutcomeDto> {
    try {
      return await this.walletsService.executeCommand(command);
    } catch (error) {
      if (error instanceof WalletDomainError) {
        return {
          accepted: false,
          correlationId: command.correlationId,
          idempotencyKey: command.idempotencyKey,
          idempotent: false,
          metadata: command.metadata ?? {},
          occurredAt: new Date().toISOString(),
          playerId: command.playerId,
          rejectionCode: error.code,
          rejectionMessage: error.message,
        } satisfies WalletCommandRejectedDto;
      }

      throw error;
    }
  }

  private async publishPendingOutbox(): Promise<void> {
    if (!this.channel) {
      return;
    }

    const messages = await this.walletsRepository.listUnpublishedOutbox(50);

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
      await this.walletsRepository.markOutboxPublished(message.id);
    }
  }
}

function readIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
