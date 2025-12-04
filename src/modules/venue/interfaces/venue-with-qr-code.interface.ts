import { type Venue } from '@prisma/client';

export interface VenueWithQRCode extends Venue {
  qrCode: string;
}
