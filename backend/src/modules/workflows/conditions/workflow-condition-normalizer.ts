import { WORKFLOW_CONDITION_ERROR_CODES } from './workflow-condition.types';
import type {
  WorkflowConditionDataType,
  WorkflowConditionClauseResult,
} from './workflow-condition.types';

const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export class ConditionValueError extends Error {
  constructor(
    message: string,
    readonly code: string = WORKFLOW_CONDITION_ERROR_CODES.INPUT_INVALID,
  ) {
    super(message);
  }
}

export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function parseStrictInteger(value: unknown, label = 'value'): number {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || Number.isNaN(value)) {
      throw new ConditionValueError(`${label} must be a valid integer`);
    }
    return value;
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isNaN(parsed)) {
      throw new ConditionValueError(`${label} must be a valid integer`);
    }
    return parsed;
  }
  throw new ConditionValueError(`${label} must be a valid integer`);
}

export function parseStrictDecimal(value: unknown, label = 'value'): string {
  if (typeof value === 'number') {
    if (Number.isNaN(value) || !Number.isFinite(value)) {
      throw new ConditionValueError(`${label} must be a valid decimal`);
    }
    return value.toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      throw new ConditionValueError(`${label} must be a valid decimal`);
    }
    if (Number.isNaN(Number(trimmed))) {
      throw new ConditionValueError(`${label} must be a valid decimal`);
    }
    return trimmed;
  }
  throw new ConditionValueError(`${label} must be a valid decimal`);
}

export function parseStrictBoolean(value: unknown, label = 'value'): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ConditionValueError(`${label} must be a valid boolean`);
}

export function parseStrictDatetime(value: unknown, label = 'value'): string {
  if (typeof value !== 'string' || !ISO_DATETIME.test(value)) {
    throw new ConditionValueError(`${label} must be an ISO-8601 datetime string`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new ConditionValueError(`${label} must be an ISO-8601 datetime string`);
  }
  return value;
}

export function parseStrictString(value: unknown, label = 'value'): string {
  if (typeof value !== 'string') {
    throw new ConditionValueError(`${label} must be a string`);
  }
  return value;
}

export function parseStrictEnum(
  value: unknown,
  allowed: readonly string[],
  label = 'value',
): string {
  const str = parseStrictString(value, label);
  if (!allowed.includes(str)) {
    throw new ConditionValueError(`${label} is not a supported enum value`);
  }
  return str;
}

export function parseStrictArray(value: unknown, label = 'value'): unknown[] {
  if (!Array.isArray(value)) {
    throw new ConditionValueError(`${label} must be an array`);
  }
  return value;
}

export function normalizeActualValue(
  dataType: WorkflowConditionDataType,
  actual: unknown,
  enumValues?: readonly string[],
): unknown {
  if (isNullish(actual)) return actual;
  switch (dataType) {
    case 'boolean':
      return parseStrictBoolean(actual, 'actual');
    case 'integer':
      return parseStrictInteger(actual, 'actual');
    case 'decimal':
      return parseStrictDecimal(actual, 'actual');
    case 'datetime':
      return parseStrictDatetime(actual, 'actual');
    case 'enum':
      return parseStrictEnum(actual, enumValues ?? [], 'actual');
    case 'string':
      return parseStrictString(actual, 'actual');
    case 'array':
      return parseStrictArray(actual, 'actual');
    default:
      throw new ConditionValueError('Unsupported data type');
  }
}

export function normalizeExpectedValue(
  dataType: WorkflowConditionDataType,
  expected: unknown,
  enumValues?: readonly string[],
): unknown {
  if (isNullish(expected)) return expected;
  switch (dataType) {
    case 'boolean':
      return parseStrictBoolean(expected, 'expected');
    case 'integer':
      return parseStrictInteger(expected, 'expected');
    case 'decimal':
      return parseStrictDecimal(expected, 'expected');
    case 'datetime':
      return parseStrictDatetime(expected, 'expected');
    case 'enum':
      return parseStrictEnum(expected, enumValues ?? [], 'expected');
    case 'string':
      return parseStrictString(expected, 'expected');
    case 'array':
      return parseStrictArray(expected, 'expected');
    default:
      throw new ConditionValueError('Unsupported data type');
  }
}

export function compareDecimals(a: string, b: string): number {
  const [aWhole, aFrac = ''] = a.split('.');
  const [bWhole, bFrac = ''] = b.split('.');
  const fracLen = Math.max(aFrac.length, bFrac.length);
  const aScaled = BigInt(aWhole) * BigInt(10 ** fracLen) + BigInt(aFrac.padEnd(fracLen, '0'));
  const bScaled = BigInt(bWhole) * BigInt(10 ** fracLen) + BigInt(bFrac.padEnd(fracLen, '0'));
  if (aScaled === bScaled) return 0;
  return aScaled > bScaled ? 1 : -1;
}

export function clauseError(
  fieldPath: string,
  operator: string,
  code: string,
  message: string,
  explain?: string,
): WorkflowConditionClauseResult {
  return {
    kind: 'clause',
    fieldPath,
    operator: operator as WorkflowConditionClauseResult['operator'],
    passed: false,
    errorCode: code,
    errorMessage: message,
    explain,
  };
}

export function safeExplainValue(dataType: WorkflowConditionDataType, value: unknown): string {
  if (isNullish(value)) return String(value);
  if (dataType === 'boolean') return '[boolean]';
  if (dataType === 'integer' || dataType === 'enum') {
    return `[${dataType}]`;
  }
  if (dataType === 'decimal' || dataType === 'datetime') {
    return `[${dataType}]`;
  }
  if (dataType === 'string') {
    return `[string:${String(value).length}]`;
  }
  if (dataType === 'array') {
    return `[array:${Array.isArray(value) ? value.length : 0}]`;
  }
  return '[value]';
}
