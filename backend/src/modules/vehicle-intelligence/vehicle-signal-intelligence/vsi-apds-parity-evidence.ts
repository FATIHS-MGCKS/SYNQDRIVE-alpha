/**
 * P5A does not modify APDS shadow runtime. This module records honest parity evidence status.
 * `apdsShadowBaselineParityIdentity` is a compile-time no-op guard only — not replay certification.
 */
export const VsiApdsReplayParityEvidenceStatus = {
  NOT_INDEPENDENTLY_EXECUTED_IN_P5_PR: 'NOT_INDEPENDENTLY_EXECUTED_IN_P5_PR',
  SHADOW_UNIT_SUITE_PASS_REFERENCE: 'SHADOW_UNIT_SUITE_PASS_REFERENCE',
} as const;

export type VsiApdsReplayParityEvidenceStatus =
  (typeof VsiApdsReplayParityEvidenceStatus)[keyof typeof VsiApdsReplayParityEvidenceStatus];

export function describeVsiApdsShadowRuntimeDiff(): {
  apdsRuntimeDiff: 'NONE';
  p5bEnabled: false;
  replayParity: VsiApdsReplayParityEvidenceStatus;
  note: string;
} {
  return {
    apdsRuntimeDiff: 'NONE',
    p5bEnabled: false,
    replayParity: VsiApdsReplayParityEvidenceStatus.NOT_INDEPENDENTLY_EXECUTED_IN_P5_PR,
    note:
      'No imports from adaptive-polling-shadow in P5; APDS shadow unit suites should be run in CI. Identity helper does not prove durable replay parity.',
  };
}
