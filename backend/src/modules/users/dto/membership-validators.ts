import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { PERMISSION_MODULE_KEYS } from '@shared/auth/permission.constants';

@ValidatorConstraint({ name: 'isMembershipPermissions', async: false })
export class IsMembershipPermissionsConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value !== 'object' || Array.isArray(value)) return false;

    const allowed = new Set<string>(PERMISSION_MODULE_KEYS);
    for (const [key, flags] of Object.entries(value as Record<string, unknown>)) {
      if (!allowed.has(key)) return false;
      if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return false;
      const f = flags as Record<string, unknown>;
      if (typeof f.read !== 'boolean' || typeof f.write !== 'boolean') return false;
      if (f.manage !== undefined && typeof f.manage !== 'boolean') return false;
    }
    return true;
  }

  defaultMessage(): string {
    return 'permissions must be a map of known modules to { read, write, manage? } flags';
  }
}

export function IsMembershipPermissions(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsMembershipPermissionsConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'isStationIds', async: false })
export class IsStationIdsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (!Array.isArray(value)) return false;
    if (value.length > 50) return false;
    return value.every(
      (id) => typeof id === 'string' && id.trim().length > 0 && id.length <= 64,
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be an array of station id strings (max 50)`;
  }
}

export function IsStationIds(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStationIdsConstraint,
    });
  };
}
