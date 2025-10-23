import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

import { MAX_AGE, MIN_AGE } from '@/modules/auth/constants/validation/general';

export function IsValidAge(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValidAge',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (!(value instanceof Date) || isNaN(value.getTime())) {
            return false;
          }

          const today = new Date();
          const birthDate = new Date(value);

          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();

          if (
            monthDiff < 0 ||
            (monthDiff === 0 && today.getDate() < birthDate.getDate())
          ) {
            age--;
          }

          return age >= MIN_AGE && age <= MAX_AGE;
        },

        defaultMessage(args: ValidationArguments) {
          const age = (args.object as any).__age;

          if (age < MIN_AGE) {
            return `You must be at least ${MIN_AGE} years old.`;
          }
          if (age > MAX_AGE) {
            return `You cannot be older than ${MAX_AGE} years.`;
          }
          return `${args.property} validation failed.`;
        },
      },
    });
  };
}
