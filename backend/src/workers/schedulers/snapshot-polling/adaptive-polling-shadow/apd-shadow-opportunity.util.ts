import { createHash } from 'node:crypto';

export function buildApdShadowOpportunityId(input: {
  organizationId: string;
  vehicleId: string;
  decisionAtMs: number;
  origin: string;
}): string {
  return createHash('sha256')
    .update(
      `${input.organizationId}|${input.vehicleId}|${input.decisionAtMs}|${input.origin}`,
      'utf8',
    )
    .digest('hex');
}
