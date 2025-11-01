import { ApiProperty } from '@nestjs/swagger';
import { VenueStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ChangeStatusDto {
  @ApiProperty({
    description: 'Venue status',
    enum: VenueStatus,
    example: VenueStatus.ACTIVE,
  })
  @IsEnum(VenueStatus)
  status: VenueStatus;
}
