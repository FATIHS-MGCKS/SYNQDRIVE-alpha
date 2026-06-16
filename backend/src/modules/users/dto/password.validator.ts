import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { MIN_USER_PASSWORD_LENGTH } from '@shared/auth/permission.constants';

@ValidatorConstraint({ name: 'isOptionalPassword', async: false })
export class IsOptionalPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value !== 'string') return false;
    return (
      value.length >= MIN_USER_PASSWORD_LENGTH && value.length <= 128
    );
  }

  defaultMessage(): string {
    return `password must be at least ${MIN_USER_PASSWORD_LENGTH} characters`;
  }
}

export function IsOptionalPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsOptionalPasswordConstraint,
    });
  };
}
