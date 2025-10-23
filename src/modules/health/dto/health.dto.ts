import { ApiProperty } from '@nestjs/swagger';

export class HealthDto {
  @ApiProperty({
    description: 'Application uptime in seconds',
    example: 123.456,
    type: Number,
  })
  uptime: number;

  @ApiProperty({
    description: 'Application version',
    example: '1.0.0',
    type: String,
  })
  version: string;
}
