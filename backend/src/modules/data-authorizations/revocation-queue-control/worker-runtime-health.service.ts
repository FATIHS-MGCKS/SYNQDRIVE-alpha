import { Injectable } from '@nestjs/common';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { DenySwitchLocalStore } from '../deny-switch/deny-switch.local-store';
import { WORKER_POLICY_ENGINE_VERSION } from './revocation-queue-control.constants';
import type { WorkerRuntimeHealthSnapshot } from './revocation-queue-control.types';

@Injectable()
export class WorkerRuntimeHealthService {
  private workerReportedVersion: string | null = null;

  constructor(private readonly denySwitchStore: DenySwitchLocalStore) {}

  registerWorkerPolicyEngineVersion(version: string): void {
    this.workerReportedVersion = version;
    RuntimeStatusRegistry.setPolicyEngineVersion(version);
  }

  isWorkerCompliant(): boolean {
    const reported = this.workerReportedVersion ?? RuntimeStatusRegistry.getPolicyEngineVersion();
    return reported === WORKER_POLICY_ENGINE_VERSION;
  }

  snapshot(): WorkerRuntimeHealthSnapshot {
    const workerReportedVersion =
      this.workerReportedVersion ?? RuntimeStatusRegistry.getPolicyEngineVersion();
    return {
      policyEngineVersion: WORKER_POLICY_ENGINE_VERSION,
      workerReportedVersion,
      workersEnabled: RuntimeStatusRegistry.getWorkersEnabled(),
      denySwitchReady: this.denySwitchStore.isReady(),
      compliant: workerReportedVersion === WORKER_POLICY_ENGINE_VERSION,
      checkedAt: new Date().toISOString(),
    };
  }
}
