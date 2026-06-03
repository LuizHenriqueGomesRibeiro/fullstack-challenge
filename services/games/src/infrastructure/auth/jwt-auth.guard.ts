import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtVerifierService } from "./jwt-verifier.service";
import type { AuthenticatedRequest } from "./authenticated-player.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly verifier: JwtVerifierService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Bearer token is required.");
    }

    request.authenticatedPlayer = await this.verifier.verifyToken(
      header.slice("Bearer ".length).trim(),
    );

    return true;
  }
}
