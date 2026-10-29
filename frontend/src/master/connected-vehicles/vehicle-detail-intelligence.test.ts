import { describe, expect, it } from 'vitest';
import { pickPrimaryProviderSourceLink } from '../intelligence/vehicle-detail-intelligence.utils';
import {
  navigateMasterIntelligenceCrossLink,
  parseMasterIntelligenceContext,
} from '../intelligence/master-intelligence-url';
import {
  APDS_OVERVIEW_BY_VEHICLE,
  QA_VEHICLE_AUDI_A4,
  QA_VEHICLE_TESLA_MODEL3,
  QA_VEHICLE_VW_ARTEON,
  QA_VEHICLE_VW_TIGUAN,
  VEHICLE_DETAIL_QA_LINK,
  VEHICLE_DETAIL_QA_ORG,
  VSI_OVERVIEW_BY_VEHICLE,
} from './test-fixtures/vehicle-detail-intelligence.fixture';
import { mapSummaryToRpmBadge } from '../intelligence/vsi-master-intelligence-ui.utils';

describe('vehicle detail intelligence utils', () => {
  it('flags ambiguous provider links without inventing a single truth', () => {
    const profiles = VSI_OVERVIEW_BY_VEHICLE[QA_VEHICLE_VW_TIGUAN]!.profiles;
    const doubled = [
      ...profiles,
      { ...profiles[0]!, providerSourceLinkId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
    ];
    const pick = pickPrimaryProviderSourceLink(doubled, null);
    expect(pick.ambiguous).toBe(true);
    expect(pick.linkId).toBeTruthy();
  });

  it('Tesla fixture uses RPM NOT_APPLICABLE distinct from UNKNOWN profile label', () => {
    const profile = VSI_OVERVIEW_BY_VEHICLE[QA_VEHICLE_TESLA_MODEL3]!.profiles[0]!;
    const rpm = mapSummaryToRpmBadge(profile);
    expect(rpm.applicability).toBe('NOT_APPLICABLE');
    expect(rpm.profile).toBe('UNKNOWN');
  });

  it('covers four QA vehicle VSI/APDS fixture shapes', () => {
    for (const id of [QA_VEHICLE_TESLA_MODEL3, QA_VEHICLE_VW_TIGUAN, QA_VEHICLE_AUDI_A4, QA_VEHICLE_VW_ARTEON]) {
      expect(VSI_OVERVIEW_BY_VEHICLE[id]?.vehicleId).toBe(id);
      expect(APDS_OVERVIEW_BY_VEHICLE[id]?.vehicleId).toBe(id);
    }
  });
});

// @vitest-environment happy-dom
describe('vehicle detail intelligence navigation', () => {
  it('round-trips vehicle drawer context through VSI, APDS, and PDI URLs', () => {
    window.history.replaceState(null, '', '/master?view=vehicles&cvSection=vehicles');
    navigateMasterIntelligenceCrossLink('vsi-intelligence', {
      orgId: VEHICLE_DETAIL_QA_ORG,
      vehicleId: QA_VEHICLE_VW_ARTEON,
      providerSourceLinkId: VEHICLE_DETAIL_QA_LINK,
      physicalDeviceId: null,
      apdOpportunityId: null,
      policyVersion: null,
      apdEpochId: null,
      asOf: null,
      rejectedParams: [],
    });
    let ctx = parseMasterIntelligenceContext(window.location.search);
    expect(ctx.vehicleId).toBe(QA_VEHICLE_VW_ARTEON);
    navigateMasterIntelligenceCrossLink('apds-intelligence', ctx);
    ctx = parseMasterIntelligenceContext(window.location.search);
    expect(ctx.providerSourceLinkId).toBe(VEHICLE_DETAIL_QA_LINK);
    navigateMasterIntelligenceCrossLink('device-inventory', {
      ...ctx,
      physicalDeviceId: 'b2c3d4e5-f6a7-4890-b123-456789abcdef',
    });
    const params = new URLSearchParams(window.location.search);
    expect(params.get('view')).toBe('device-inventory');
    expect(params.get('pdiDeviceId')).toBe('b2c3d4e5-f6a7-4890-b123-456789abcdef');
    navigateMasterIntelligenceCrossLink('vehicles', ctx);
    expect(new URLSearchParams(window.location.search).get('vehicleId')).toBe(QA_VEHICLE_VW_ARTEON);
  });
});
