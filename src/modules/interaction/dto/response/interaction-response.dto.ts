import { ApiProperty } from '@nestjs/swagger';

class InteractionUserDto {
  @ApiProperty({ example: 'clx123user' })
  id: string;

  @ApiProperty({ example: 'John' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;

  @ApiProperty({
    example: 'https://res.cloudinary.com/image.jpg',
    nullable: true,
  })
  profileImageUrl: string | null;
}

export class InteractionResponseDto {
  @ApiProperty({
    description: 'Interaction ID',
    example: 'clx123interaction',
  })
  id: string;

  @ApiProperty({
    description: 'Venue ID where the interaction occurred',
    example: 'clx123venue',
  })
  venueId: string;

  @ApiProperty({
    description: 'The user involved in the interaction',
    type: InteractionUserDto,
  })
  user: InteractionUserDto;

  @ApiProperty({
    description: 'When the interaction was created',
    example: '2025-11-06T20:00:00.000Z',
  })
  createdAt: Date;
}
