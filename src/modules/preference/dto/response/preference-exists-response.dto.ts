import { ApiProperty } from '@nestjs/swagger';

export class PreferenceExistsResponseDto {
  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'Indicates whether the user has preferences set',
  })
  exists: boolean;
}
