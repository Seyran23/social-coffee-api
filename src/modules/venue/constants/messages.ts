export const VENUE_MESSAGES = {
  VENUES_RETRIEVED: 'Venues retrieved successfully',
  VENUE_RETRIEVED: 'Venue retrieved successfully',
  VENUE_CREATED: 'Venue created successfully',
  VENUE_UPDATED: 'Venue updated successfully',
  VENUE_STATUS_UPDATED: 'Venue status updated successfully',
  VENUE_DELETED: 'Venue deleted successfully',
  QRCODE_GENERATED: 'QR code generated successfully',
  GEOFENCE_CHECKED: 'Geofence check completed',

  VENUE_NOT_FOUND: 'Venue not found',
  INVALID_MAP_URL: 'Invalid Google Maps URL. Could not extract coordinates.',
  VENUE_COORDINATES_UNAVAILABLE:
    'Venue coordinates not available for geofence check',
} as const;
