import { ApiProperty } from '@nestjs/swagger';

import { UserResponseDto } from '@/common/dtos/response/user-response.dto';
import { JwtTokenResponseDto } from '@/modules/auth/dto/response/jwt-token-response.dto';

export class AuthResponseDto extends JwtTokenResponseDto {
  @ApiProperty({ type: () => UserResponseDto })
  user: UserResponseDto;
}
