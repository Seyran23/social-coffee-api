import { ApiProperty } from '@nestjs/swagger';

class UserBasicInfo {
  @ApiProperty({ example: 'clx123user' })
  id: string;

  @ApiProperty({ example: 'John' })
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  lastName: string;
}

class VenueBasicInfo {
  @ApiProperty({ example: 'clx123venue' })
  id: string;

  @ApiProperty({ example: 'Starbucks Reserve Roastery' })
  name: string;
}

export class ChatSessionResponseDto {
  @ApiProperty({
    description: 'Chat session ID',
    example: 'clx123abc456',
  })
  id: string;

  @ApiProperty({
    description: 'Chat status',
    example: 'ACTIVE',
    enum: ['ACTIVE', 'ENDED', 'EXPIRED'],
  })
  status: string;

  @ApiProperty({
    description: 'When chat started',
    example: '2025-11-06T20:00:00.000Z',
  })
  startedAt: Date;

  @ApiProperty({
    description: 'When chat expires',
    example: '2025-11-06T20:30:00.000Z',
  })
  expiresAt: Date;

  @ApiProperty({
    description: 'Chat partner',
    type: UserBasicInfo,
  })
  partner: UserBasicInfo;

  @ApiProperty({
    description: 'Venue',
    type: VenueBasicInfo,
  })
  venue: VenueBasicInfo;
}
