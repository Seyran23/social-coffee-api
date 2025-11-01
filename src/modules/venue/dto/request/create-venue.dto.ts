import { ApiProperty } from '@nestjs/swagger';
import { VenueStatus } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class CreateVenueDto {
  @ApiProperty({
    description: 'Name of the venue',
    example: 'Starbucks Reserve Roastery',
    type: String,
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Google Maps or other map service URL for the venue location',
    example: 'https://maps.google.com/?q=40.7128,-74.0060',
    format: 'uri',
    type: String,
  })
  @IsUrl()
  mapUrl: string;

  @ApiProperty({
    description: 'Geofence radius in meters for check-in validation',
    example: 150,
    type: Number,
    default: 150,
    minimum: 50,
    maximum: 1000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(1000)
  geofenceMeters?: number;

  @ApiProperty({
    description: 'Current status of the venue',
    enum: VenueStatus,
    example: VenueStatus.ACTIVE,
    default: VenueStatus.ACTIVE,
    enumName: 'VenueStatus',
  })
  @IsEnum(VenueStatus)
  status: VenueStatus;
}
