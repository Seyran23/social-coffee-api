import { ApiProperty } from '@nestjs/swagger';
import { VenueStatus } from '@prisma/client';

export class VenueResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the venue',
    example: 'clx1234567890abcdef',
    type: String,
  })
  id: string;

  @ApiProperty({
    description: 'Name of the venue',
    example: 'Starbucks Reserve Roastery',
    type: String,
  })
  name: string;

  @ApiProperty({
    description: 'Google Maps or other map service URL for the venue location',
    example: 'https://maps.google.com/?q=40.7128,-74.0060',
    format: 'uri',
    type: String,
  })
  mapUrl: string;

  @ApiProperty({
    description: 'Latitude coordinate of the venue location',
    example: 40.7128,
    type: Number,
    required: false,
    nullable: true,
  })
  latitude: number | null;

  @ApiProperty({
    description: 'Longitude coordinate of the venue location',
    example: -74.006,
    type: Number,
    required: false,
    nullable: true,
  })
  longitude: number | null;

  @ApiProperty({
    description: 'Geofence radius in meters for check-in validation',
    example: 150,
    type: Number,
  })
  geofenceMeters: number;

  @ApiProperty({
    description: 'Current status of the venue',
    enum: VenueStatus,
    example: VenueStatus.ACTIVE,
    enumName: 'VenueStatus',
  })
  status: VenueStatus;

  @ApiProperty({
    description: 'Timestamp when the venue was created',
    example: '2024-01-15T10:30:00.000Z',
    type: Date,
    format: 'date-time',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Timestamp when the venue was last updated',
    example: '2024-01-15T14:45:00.000Z',
    type: Date,
    format: 'date-time',
  })
  updatedAt: Date;
}
