import { Injectable, Logger } from '@nestjs/common';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { buildDimoProviderRequestContext } from '@modules/dimo/provider/dimo-provider-request-context.util';
import type { HvChargingCounterDimoIntervalRowV1 } from './hv-charging-counter-evidence.types.v1';

function buildChargingAddedEnergyIntervalQuery(
  tokenId: number,
  fromIso: string,
  toIso: string,
): string {
  return `query HvChargingCounterInterval {
  signals(tokenId: ${tokenId}, from: "${fromIso}", to: "${toIso}", interval: "1m") {
    timestamp
    addedKwhLast: powertrainTractionBatteryChargingAddedEnergy(agg: LAST)
    addedKwhMin: powertrainTractionBatteryChargingAddedEnergy(agg: MIN)
    addedKwhMax: powertrainTractionBatteryChargingAddedEnergy(agg: MAX)
  }
}`;
}

@Injectable()
export class DimoChargingAddedEnergyIntervalClient {
  private readonly logger = new Logger(DimoChargingAddedEnergyIntervalClient.name);

  constructor(
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
  ) {}

  async fetchIntervalBuckets(input: {
    tokenId: number;
    from: Date;
    to: Date;
    organizationId: string;
    vehicleId: string;
  }): Promise<HvChargingCounterDimoIntervalRowV1[]> {
    const vehicleJwt = await this.dimoAuth.getVehicleJwt(input.tokenId);
    if (!vehicleJwt) {
      this.logger.debug(`No vehicle JWT for tokenId=${input.tokenId}`);
      return [];
    }

    const query = buildChargingAddedEnergyIntervalQuery(
      input.tokenId,
      input.from.toISOString(),
      input.to.toISOString(),
    );
    const context = buildDimoProviderRequestContext(input.tokenId, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      tokenId: input.tokenId,
    });

    const result = await this.dimoTelemetry.queryGraphQL(
      vehicleJwt,
      query,
      undefined,
      context,
    );
    const rows = result?.data?.signals;
    if (!Array.isArray(rows)) return [];
    return rows as HvChargingCounterDimoIntervalRowV1[];
  }
}
