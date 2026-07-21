import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class GetNearbyVenuesQueryDto {
  @ApiProperty({
    description: "User's current latitude",
    example: 41.0082,
    type: Number,
  })
  @Type(() => Number)
  @IsLatitude()
  latitude: number;

  @ApiProperty({
    description: "User's current longitude",
    example: 28.9784,
    type: Number,
  })
  @Type(() => Number)
  @IsLongitude()
  longitude: number;

  @ApiPropertyOptional({
    description: 'Search radius in meters',
    example: 5000,
    minimum: 100,
    maximum: 50000,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(50000)
  radiusMeters?: number;
}
