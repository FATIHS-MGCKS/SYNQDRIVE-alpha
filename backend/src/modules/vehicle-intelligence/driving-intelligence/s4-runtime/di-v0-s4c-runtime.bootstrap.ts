import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { PrismaService } from '@shared/database/prisma.service';
import type { DiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import type { DiV0S4ExecutorRegistry } from '../s4b-orchestration/di-v0-s4b-executor.port';
import { DI_V0_S4B_CONTROL_PLANE_CONFIG, DI_V0_S4B_EXECUTOR_REGISTRY } from '../s4b-orchestration/di-v0-s4b-tokens';
import { buildDiV0S4cDimoAcquisitionPorts } from '../s4c-executor/di-v0-s4c-dimo-ports';
import { registerDiV0S4cExecutor } from '../s4c-executor/di-v0-s4c-register';

/** Registers exactly one S4C executor into the shared S4B registry at bootstrap. */
@Injectable()
export class DiV0S4cRuntimeBootstrap implements OnModuleInit {
  constructor(
    @Inject(DI_V0_S4B_EXECUTOR_REGISTRY) private readonly registry: DiV0S4ExecutorRegistry,
    @Inject(DI_V0_S4B_CONTROL_PLANE_CONFIG) private readonly controlPlane: DiV0S4ControlPlaneConfig,
    private readonly prisma: PrismaService,
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
  ) {}

  onModuleInit(): void {
    registerDiV0S4cExecutor(this.registry, {
      prisma: this.prisma,
      controlPlane: this.controlPlane,
      ports: buildDiV0S4cDimoAcquisitionPorts({ auth: this.dimoAuth, telemetry: this.dimoTelemetry }),
    });
  }
}
