import { ApiProperty } from '@nestjs/swagger';

import { VenueResponseDto } from '@/modules/venue/dto/response/venue-response.dto';

export class VenueWithQrCodeDto extends VenueResponseDto {
  @ApiProperty({
    description: 'Base64 encoded QR code image for venue check-in',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
    type: String,
  })
  qrCode: string;
}
