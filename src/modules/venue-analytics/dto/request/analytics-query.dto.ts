import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Start of the window (ISO date). Defaults to 30 days ago.',
    example: '2026-06-25T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'End of the window (ISO date). Defaults to now.',
    example: '2026-07-25T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
