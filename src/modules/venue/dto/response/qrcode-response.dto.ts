import { ApiProperty } from '@nestjs/swagger';

export class QRCodeResponseDto {
  @ApiProperty({
    description: 'Venue ID',
    example: 'clx123abc',
  })
  venueId: string;

  @ApiProperty({
    description: 'QR code as base64 data URL',
    example: 'data:image/png;base64,iVBORw0KGgo...',
  })
  qrCode: string;
}
