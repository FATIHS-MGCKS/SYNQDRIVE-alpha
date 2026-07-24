import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DenySwitchService } from './deny-switch.service';

@Injectable()
export class DenySwitchStartupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DenySwitchStartupService.name);

  constructor(private readonly denySwitch: DenySwitchService) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.denySwitch.hydrateFromDatabase();
      this.denySwitch.startReconciliationLoop();
      this.logger.log(`Deny-switch startup complete (${count} active switches)`);
    } catch (err) {
      this.logger.error(
        `Deny-switch startup hydration failed — fail-closed until DB recovers: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  onModuleDestroy(): void {
    this.denySwitch.stopReconciliationLoop();
  }
}
