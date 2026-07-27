import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AssignOwnerDto {
  @ApiProperty({
    description:
      'ID of the user to make the owner of this venue. The user is promoted to CAFE_MANAGER.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsNotEmpty()
  userId: string;
}
