import {
  CORE_APP_M2M_KNOWN_SCOPES,
  CORE_APP_M2M_SCOPE_VEHICLE_READ,
} from './core-app-m2m.constants';
import { validateCoreAppM2mScopeDefinitions } from './core-app-service-registry.policy';

describe('core-app-m2m.constants — scope contract (Core reference)', () => {
  it('uses canonical singular vehicle read scope', () => {
    expect(CORE_APP_M2M_SCOPE_VEHICLE_READ).toBe('core:app:vehicle:read');
    expect(CORE_APP_M2M_KNOWN_SCOPES).toContain('core:app:vehicle:read');
    expect(validateCoreAppM2mScopeDefinitions([CORE_APP_M2M_SCOPE_VEHICLE_READ])).toEqual([]);
  });

  it('rejects legacy plural vehicles spelling', () => {
    expect(CORE_APP_M2M_KNOWN_SCOPES).not.toContain('core:app:vehicles:read');
    expect(validateCoreAppM2mScopeDefinitions(['core:app:vehicles:read'])).toEqual([
      'core:app:vehicles:read',
    ]);
  });
});