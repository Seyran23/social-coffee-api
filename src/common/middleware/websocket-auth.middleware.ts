import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

import { JwtPayload } from '@/common/interfaces/auth/jwt-payload.interface';
import { AuthenticatedSocket } from '@/common/interfaces/websocket/authenticated-socket.interface';
import { LoggerService } from '@/common/logger/logger.service';

@Injectable()
export class WsAuthMiddleware {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(WsAuthMiddleware.name);
  }

  use() {
    return async (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
      try {
        await this.authenticateSocket(socket);

        next();
      } catch (error) {
        this.handleAuthError(error, next);
      }
    };
  }

  private async authenticateSocket(socket: AuthenticatedSocket): Promise<void> {
    const token = this.extractToken(socket);

    if (!token) {
      this.logger.warn(
        `Connection attempt without token from ${socket.handshake.address}`,
      );
      throw new Error('Authentication token required');
    }

    const payload = await this.verifyToken(token);

    socket.user = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      firstName: payload.firstName,
      lastName: payload.lastName,
    };

    this.logger.log(
      `User ${payload.sub} (${payload.email}) authenticated via WebSocket`,
    );
  }

  private async verifyToken(token: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      });

      return payload;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      throw new Error('Invalid or expired token');
    }
  }

  private extractToken(socket: Socket): string | null {
    if (socket.handshake.auth?.token) {
      return socket.handshake.auth.token;
    }

    const queryToken = socket.handshake.query?.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }

    const authHeader = socket.handshake.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  private handleAuthError(error: any, next: (err?: Error) => void): void {
    this.logger.error('WebSocket authentication failed:', error.message);

    const errorMessage =
      error.message ?? 'Authentication failed. Please reconnect.';

    next(new Error(errorMessage));
  }
}
