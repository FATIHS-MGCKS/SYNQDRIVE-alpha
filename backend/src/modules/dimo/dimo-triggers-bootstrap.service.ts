import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoTriggersService } from './dimo-triggers.service';
import dimoConfig from '@config/dimo.config';

/**
 * On startup: ensure the DIMO Vehicle Triggers webhook is registered and
 * subscribe all registered vehicles (with DIMO tokenId) to DTC and driving-event triggers.
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
    const base = (this.conf as any).webhookBaseUrl || 'http://localhost:3001';
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
        this.logger.warn(`Trigger subscription failed for vehicle ${v.id} (tokenId=${tokenId}): ${err.message}`);
      }
    }

    this.logger.log(`DIMO triggers: webhook registered, ${subscribed} vehicle(s) subscribed.`);
  }
}
