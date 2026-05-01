import { IsLatitude, IsLongitude, IsOptional } from 'class-validator';

export class HeartbeatDto {
  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;
}
