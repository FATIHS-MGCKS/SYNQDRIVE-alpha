import { legalLifecycleFieldErrorId, legalUploadFieldErrorId } from './legal-documents-a11y';

export type ErrorMap = Record<string, string | undefined>;

export function legalUploadInputA11y(field: string, errors: ErrorMap) {
  const message = errors[field];
  if (!message) return {};
  return {
    'aria-invalid': true as const,
    'aria-describedby': legalUploadFieldErrorId(field),
  };
}

export function legalLifecycleInputA11y(field: string, errors: ErrorMap) {
  const message = errors[field];
  if (!message) return {};
  return {
    'aria-invalid': true as const,
    'aria-describedby': legalLifecycleFieldErrorId(field),
  };
}
