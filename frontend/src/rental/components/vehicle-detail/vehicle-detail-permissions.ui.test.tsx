import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VehicleRequirementsTab } from './VehicleRequirementsTab';

vi.mock('../../hooks/useVehicleRentalRequirements', () => ({
  useVehicleRentalRequirements: () => ({
    effective: null,
    requirements: null,
    orgDefaults: null,
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

vi.mock('../../hooks/useRentalRulesPermissions', () => ({
  useRentalRulesPermissions: vi.fn(),
}));

import { useRentalRulesPermissions } from '../../hooks/useRentalRulesPermissions';

const vehicle = {
  id: 'veh-1',
  license: 'AVL-1',
  make: 'VW',
  model: 'Golf',
  year: 2024,
} as const;

describe('Vehicle detail permission-based UI', () => {
  it('shows access denied when rental rules cannot be read', () => {
    vi.mocked(useRentalRulesPermissions).mockReturnValue({
      canRead: false,
      canWrite: false,
      canPublish: false,
      canManageOverrides: false,
      canAssignVehicles: false,
      canReviewEligibility: false,
      canOverrideEligibility: false,
    });

    const html = renderToStaticMarkup(
      <VehicleRequirementsTab selectedVehicle={vehicle as never} orgId="org-1" />,
    );
    expect(html).toContain('Kein Zugriff');
    expect(html).not.toContain('Overrides bearbeiten');
  });

  it('renders management actions only when permissions allow', () => {
    vi.mocked(useRentalRulesPermissions).mockReturnValue({
      canRead: true,
      canWrite: true,
      canPublish: false,
      canManageOverrides: true,
      canAssignVehicles: true,
      canReviewEligibility: false,
      canOverrideEligibility: false,
    });

    const html = renderToStaticMarkup(
      <VehicleRequirementsTab selectedVehicle={vehicle as never} orgId="org-1" />,
    );
    expect(html).toContain('Mietvoraussetzungen');
    expect(html).toContain('Overrides bearbeiten');
    expect(html).not.toContain('Kein Zugriff');
  });
});
