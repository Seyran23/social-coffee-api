import { ConflictException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { plainToInstance } from 'class-transformer';

import { UserResponseDto } from '@/common/dtos/response/user-response.dto';
import { LoggerService } from '@/common/logger/logger.service';
import { PrismaService } from '@/database/prisma.service';
import { SALT_ROUNDS } from '@/modules/auth/constants/salt-rounds';
import { USER_MESSAGES } from '@/modules/user/constants/messages';
import { CreateUserDto } from '@/modules/user/dto/request/create-user.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly database: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const { email, password, role, bio, ...userData } = createUserDto;

    const existingUser = await this.database.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException(USER_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await this.database.user.create({
      data: {
        ...userData,
        email,
        passwordHash,
        bio: bio ?? '',
        birthDate: new Date(userData.birthDate),
        role: role ?? Role.CAFE_MANAGER,
      },
    });

    this.logger.log(`User created by admin: ${user.email} (${user.role})`);

    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }
}
