import {
  evaluateDiV0S4Enablement,
  parseDiV0S4ControlPlaneConfig,
} from '../../s4a-foundation/di-v0-s4a-control-plane';
import {
  evaluateDiV0S4ResearchEnablement,
  parseDiV0S4ResearchControlPlaneConfig,
} from '../di-v0-s4-research-control-plane';

describe('di-v0-s4-research control plane', () => {
  const scope = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    vehicleOrganizationId: 'org-1',
  };

  it('defaults all research flags OFF', () => {
    const cfg = parseDiV0S4ResearchControlPlaneConfig({});
    expect(cfg.researchEnabled).toBe(false);
    expect(cfg.workerEnabled).toBe(false);
    expect(cfg.roadMatchingV2Enabled).toBe(false);
  });

  it('fails closed when research flags off', () => {
    const research = parseDiV0S4ResearchControlPlaneConfig({
      DI_V0_S4_RESEARCH_ORGANIZATION_ALLOWLIST: 'org-1',
      DI_V0_S4_RESEARCH_VEHICLE_ALLOWLIST: 'veh-1',
    });
    const s4 = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_WORKER_ENABLED: 'true',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: 'org-1',
      DI_V0_S4_VEHICLE_ALLOWLIST: 'veh-1',
    });
    const res = evaluateDiV0S4ResearchEnablement(research, s4, { state: 'NOT_KILLED', reason: null }, scope);
    expect(res.enabled).toBe(false);
  });

  it('requires vehicle in research allowlist and effective S4 enablement', () => {
    const research = parseDiV0S4ResearchControlPlaneConfig({
      DI_V0_S4_RESEARCH_ENABLED: 'true',
      DI_V0_S4_RESEARCH_WORKER_ENABLED: 'true',
      DI_V0_S4_RESEARCH_ROAD_MATCHING_V2_ENABLED: 'true',
      DI_V0_S4_RESEARCH_ORGANIZATION_ALLOWLIST: 'org-1',
      DI_V0_S4_RESEARCH_VEHICLE_ALLOWLIST: 'veh-1',
    });
    const s4 = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_WORKER_ENABLED: 'true',
      DI_V0_S4_POSITION_ENABLED: 'true',
      DI_V0_S4_ORGANIZATION_ALLOWLIST: 'org-1',
      DI_V0_S4_VEHICLE_ALLOWLIST: 'veh-1',
    });
    const kill = { state: 'NOT_KILLED' as const, reason: null };
    expect(evaluateDiV0S4ResearchEnablement(research, s4, kill, scope).enabled).toBe(true);
    expect(
      evaluateDiV0S4ResearchEnablement(
        { ...research, vehicleAllowlist: new Set(['other']) },
        s4,
        kill,
        scope,
      ).enabled,
    ).toBe(false);
    const s4Off = parseDiV0S4ControlPlaneConfig({});
    expect(evaluateDiV0S4Enablement(s4Off, 'WORKER', scope, kill).enabled).toBe(false);
    expect(evaluateDiV0S4ResearchEnablement(research, s4Off, kill, scope).enabled).toBe(false);
  });
});
