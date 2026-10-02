import type { DimoAuthService } from '../../../dimo/dimo-auth.service';
import type { DimoTelemetryService } from '../../../dimo/dimo-telemetry.service';
import { buildDimoProviderRequestContext } from '../../../dimo/provider/dimo-provider-request-context.util';
import type {
  DiV0HistoricalR1ObdQueryInput,
  DiV0HistoricalR1ObdTransport,
} from './di-v0-r1-obd-acquisition.types';
import { DiV0VehicleJwtUnavailableError } from '../position-acquisition/di-v0-position-errors';

/** Shared DIMO transport adapter — not Nest-registered in S3B. */
export class DimoTelemetryDiV0HistoricalR1ObdTransport implements DiV0HistoricalR1ObdTransport {
  constructor(
    private readonly auth: Pick<DimoAuthService, 'getVehicleJwt'>,
    private readonly telemetry: Pick<DimoTelemetryService, 'queryGraphQL'>,
  ) {}

  async executeHistoricalR1ObdQuery(input: DiV0HistoricalR1ObdQueryInput): Promise<unknown> {
    const vehicleJwt = await this.auth.getVehicleJwt(input.dimoTokenId);
    if (typeof vehicleJwt !== 'string' || vehicleJwt.length === 0) {
      throw new DiV0VehicleJwtUnavailableError();
    }
    return this.telemetry.queryGraphQL(
      vehicleJwt,
      input.query,
      undefined,
      buildDimoProviderRequestContext(input.dimoTokenId, {
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
      }),
    );
  }
}
