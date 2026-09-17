/**
 * Canonical P2.2 shadow adjudication taxonomy — frozen by VDC-DEC-013 / Phase-2 audit §14.
 *
 * Bootstrap initial ESTABLISHMENT (absent projection → PLUGGED via SNAPSHOT_OBD) reuses
 * EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT when independently proven via
 * SNAPSHOT_PLUG_INITIAL_ESTABLISHMENT — no separate cosmetic category.
 */
export enum PhysicalStateShadowClassification {
  MATCH = 'MATCH',
  EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT = 'EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT',
  UNEXPLAINED_OLD_REJECT_NEW_ACCEPT = 'UNEXPLAINED_OLD_REJECT_NEW_ACCEPT',
  OLD_ACCEPT_NEW_REJECT_EXPECTED = 'OLD_ACCEPT_NEW_REJECT_EXPECTED',
  UNEXPLAINED_OLD_ACCEPT_NEW_REJECT = 'UNEXPLAINED_OLD_ACCEPT_NEW_REJECT',
  STATE_DIVERGENCE_CORRECTNESS_UNKNOWN = 'STATE_DIVERGENCE_CORRECTNESS_UNKNOWN',
  BINDING_DIVERGENCE = 'BINDING_DIVERGENCE',
  TIMESTAMP_DIVERGENCE = 'TIMESTAMP_DIVERGENCE',
  CONFLICT = 'CONFLICT',
}

const CORRECTNESS_BLOCKING: ReadonlySet<PhysicalStateShadowClassification> = new Set([
  PhysicalStateShadowClassification.UNEXPLAINED_OLD_REJECT_NEW_ACCEPT,
  PhysicalStateShadowClassification.UNEXPLAINED_OLD_ACCEPT_NEW_REJECT,
  PhysicalStateShadowClassification.STATE_DIVERGENCE_CORRECTNESS_UNKNOWN,
]);

export function isShadowClassificationCorrectnessBlocking(
  classification: PhysicalStateShadowClassification,
  options?: { bindingDivergenceUnexplained?: boolean },
): boolean {
  if (CORRECTNESS_BLOCKING.has(classification)) {
    return true;
  }
  if (
    classification === PhysicalStateShadowClassification.BINDING_DIVERGENCE &&
    options?.bindingDivergenceUnexplained !== false
  ) {
    return true;
  }
  return false;
}

export function isExpectedFixClassification(
  classification: PhysicalStateShadowClassification,
): boolean {
  return classification === PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT;
}
