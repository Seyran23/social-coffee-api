import { ApiProperty } from '@nestjs/swagger';

export class InterestDto {
  @ApiProperty({
    description: 'Unique identifier for the interest',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Name of the interest',
    example: 'Photography',
  })
  name: string;
}
