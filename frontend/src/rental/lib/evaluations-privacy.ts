export type EvaluationsPiiTier = 'full' | 'pseudonymous' | 'none';

export interface EvaluationsAccessContext {
  membershipRole: string | null;
  canReadInvoices: boolean;
  canReadCustomers: boolean;
}

export function canAccessEvaluationsSurface(ctx: Pick<EvaluationsAccessContext, 'canReadInvoices'>): boolean {
  return ctx.canReadInvoices;
}

export function resolveEvaluationsPiiTier(ctx: EvaluationsAccessContext): EvaluationsPiiTier {
  const role = ctx.membershipRole ?? 'WORKER';
  if (role === 'ORG_ADMIN' || role === 'MASTER_ADMIN') return 'full';
  if (role === 'SUB_ADMIN' && ctx.canReadInvoices && ctx.canReadCustomers) return 'full';
  if (ctx.canReadInvoices) return 'pseudonymous';
  return 'none';
}

export function pseudonymizeCustomerId(customerId: string): string {
  const tail = customerId.replace(/-/g, '').slice(-6).toUpperCase();
  return `Kunde ····${tail}`;
}

export function pseudonymizeLicensePlate(plate: string): string {
  const trimmed = plate.trim();
  if (!trimmed) return 'Fahrzeug';
  if (trimmed.length <= 4) return `${trimmed.slice(0, 1)}···`;
  return `${trimmed.slice(0, 2)}···${trimmed.slice(-2)}`;
}

export function buildCustomerDisplayLabel(input: {
  id: string;
  displayLabel?: string | null;
  tier: EvaluationsPiiTier;
}): string {
  if (input.tier !== 'full') return pseudonymizeCustomerId(input.id);
  return input.displayLabel?.trim() || pseudonymizeCustomerId(input.id);
}

export function formatVehicleLabel(
  vehicle: { license?: string | null; model?: string | null } | undefined,
  vehicleId: string,
  tier: EvaluationsPiiTier,
): { primary: string; secondary?: string } {
  const license = vehicle?.license?.trim() || '';
  const model = vehicle?.model?.trim() || '';
  const primary =
    tier === 'full'
      ? license || vehicleId.slice(0, 8)
      : license
        ? pseudonymizeLicensePlate(license)
        : 'Fahrzeug';
  const secondary = model || undefined;
  return { primary, secondary };
}
