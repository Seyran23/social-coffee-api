import * as fs from 'fs';
import * as path from 'path';

import { VenueStatus } from '@prisma/client';

import { generateQRCodeDataURL } from '../../src/modules/venue/utils/qr-code.util';

import { CENTER, prisma, step, VENUES } from './config';

/** Create the five demo venues clustered around CENTER. */
export async function seedVenues(): Promise<void> {
  for (const venue of VENUES) {
    const latitude = CENTER.latitude + venue.latOffset;
    const longitude = CENTER.longitude + venue.lonOffset;

    await prisma.venue.upsert({
      where: { id: venue.id },
      update: {},
      create: {
        id: venue.id,
        name: venue.name,
        mapUrl: `https://maps.google.com/?q=${latitude},${longitude}`,
        latitude,
        longitude,
        geofenceMeters: 150,
        status: VenueStatus.ACTIVE,
      },
    });
  }

  step(
    `${VENUES.length} venues near (${CENTER.latitude}, ${CENTER.longitude})`,
  );
}

/**
 * Write a scannable QR per venue. Each encodes only the venue id — that is
 * exactly what the check-in endpoint expects from a scan.
 */
export async function saveVenueQrCodes(): Promise<void> {
  const outputDir = path.join(__dirname, '..', 'seed-output', 'qrcodes');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const venue of VENUES) {
    const dataUrl = await generateQRCodeDataURL(venue.id);
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    const fileName = `${venue.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    fs.writeFileSync(
      path.join(outputDir, fileName),
      Buffer.from(base64, 'base64'),
    );
  }

  step('QR codes written to prisma/seed-output/qrcodes/');
}
