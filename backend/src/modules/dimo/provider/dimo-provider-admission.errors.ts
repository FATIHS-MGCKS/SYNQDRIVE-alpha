import type { DimoProviderRequestCategory } from './dimo-provider-limiter.types';
import { DimoProviderRequestPriority } from './dimo-provider-limiter.types';

export class DimoProviderAdmissionTimeoutError extends Error {
  readonly code = 'DIMO_PROVIDER_ADMISSION_TIMEOUT';
  readonly deferrable: boolean;

  constructor(
    readonly category: DimoProviderRequestCategory,
    readonly priority: DimoProviderRequestPriority,
    readonly waitedMs: number,
    readonly reason: 'rate' | 'inflight' | 'cooldown' | 'combined',
  ) {
    super(
      `DIMO provider admission timeout category=${category} priority=${priority} waitedMs=${waitedMs} reason=${reason}`,
    );
    this.name = 'DimoProviderAdmissionTimeoutError';
    this.deferrable = priority === DimoProviderRequestPriority.P4_BACKGROUND ||
      priority === DimoProviderRequestPriority.P3_NORMAL;
  }
}
