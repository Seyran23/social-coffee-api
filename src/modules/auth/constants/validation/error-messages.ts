import {
  BIO_MAX_LENGTH,
  BIO_MIN_LENGTH,
  EMAIL_MAX_LENGTH,
  MAX_AGE,
  MIN_AGE,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@/modules/auth/constants/validation/general';

export const ERROR_MESSAGES = {
  PASSWORD_TOO_SHORT: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  PASSWORD_TOO_LONG: `Password must not exceed ${PASSWORD_MAX_LENGTH} characters`,
  PASSWORD_WEAK:
    'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  PASSWORDS_DO_NOT_MATCH: 'Passwords do not match',

  FIRST_NAME_REQUIRED: 'First name is required',
  FIRST_NAME_TOO_SHORT: `First name must be at least ${NAME_MIN_LENGTH} characters`,
  FIRST_NAME_TOO_LONG: `First name must not exceed ${NAME_MAX_LENGTH} characters`,
  FIRST_NAME_INVALID:
    'First name can only contain letters, spaces, hyphens, and apostrophes',

  LAST_NAME_REQUIRED: 'Last name is required',
  LAST_NAME_TOO_SHORT: `Last name must be at least ${NAME_MIN_LENGTH} characters`,
  LAST_NAME_TOO_LONG: `Last name must not exceed ${NAME_MAX_LENGTH} characters`,
  LAST_NAME_INVALID:
    'Last name can only contain letters, spaces, hyphens, and apostrophes',

  EMAIL_REQUIRED: 'Email is required',
  EMAIL_INVALID: 'Invalid email format',
  EMAIL_TOO_LONG: `Email must not exceed ${EMAIL_MAX_LENGTH} characters`,

  BIO_REQUIRED: 'Bio is required',
  BIO_TOO_SHORT: `Bio must be at least ${BIO_MIN_LENGTH} characters`,
  BIO_TOO_LONG: `Bio must not exceed ${BIO_MAX_LENGTH} characters`,

  INVALID_AGE: `Invalid age range, can be between ${MIN_AGE} and ${MAX_AGE} years old`,

  GENDER_REQUIRED: 'Gender is required',
  GENDER_INVALID: 'Gender must be one of: MALE, FEMALE, OTHER',
} as const;
