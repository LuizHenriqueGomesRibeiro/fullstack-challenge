import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedPlayerDto } from "@crash/contracts";

export interface AuthenticatedRequest {
  authenticatedPlayer?: AuthenticatedPlayerDto;
  headers: {
    authorization?: string;
  };
}

export const CurrentPlayer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPlayerDto => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.authenticatedPlayer) {
      throw new Error("Authenticated player was not attached to the request.");
    }

    return request.authenticatedPlayer;
  },
);
