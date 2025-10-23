import { ApiProperty } from '@nestjs/swagger';
import { Gender, Role } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class UserResponseDto {
  @Expose()
  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'User unique identifier',
  })
  id: string;

  @Expose()
  @ApiProperty({ example: 'john@example.com' })
  email: string;

  @Expose()
  @ApiProperty({ example: 'John' })
  firstName: string;

  @Expose()
  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @Expose()
  @ApiProperty({ enum: Gender, example: Gender.MALE })
  gender: Gender;

  @Expose()
  @ApiProperty({ enum: Role, example: Role.USER })
  role: Role;

  @Expose()
  @ApiProperty({ example: 'https://example.com/avatar.jpg', nullable: true })
  profileImageUrl: string | null;

  @Expose()
  @ApiProperty({ example: 'Hello, I love meeting new people!' })
  bio: string;

  @Expose()
  @ApiProperty({ example: '1990-01-01T00:00:00.000Z' })
  birthDate: Date;

  @Expose()
  @ApiProperty({ example: '2024-01-15T10:30:00.000Z' })
  createdAt: Date;
}
