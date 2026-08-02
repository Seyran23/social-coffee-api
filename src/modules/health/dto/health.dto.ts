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

  @ApiProperty({
    description:
      'Git commit SHA this instance was deployed from. "dev" outside of a deploy.',
    example: 'a1b2c3d4e5f6789...',
    type: String,
  })
  commit: string;
}
