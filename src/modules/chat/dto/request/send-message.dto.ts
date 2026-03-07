import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description: 'Chat session ID',
    example: 'clx123abc456',
  })
  @IsUUID()
  @IsNotEmpty()
  chatSessionId: string;

  @ApiProperty({
    description: 'Message content',
    example: 'Hey! How are you?',
    minLength: 1,
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(500)
  content: string;
}
