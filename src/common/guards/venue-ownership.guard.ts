import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';

import { RequestUser } from '@/common/interfaces/auth/request-user.interface';
import { PrismaService } from '@/database/prisma.service';
import { AUTH_MESSAGES } from '@/modules/auth/constants/auth-messages';
import { VENUE_MESSAGES } from '@/modules/venue/constants/messages';

@Injectable()
export class VenueOwnershipGuard implements CanActivate {
  constructor(private readonly database: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;

    if (!user) {
      throw new ForbiddenException(AUTH_MESSAGES.UNAUTHORIZED);
    }

    if (user.role === Role.ADMIN) {
      return true;
    }

    const venueId: string | undefined =
      request.params?.venueId ?? request.params?.id;

    if (!venueId) {
      throw new NotFoundException(VENUE_MESSAGES.VENUE_NOT_FOUND);
    }

    const venue = await this.database.venue.findUnique({
      where: { id: venueId },
      select: { ownerId: true },
    });

    if (!venue) {
      throw new NotFoundException(VENUE_MESSAGES.VENUE_NOT_FOUND);
    }

    if (venue.ownerId !== user.userId) {
      throw new ForbiddenException(AUTH_MESSAGES.INSUFFICIENT_PERMISSIONS);
    }

    return true;
  }
}
