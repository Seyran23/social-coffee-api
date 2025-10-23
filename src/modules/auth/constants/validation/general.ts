export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 50;
export const NAME_REGEX = /^[a-zA-Z\s'-]+$/;

export const EMAIL_MAX_LENGTH = 255;

export const BIO_MAX_LENGTH = 500;
export const BIO_MIN_LENGTH = 10;

export const MIN_AGE = 18;
export const MAX_AGE = 120;
