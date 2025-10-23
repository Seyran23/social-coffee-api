import { ApiProperty } from '@nestjs/swagger';

export class ResetTokenResponseDto {
  @ApiProperty({
    description: "The unique token required to reset the user's password.",
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.reset_token_here',
    type: String,
  })
  resetToken: string;
}
