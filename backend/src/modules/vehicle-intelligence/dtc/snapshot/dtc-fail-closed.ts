export const DTC_01A_FAIL_CLOSED_CODE = 'DTC_01A_FAIL_CLOSED';

export class Dtc01aFailClosedError extends Error {
  readonly code = DTC_01A_FAIL_CLOSED_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'Dtc01aFailClosedError';
  }
}

export function assertDtcSnapshotApplyWired(
  enabled: boolean,
  applyService: unknown,
  context: string,
): void {
  if (enabled && !applyService) {
    throw new Dtc01aFailClosedError(
      `${context}: DTC_01A_SAFETY_FOUNDATION_ENABLED but DtcSnapshotApplyService is not injected`,
    );
  }
}
