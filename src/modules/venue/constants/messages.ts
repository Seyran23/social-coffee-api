export const VENUE_MESSAGES = {
  VENUES_RETRIEVED: 'Venues retrieved successfully',
  VENUE_RETRIEVED: 'Venue retrieved successfully',
  VENUE_CREATED: 'Venue created successfully',
  VENUE_UPDATED: 'Venue updated successfully',
  VENUE_STATUS_UPDATED: 'Venue status updated successfully',
  VENUE_DELETED: 'Venue deleted successfully',
  QRCODE_GENERATED: 'QR code generated successfully',
  GEOFENCE_CHECKED: 'Geofence check completed',
  CHECK_IN_SUCCESS: 'Successfully checked in to venue',
  CHECK_OUT_SUCCESS: 'Successfully checked out from venue',

  VENUE_NOT_FOUND: 'Venue not found',
  INVALID_MAP_URL: 'Invalid Google Maps URL. Could not extract coordinates.',
  VENUE_COORDINATES_UNAVAILABLE:
    'Venue coordinates not available for geofence check',
  OUTSIDE_GEOFENCE:
    'You are too far from the venue. Please get closer to check in.',
  ALREADY_CHECKED_IN: 'You are already checked in to this venue',
  COORDINATES_NOT_SETUP:
    'This venue does not have coordinates set up. Please contact support.',
  NOT_CHECKED_IN: 'You are not checked in to this venue',
  VENUE_NOT_AVAILABLE: 'This venue is currently not available for check-in',
  VENUE_TEMPORARILY_CLOSED: 'This venue is temporarily closed',
  VENUE_PERMANENTLY_CLOSED: 'This venue is permanently closed',
} as const;
