export class MasterAdminSmokeLifecyclePolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MasterAdminSmokeLifecyclePolicyError';
  }
}

export function isSmokeProvisioningEnabled(): boolean {
  return process.env.MASTER_ADMIN_SMOKE_PROVISIONING_ENABLED === 'true';
}

export function assertSmokeProvisioningGate(input: {
  confirmProductionSmoke: boolean;
  nodeEnv?: string;
}): void {
  if (!isSmokeProvisioningEnabled()) {
    throw new MasterAdminSmokeLifecyclePolicyError(
      'MASTER_ADMIN_SMOKE_PROVISIONING_ENABLED must be true',
    );
  }

  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production' && !input.confirmProductionSmoke) {
    throw new MasterAdminSmokeLifecyclePolicyError(
      '--confirm-production-smoke is required when NODE_ENV=production',
    );
  }
}

export function resolveSmokeTtlHours(): number {
  const raw = process.env.MASTER_ADMIN_SMOKE_TTL_HOURS?.trim();
  if (!raw) return 4;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 24) {
    throw new MasterAdminSmokeLifecyclePolicyError(
      'MASTER_ADMIN_SMOKE_TTL_HOURS must be a positive number up to 24',
    );
  }
  return parsed;
}
