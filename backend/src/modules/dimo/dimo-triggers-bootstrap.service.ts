import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoTriggersService } from './dimo-triggers.service';
import dimoConfig from '@config/dimo.config';
import { DIMO_TRIGGER_BOOTSTRAP_DISABLED_LOG } from './dimo-trigger-bootstrap.util';

/**
 * Optional startup hook for DIMO Vehicle Triggers API registration.
 * Disabled by default — webhooks and subscriptions are managed manually in the
 * DIMO Developer Console unless DIMO_TRIGGER_BOOTSTRAP_ENABLED=true.
 */
@Injectable()
export class DimoTriggersBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DimoTriggersBootstrapService.name);

  constructor(
    @Inject(dimoConfig.KEY) private readonly conf: ConfigType<typeof dimoConfig>,
    private readonly prisma: PrismaService,
    private readonly triggers: DimoTriggersService,
  ) {}

  async onModuleInit() {
    if (!this.conf.triggerBootstrapEnabled) {
      this.logger.log(DIMO_TRIGGER_BOOTSTRAP_DISABLED_LOG);
      return;
    }

    const base = this.conf.webhookBaseUrl || 'http://localhost:3001';
    const callbackUrl = base.replace(/\/$/, '') + '/api/v1/webhooks/dimo';

    const webhookId = await this.triggers.ensureWebhookRegistered(callbackUrl);
    if (!webhookId) {
      this.logger.warn('DIMO webhook not registered; trigger subscriptions skipped.');
      return;
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: { dimoVehicleId: { not: null } },
      include: { dimoVehicle: true },
    });

    let subscribed = 0;
    for (const v of vehicles) {
      const tokenId = v.dimoVehicle?.tokenId;
      if (tokenId == null) continue;
      try {
        await this.triggers.registerAllTriggersForVehicle(webhookId, tokenId);
        subscribed++;
      } catch (err: any) {
        this.logger.warn(
          `Trigger subscription failed for vehicle ${v.id} (tokenId=${tokenId}): ${err.message}`,
        );
      }
    }

    this.logger.log(`DIMO triggers bootstrap: webhook registered, ${subscribed} vehicle(s) subscribed.`);
  }
}
