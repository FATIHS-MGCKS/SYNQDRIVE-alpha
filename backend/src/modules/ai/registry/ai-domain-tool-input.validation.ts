import { isValidAiExecutionUuid } from '../execution/ai-execution-context.builder';
import type {
  AiDomainToolInputSchema,
  AiDomainToolSchemaField,
} from './ai-domain-tool-registry.types';

export interface AiDomainToolInputValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface AiDomainToolInputValidationResult {
  readonly valid: boolean;
  readonly issues: readonly AiDomainToolInputValidationIssue[];
  readonly normalized: Record<string, unknown> | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function issue(
  path: string,
  message: string,
): AiDomainToolInputValidationIssue {
  return { path, message };
}

function validateField(
  field: AiDomainToolSchemaField,
  rawValue: unknown,
): AiDomainToolInputValidationIssue | null {
  if (rawValue === undefined || rawValue === null) {
    if (field.required) {
      return issue(field.name, `${field.name} is required`);
    }
    return null;
  }

  if (field.type === 'string' && typeof rawValue !== 'string') {
    return issue(field.name, `${field.name} must be a string`);
  }
  if (field.type === 'boolean' && typeof rawValue !== 'boolean') {
    return issue(field.name, `${field.name} must be a boolean`);
  }
  if (field.type === 'number' && typeof rawValue !== 'number') {
    return issue(field.name, `${field.name} must be a number`);
  }

  if (field.type === 'string' && field.format === 'uuid') {
    const trimmed = (rawValue as string).trim();
    if (!UUID_PATTERN.test(trimmed) && !isValidAiExecutionUuid(trimmed)) {
      return issue(field.name, `${field.name} must be a valid UUID`);
    }
  }

  return null;
}

/**
 * Validates tool input against a registered schema — rejects unknown properties.
 */
export function validateAiDomainToolInput(
  schema: AiDomainToolInputSchema,
  rawInput: unknown,
): AiDomainToolInputValidationResult {
  const issues: AiDomainToolInputValidationIssue[] = [];

  if (rawInput == null || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return {
      valid: false,
      issues: [issue('input', 'input must be a plain object')],
      normalized: null,
    };
  }

  const record = rawInput as Record<string, unknown>;

  if (!schema.additionalProperties) {
    const allowed = new Set(schema.fields.map((field) => field.name));
    for (const key of Object.keys(record)) {
      if (!allowed.has(key)) {
        issues.push(issue(key, `unknown property "${key}"`));
      }
    }
  }

  const normalized: Record<string, unknown> = {};

  for (const field of schema.fields) {
    const fieldIssue = validateField(field, record[field.name]);
    if (fieldIssue) {
      issues.push(fieldIssue);
      continue;
    }

    const rawValue = record[field.name];
    if (rawValue === undefined || rawValue === null) {
      continue;
    }

    if (field.type === 'string' && field.format === 'uuid') {
      normalized[field.name] = (rawValue as string).trim().toLowerCase();
    } else {
      normalized[field.name] = rawValue;
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    normalized: issues.length === 0 ? normalized : null,
  };
}
