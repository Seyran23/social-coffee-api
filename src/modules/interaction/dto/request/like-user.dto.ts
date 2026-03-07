import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LikeUserDto {
  @ApiProperty({
    description: 'ID of the user to like',
    example: 'clx123target456',
  })
  @IsString()
  @IsNotEmpty()
  targetUserId: string;

  @ApiProperty({
    description: 'ID of the venue where both users are checked in',
    example: 'clx123venue789',
  })
  @IsString()
  @IsNotEmpty()
  venueId: string;
}
