import { Injectable, OnModuleInit } from '@nestjs/common';
import { WorkerRuntimeHealthService } from '@modules/data-authorizations/revocation-queue-control/worker-runtime-health.service';
import { WORKER_POLICY_ENGINE_VERSION } from '@modules/data-authorizations/revocation-queue-control/revocation-queue-control.constants';

@Injectable()
export class WorkerRuntimeHealthBootstrapService implements OnModuleInit {
  constructor(private readonly runtimeHealth: WorkerRuntimeHealthService) {}

  onModuleInit(): void {
    this.runtimeHealth.registerWorkerPolicyEngineVersion(WORKER_POLICY_ENGINE_VERSION);
  }
}
