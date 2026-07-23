import type { ValidationError } from 'class-validator';

export interface FieldValidationError {
  field: string;
  messageKey: string;
  constraints?: Record<string, unknown>;
}

function isMessageKey(value: string): boolean {
  return value.includes('.') && !value.includes(' ');
}

function constraintContext(error: ValidationError, constraintKey: string): Record<string, unknown> | undefined {
  const context = error.contexts?.[constraintKey];
  return context && typeof context === 'object' ? (context as Record<string, unknown>) : undefined;
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parentField = '',
): FieldValidationError[] {
  const flattened: FieldValidationError[] = [];

  for (const error of errors) {
    const field = parentField ? `${parentField}.${error.property}` : error.property;

    if (error.constraints) {
      for (const [constraintKey, message] of Object.entries(error.constraints)) {
        const messageKey =
          typeof message === 'string' && isMessageKey(message)
            ? message
            : `validation.${field}.${constraintKey}`;
        flattened.push({
          field,
          messageKey,
          constraints: constraintContext(error, constraintKey),
        });
      }
    }

    if (error.children?.length) {
      flattened.push(...flattenValidationErrors(error.children, field));
    }
  }

  return flattened;
}

export function buildValidationFailedResponse(errors: ValidationError[]) {
  const fieldErrors = flattenValidationErrors(errors);
  return {
    statusCode: 400,
    message: 'Validation failed',
    code: 'VALIDATION_FAILED',
    fieldErrors,
  };
}
