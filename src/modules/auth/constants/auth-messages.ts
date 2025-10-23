export const AUTH_MESSAGES = {
  // ===== SUCCESS MESSAGES =====
  REGISTER_SUCCESS: 'Account created successfully',
  LOGIN_SUCCESS: 'Signed in successfully',
  LOG_OUT_SUCCESS: 'Signed out successfully',
  LOG_OUT_ALL_DEVICES_SUCCESS: 'Signed out from all devices successfully',
  TOKEN_REFRESHED_SUCCESS: 'Token refreshed successfully',
  PASSWORD_RESET_SUCCESS: 'Password reset successfully',
  FORGOT_PASSWORD_SUCCESS:
    'If an account is registered with that email address, you will receive password recovery instructions shortly.',

  // ===== AUTHENTICATION ERRORS =====
  INVALID_CREDENTIALS: 'Invalid email or password',
  EMAIL_ALREADY_EXISTS: 'An account with this email already exists',
  ACCOUNT_NOT_FOUND: 'Account not found',
  ACCOUNT_INACTIVE: 'Your account is inactive. Please contact support',
  RESET_PASSWORD_GENERIC:
    'If an account with this email exists, password reset instructions have been generated.',
  INSUFFICIENT_PERMISSIONS:
    'You do not have sufficient permissions to perform this action.',

  // ===== TOKEN ERRORS =====
  TOKEN_EXPIRED: 'Your session has expired. Please sign in again',
  INVALID_TOKEN: 'Invalid or malformed token',
  INVALID_TOKEN_OR_USER_DEACTIVATED: 'Session is invalid or user deactivated.',
  TOKEN_REVOKED: 'This token has been revoked',
  REFRESH_TOKEN_NOT_FOUND:
    'Refresh token not found or has expired. Please sign in again',
  RESET_TOKEN_INVALID:
    'Password reset link is invalid or has expired. Please request a new one',

  // ===== SECURITY ERRORS =====
  TOO_MANY_ATTEMPTS: 'Too many login attempts. Please try again in 15 minutes',

  // ===== SESSION ERRORS =====
  SESSION_EXPIRED: 'Your session has expired. Please sign in again',

  // ===== GENERIC AUTH ERRORS =====
  UNAUTHORIZED: 'You must be signed in to access this resource',
  FORBIDDEN: 'You do not have permission to perform this action',
  AUTHENTICATION_FAILED: 'Authentication failed. Please try again',
} as const;
