import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsUUID } from 'class-validator';

export class TypingIndicatorDto {
  @ApiProperty({
    description: 'Chat session ID',
    example: 'clx123abc456',
  })
  @IsUUID()
  chatSessionId: string;

  @ApiProperty({
    description: 'Whether user is typing',
    example: true,
  })
  @IsBoolean()
  isTyping: boolean;
}
