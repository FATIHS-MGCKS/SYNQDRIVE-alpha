import type { CanonicalField, FieldPresence, OperationalFieldSource } from './types';

export function presentField<T>(
  value: T,
  source: Exclude<OperationalFieldSource, 'absent'>,
): CanonicalField<T> {
  return {
    value,
    presence: 'present',
    source,
  };
}

export function absentField<T>(): CanonicalField<T> {
  return {
    value: undefined,
    presence: 'absent',
    source: 'absent',
  };
}

export function isFieldPresent<T>(
  field: CanonicalField<T>,
): field is CanonicalField<T> & { presence: 'present'; value: T } {
  return field.presence === 'present';
}

export function fieldPresence<T>(field: CanonicalField<T>): FieldPresence {
  return field.presence;
}
