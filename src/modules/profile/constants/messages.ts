export const PROFILE_MESSAGES = {
  PROFILE_FETCHED: 'Profile fetched successfully',
  PROFILE_FEED_FETCHED: 'Profile feed fetched successfully',
  PROFILE_UPDATED: 'Profile updated successfully',
  IMAGE_UPLOADED: 'Profile image uploaded successfully',
  IMAGE_DELETED: 'Profile image deleted successfully',

  PROFILE_NOT_FOUND: 'Profile not found',
  USER_NOT_FOUND: 'User not found',
  NO_FILE_PROVIDED: 'No file provided',
  NO_IMAGE_TO_DELETE: 'No profile image to delete',
  IMAGE_UPLOAD_FAILED: 'Failed to upload profile image',
  IMAGE_DELETE_FAILED: 'Failed to delete profile image',
  PROFILE_UPDATE_FAILED: 'Failed to update profile',

  INVALID_FILE_TYPE:
    'Invalid file type. Only JPEG, PNG, and WebP images are allowed',
  FILE_TOO_LARGE: 'File size exceeds 5MB limit',
  INVALID_USER_ID: 'Invalid user ID format',
  INVALID_INTEREST_IDS: 'Invalid interest IDs provided',
} as const;
