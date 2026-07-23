import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  HANDOVER_SIGNATURE_ALLOWED_MIMES,
  HANDOVER_SIGNATURE_MAX_BYTES,
} from '../../handover-error.codes';

export function parseHandoverSignatureDataUrl(value: string): {
  mime: string;
  decodedBytes: number;
} | null {
  const trimmed = value.trim();
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(trimmed);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  if (!HANDOVER_SIGNATURE_ALLOWED_MIMES.has(mime)) return null;

  const base64 = match[2].replace(/\s/g, '');
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const decodedBytes = Math.floor((base64.length * 3) / 4) - padding;
  if (decodedBytes <= 0 || decodedBytes > HANDOVER_SIGNATURE_MAX_BYTES) return null;

  return { mime, decodedBytes };
}

@ValidatorConstraint({ name: 'isHandoverSignatureDataUrl', async: false })
export class IsHandoverSignatureDataUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value == null || value === '') return true;
    if (typeof value !== 'string') return false;
    return parseHandoverSignatureDataUrl(value) !== null;
  }

  defaultMessage(): string {
    return `Signature must be a data URL (${[...HANDOVER_SIGNATURE_ALLOWED_MIMES].join(', ')}) up to ${HANDOVER_SIGNATURE_MAX_BYTES / 1024} KB`;
  }
}

export function IsHandoverSignatureDataUrl(validationOptions?: ValidationOptions) {
  return function handoverSignatureDecorator(object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsHandoverSignatureDataUrlConstraint,
    });
  };
}
