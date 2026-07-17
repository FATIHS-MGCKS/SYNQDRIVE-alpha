import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  assertValidCoordinatePair,
  assertValidOpeningHours,
  assertValidStationCapacity,
  assertValidStationCreateStatus,
  assertValidStationTimezone,
} from '../station-create-validation.util';
import { StationStatus } from '@prisma/client';
import {
  assertPickupReturnCapabilitiesConsistent,
} from '../station-create-validation.util';

@ValidatorConstraint({ name: 'stationCoordinatePair', async: false })
export class StationCoordinatePairConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as { latitude?: number | null; longitude?: number | null };
    try {
      assertValidCoordinatePair(obj.latitude, obj.longitude);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'latitude and longitude must be provided together as a valid pair';
  }
}

export function IsStationCoordinatePair(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isStationCoordinatePair',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: StationCoordinatePairConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'stationIanaTimezone', async: false })
export class StationIanaTimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return true;
    if (typeof value !== 'string') return false;
    try {
      assertValidStationTimezone(value);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'timezone must be a valid IANA timezone (e.g. Europe/Berlin)';
  }
}

export function IsStationIanaTimezone(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isStationIanaTimezone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: StationIanaTimezoneConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'stationCreateCapacity', async: false })
export class StationCreateCapacityConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    try {
      assertValidStationCapacity(value as number | null | undefined);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'capacity must be null or a positive integer';
  }
}

export function IsStationCreateCapacity(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isStationCreateCapacity',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: StationCreateCapacityConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'stationCreateStatus', async: false })
export class StationCreateStatusConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    try {
      assertValidStationCreateStatus(value as StationStatus);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'new stations cannot be created with ARCHIVED status';
  }
}

export function IsAllowedStationCreateStatus(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isAllowedStationCreateStatus',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: StationCreateStatusConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'stationOpeningHours', async: false })
export class StationOpeningHoursConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    try {
      assertValidOpeningHours(value as Record<string, unknown> | string | null | undefined);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'openingHours structure is invalid';
  }
}

export function IsValidStationOpeningHours(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValidStationOpeningHours',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: StationOpeningHoursConstraint,
    });
  };
}

@ValidatorConstraint({ name: 'stationPickupReturnConsistent', async: false })
export class StationPickupReturnConsistentConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as {
      status?: StationStatus;
      pickupEnabled?: boolean;
      returnEnabled?: boolean;
      afterHoursReturnEnabled?: boolean;
      isPrimary?: boolean;
    };
    try {
      assertPickupReturnCapabilitiesConsistent(obj);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return 'pickup/return capabilities are inconsistent';
  }
}

