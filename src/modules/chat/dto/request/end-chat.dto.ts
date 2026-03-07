import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class EndChatDto {
  @ApiProperty({
    description: 'Chat session ID',
    example: 'clx123abc456',
  })
  @IsUUID()
  chatSessionId: string;
}
