import { ApiProperty } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({
    description: 'Message ID',
    example: 'clx123msg456',
  })
  id: string;

  @ApiProperty({
    description: 'Chat session ID',
    example: 'clx123abc456',
  })
  chatSessionId: string;

  @ApiProperty({
    description: 'Sender user ID',
    example: 'clx123user789',
  })
  senderId: string;

  @ApiProperty({
    description: 'Message content',
    example: 'Hello! Nice to meet you!',
  })
  content: string;

  @ApiProperty({
    description: 'Message timestamp',
    example: '2025-11-06T20:30:00.000Z',
  })
  createdAt: Date;
}
