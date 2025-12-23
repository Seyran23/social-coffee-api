import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class DiscoverQueryDto {
  @ApiPropertyOptional({
    description: 'Maximum number of profiles to return',
    minimum: 1,
    maximum: 50,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Cursor for pagination (profile ID)',
    example: 'clx123abc456',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
