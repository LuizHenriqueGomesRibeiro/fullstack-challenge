import { OnModuleDestroy } from "@nestjs/common";
import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { RealtimeEventDto } from "@crash/contracts";
import type { Subscription } from "rxjs";
import type { Server } from "socket.io";
import { GameEngineService } from "../../application/game-engine.service";

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class GamesEventsGateway implements OnGatewayInit, OnModuleDestroy {
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

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private emit(event: RealtimeEventDto): void {
    this.server.emit(event.type, event);
  }
}
