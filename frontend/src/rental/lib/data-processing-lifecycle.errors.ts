export interface LifecycleApiError {
  status?: number;
  code?: string;
  message: string;
  isConflict: boolean;
  missing?: string[];
}

export function parseLifecycleApiError(error: unknown): LifecycleApiError {
  const fallback: LifecycleApiError = {
    message: 'dataProcessing.lifecycle.errors.unknown',
    isConflict: false,
  };

  if (!(error instanceof Error)) return fallback;

  const message = error.message;
  const codeMatch = message.match(/\[([A-Z0-9_]+)\]/);
  const code = codeMatch?.[1];
  const isConflict =
    message.includes('409') ||
    code === 'POLICY_IMMUTABLE' ||
    code === 'VERSION_CONFLICT' ||
    code === 'LIFECYCLE_CONFLICT' ||
    code === 'ACTIVATION_BLOCKED' ||
    message.toLowerCase().includes('conflict');

  const missingMatch = message.match(/missing[:\s]+(.+)$/i);

  return {
    status: message.includes('409') ? 409 : undefined,
    code,
    message: code ? message.replace(`[${code}] `, '') : message,
    isConflict,
    missing: missingMatch?.[1]?.split(',').map((part) => part.trim()).filter(Boolean),
  };
}
