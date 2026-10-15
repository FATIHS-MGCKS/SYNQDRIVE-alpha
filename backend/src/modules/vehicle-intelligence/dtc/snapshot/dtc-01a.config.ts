/**
 * DTC-01A safety foundation — disabled by default until owner enables in runtime env.
 */
export function isDtc01aSafetyFoundationEnabled(): boolean {
  return process.env.DTC_01A_SAFETY_FOUNDATION_ENABLED === 'true';
}
