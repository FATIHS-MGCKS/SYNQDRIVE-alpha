export type OffboardErrorKind =
  | 'SUCCESS'
  | 'STEP_UP_REQUIRED'
  | 'MFA_ENROLLMENT_REQUIRED'
  | 'OPERATIONALLY_BLOCKED'
  | 'SEMANTIC_CONFLICT'
  | 'TRANSPORT_UNCERTAIN'
  | 'HTTP_REJECTION'
  | 'UNKNOWN';

export class VehicleOffboardRequestError extends Error {
  readonly kind: OffboardErrorKind;
  readonly code: string | null;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    message: string,
    opts: {
      kind: OffboardErrorKind;
      code?: string | null;
      status?: number;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = 'VehicleOffboardRequestError';
    this.kind = opts.kind;
    this.code = opts.code ?? null;
    this.status = opts.status ?? 0;
    this.details = opts.details;
  }
}

export function classifyOffboardHttpFailure(
  status: number,
  code: string | null | undefined,
  message: string,
  details?: unknown,
): VehicleOffboardRequestError {
  if (code === 'STEP_UP_REQUIRED') {
    return new VehicleOffboardRequestError(message, {
      kind: 'STEP_UP_REQUIRED',
      code,
      status,
      details,
    });
  }
  if (code === 'MFA_ENROLLMENT_REQUIRED') {
    return new VehicleOffboardRequestError(message, {
      kind: 'MFA_ENROLLMENT_REQUIRED',
      code,
      status,
      details,
    });
  }
  if (code === 'OFFBOARD_OPERATIONALLY_BLOCKED') {
    return new VehicleOffboardRequestError(message, {
      kind: 'OPERATIONALLY_BLOCKED',
      code,
      status,
      details,
    });
  }
  if (
    code === 'VEHICLE_REGISTRY_INVALID_TRANSITION' ||
    code === 'IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_REQUEST' ||
    code === 'TERMINAL_CASE_IDEMPOTENCY'
  ) {
    return new VehicleOffboardRequestError(message, {
      kind: 'SEMANTIC_CONFLICT',
      code,
      status,
      details,
    });
  }
  return new VehicleOffboardRequestError(message, {
    kind: 'HTTP_REJECTION',
    code: code ?? null,
    status,
    details,
  });
}

export function isTransportUncertainError(err: unknown): boolean {
  if (err instanceof VehicleOffboardRequestError && err.kind === 'TRANSPORT_UNCERTAIN') return true;
  return (
    err instanceof TypeError ||
    (err instanceof Error && /network|fetch|failed|timeout/i.test(err.message))
  );
}

export function isStepUpRequiredOffboardError(err: unknown): boolean {
  return err instanceof VehicleOffboardRequestError && err.kind === 'STEP_UP_REQUIRED';
}

export function isEnrollmentRequiredOffboardError(err: unknown): boolean {
  return err instanceof VehicleOffboardRequestError && err.kind === 'MFA_ENROLLMENT_REQUIRED';
}
