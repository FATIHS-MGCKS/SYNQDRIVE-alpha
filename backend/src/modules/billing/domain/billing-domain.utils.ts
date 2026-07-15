import { Logger } from '@nestjs/common';

const domainLogger = new Logger('BillingDomain');

export function logUnknownExternalValue(
  context: string,
  value: string | null | undefined,
): void {
  if (!value) return;
  domainLogger.warn(`Unknown external billing value in ${context}: ${value}`);
}

export function isKnownEnumValue<T extends string>(
  values: readonly T[],
  value: string | null | undefined,
): value is T {
  return value != null && (values as readonly string[]).includes(value);
}

export function mapExternalValue<T extends string>(opts: {
  context: string;
  value: string | null | undefined;
  map: Readonly<Record<string, T>>;
  fallback: T;
  logUnknown?: boolean;
}): T {
  const raw = opts.value?.trim();
  if (!raw) return opts.fallback;
  const mapped = opts.map[raw];
  if (mapped) return mapped;
  if (opts.logUnknown !== false) {
    logUnknownExternalValue(opts.context, raw);
  }
  return opts.fallback;
}

/** Compile-time exhaustiveness for switch statements. */
export function assertNever(value: never, context: string): never {
  throw new Error(`Unhandled billing domain value in ${context}: ${String(value)}`);
}
