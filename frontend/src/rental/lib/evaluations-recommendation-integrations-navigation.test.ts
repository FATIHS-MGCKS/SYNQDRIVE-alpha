// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { executeRecommendationIntegrationNavigation } from './evaluations-recommendation-integrations-navigation';

describe('evaluations-recommendation-integrations-navigation', () => {
  it('opens vehicle detail for navigate action', () => {
    const openVehicleById = vi.fn();
    const handled = executeRecommendationIntegrationNavigation(
      {
        action: 'OPEN_VEHICLE',
        mode: 'navigate',
        state: 'AVAILABLE',
        entity: { entityType: 'vehicle', entityId: 'veh-1' },
      },
      {
        openVehicleById,
        openBookingById: vi.fn(),
        openCustomerById: vi.fn(),
        openInvoiceById: vi.fn(),
        openDocumentById: vi.fn(),
        openDocumentIntake: vi.fn(),
        openAlertById: vi.fn(),
        openServiceCaseById: vi.fn(),
        openFineById: vi.fn(),
        openVendorById: vi.fn(),
      },
    );
    expect(handled).toBe(true);
    expect(openVehicleById).toHaveBeenCalledWith('veh-1');
  });

  it('routes data quality remediation to settings integrations', () => {
    const onNavigate = vi.fn();
    executeRecommendationIntegrationNavigation(
      {
        action: 'OPEN_SETTINGS_INTEGRATIONS',
        mode: 'navigate',
        state: 'AVAILABLE',
      },
      {
        openVehicleById: vi.fn(),
        openBookingById: vi.fn(),
        openCustomerById: vi.fn(),
        openInvoiceById: vi.fn(),
        openDocumentById: vi.fn(),
        openDocumentIntake: vi.fn(),
        openAlertById: vi.fn(),
        openServiceCaseById: vi.fn(),
        openFineById: vi.fn(),
        openVendorById: vi.fn(),
      },
      onNavigate,
    );
    expect(onNavigate).toHaveBeenCalledWith('settings', { settingsTab: 'data-authorization' });
  });
});
