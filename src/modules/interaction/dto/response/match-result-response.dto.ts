import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class MatchPartnerDto {
  @ApiProperty({ example: 'clx123user' })
  id: string;

  @ApiProperty({ example: 'Jane' })
  firstName: string;

  @ApiProperty({ example: 'Smith' })
  lastName: string;
}

class MatchChatSessionDto {
  @ApiProperty({
    description: 'Chat session ID',
    example: 'clx123chat',
  })
  id: string;

  @ApiProperty({
    description: 'When the chat expires',
    example: '2025-11-06T20:10:00.000Z',
  })
  expiresAt: Date;

  @ApiProperty({
    description: 'Chat partner info',
    type: MatchPartnerDto,
  })
  partner: MatchPartnerDto;
}

export class MatchResultResponseDto {
  @ApiProperty({
    description: 'Whether a mutual match was found',
    example: true,
  })
  matched: boolean;

  @ApiPropertyOptional({
    description: 'Chat session details (only present when matched)',
    type: MatchChatSessionDto,
  })
  chatSession?: MatchChatSessionDto;
}
