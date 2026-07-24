import type { ExternalAccessMinimizationSpec } from './external-access-enforcement.types';

/** Filter object fields before AI prompt, export, or MCP output. */
export function minimizeRecordFields<T extends Record<string, unknown>>(
  record: T,
  spec?: ExternalAccessMinimizationSpec,
): Partial<T> {
  if (!spec) return record;

  const output: Record<string, unknown> = {};

  if (spec.allowedFields?.length) {
    for (const key of spec.allowedFields) {
      if (key in record) output[key] = record[key];
    }
    return output as Partial<T>;
  }

  const denied = new Set(spec.deniedFields ?? []);
  for (const [key, value] of Object.entries(record)) {
    if (!denied.has(key)) output[key] = value;
  }
  return output as Partial<T>;
}

/** Strip fields not in minimization spec before external AI inference. */
export function sanitizeAiPromptContext(
  context: Record<string, unknown>,
  spec?: ExternalAccessMinimizationSpec,
): Record<string, unknown> {
  if (!spec) return context;
  const minimized = minimizeRecordFields(context, spec);
  return {
    ...minimized,
    _accessMinimized: true,
  };
}

/** Recursively minimize MCP tool output arrays. */
export function minimizeMcpToolOutput(
  output: Record<string, unknown>,
  spec?: ExternalAccessMinimizationSpec,
): Record<string, unknown> {
  if (!spec) return output;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output)) {
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'object' && item !== null
          ? minimizeRecordFields(item as Record<string, unknown>, spec)
          : item,
      );
      continue;
    }
    if (typeof value === 'object' && value !== null) {
      result[key] = minimizeRecordFields(value as Record<string, unknown>, spec);
      continue;
    }
    result[key] = value;
  }
  result._outputMinimized = true;
  return result;
}
