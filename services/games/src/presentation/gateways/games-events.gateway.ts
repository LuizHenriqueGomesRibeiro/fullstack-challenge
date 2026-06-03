import { OnModuleDestroy } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { RealtimeEventDto } from "@crash/contracts";
import type { Subscription } from "rxjs";
import type { Server, Socket } from "socket.io";
import { GameEngineService } from "../../application/game-engine.service";

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class GamesEventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server;

  private subscription?: Subscription;

  constructor(private readonly gameEngine: GameEngineService) {}

  afterInit(server: Server): void {
    this.server = server;
    this.subscription = this.gameEngine.realtimeEvents$.subscribe((event) =>
      this.emit(event),
    );
  }

  handleConnection(client: Socket): void {
    const lastSequence = readSequence(
      client.handshake.auth.lastSequence ?? client.handshake.query.lastSequence,
    );
    const events = this.gameEngine.getEventsAfter(lastSequence);

    if (events.length === 0) {
      return;
    }

    client.emit("events.replay", {
      sequence: this.gameEngine.currentSequence,
      type: "events.replay",
      payload: { events },
      occurredAt: new Date().toISOString(),
    } satisfies RealtimeEventDto<{ events: RealtimeEventDto[] }>);
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private emit(event: RealtimeEventDto): void {
    this.server.emit(event.type, event);
  }
}

function readSequence(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
