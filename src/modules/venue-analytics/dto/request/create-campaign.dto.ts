import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCampaignDto {
  @ApiProperty({
    description: 'Campaign name',
    example: 'Happy Hour — 20% off lattes 2-4pm',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description: 'Campaign start (ISO date)',
    example: '2026-07-01T00:00:00.000Z',
  })
  @IsISO8601()
  startDate: string;

  @ApiProperty({
    description: 'Campaign end (ISO date)',
    example: '2026-07-15T00:00:00.000Z',
  })
  @IsISO8601()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Human-readable offer description',
    example: '20% off all lattes between 2pm and 4pm',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  offer?: string;
}
