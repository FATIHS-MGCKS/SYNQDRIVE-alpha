import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isIso4217CurrencyCode } from './iso4217-currency-codes';

@ValidatorConstraint({ name: 'isIso4217Currency', async: false })
export class IsIso4217CurrencyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (trimmed.length !== 3) return false;
    return isIso4217CurrencyCode(trimmed);
  }

  defaultMessage(args: ValidationArguments): string {
    return (
      (args.constraints?.[0] as string | undefined) ??
      'rentalRules.validation.depositCurrency.iso4217'
    );
  }
}

export function IsIso4217Currency(
  messageKey = 'rentalRules.validation.depositCurrency.iso4217',
  validationOptions?: ValidationOptions,
) {
  return function register(object: object, propertyName: string) {
    registerDecorator({
      name: 'isIso4217Currency',
      target: object.constructor,
      propertyName,
      constraints: [messageKey],
      options: validationOptions,
      validator: IsIso4217CurrencyConstraint,
    });
  };
}
