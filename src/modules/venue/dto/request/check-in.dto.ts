import { ApiProperty } from '@nestjs/swagger';
import { IsLatitude, IsLongitude, IsNumber } from 'class-validator';

export class CheckInDto {
  @ApiProperty({
    description: 'User current latitude',
    example: 47.4979,
  })
  @IsNumber()
  @IsLatitude()
  latitude: number;

  @ApiProperty({
    description: 'User current longitude',
    example: 19.0402,
  })
  @IsNumber()
  @IsLongitude()
  longitude: number;
}
