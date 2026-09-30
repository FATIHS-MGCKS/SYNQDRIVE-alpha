import { runWithDimoRequestContext } from '@modules/dimo/provider-budget/dimo-request-context';
import type { DimoRequestContext } from '@modules/dimo/provider-budget/dimo-provider-category.types';
import type { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import type { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { DimoTelemetryDiV0HistoricalPositionTransport } from '../position-acquisition/dimo-telemetry-di-v0-position.transport';
import { DimoTelemetryDiV0HistoricalR1ObdTransport } from '../r1-obd-acquisition/dimo-telemetry-di-v0-r1-obd.transport';
import type { DiV0S4cAcquisitionPorts } from './di-v0-s4c-types';

/** Frozen S4C DIMO request context — never inherits parent bypass or priority overrides. */
export const DI_V0_S4C_DIMO_REQUEST_CONTEXT: DimoRequestContext = {
  category: 'POST_TRIP_ENRICHMENT',
  priority: 'BACKGROUND',
};

/** Composition-only DIMO stack wiring (POST_TRIP_ENRICHMENT / BACKGROUND). Not AppModule-registered. */
export function buildDiV0S4cDimoAcquisitionPorts(deps: {
  auth: Pick<DimoAuthService, 'getVehicleJwt'>;
  telemetry: Pick<DimoTelemetryService, 'queryGraphQL'>;
}): DiV0S4cAcquisitionPorts {
  return {
    runDimo: async (_meta, fn) => await runWithDimoRequestContext(DI_V0_S4C_DIMO_REQUEST_CONTEXT, fn),
    positionTransport: new DimoTelemetryDiV0HistoricalPositionTransport(deps.auth, deps.telemetry),
    r1Transport: new DimoTelemetryDiV0HistoricalR1ObdTransport(deps.auth, deps.telemetry),
  };
}
