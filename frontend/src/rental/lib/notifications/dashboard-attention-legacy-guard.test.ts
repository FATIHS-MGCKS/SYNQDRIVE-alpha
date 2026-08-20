import { describe, expect, it } from 'vitest';
import {
  buildFleetReadinessScopedAttentionItems,
  shouldSupplementVehicleHealthForScopedAttention,
} from './dashboard-attention-legacy-guard';
import { minimalActionQueueItem } from './fixtures/action-queue-item.fixture';

describe('shouldSupplementVehicleHealthForScopedAttention', () => {
  it('disables supplemental vehicle health merge when attention split is active', () => {
    expect(shouldSupplementVehicleHealthForScopedAttention({ attentionSplitActive: true })).toBe(false);
  });

  it('keeps legacy supplemental merge when attention split is inactive', () => {
    expect(shouldSupplementVehicleHealthForScopedAttention({ attentionSplitActive: false })).toBe(true);
  });
});

describe('buildFleetReadinessScopedAttentionItems', () => {
  it('does not merge vehicleHealthQueueItems when attention split is active', () => {
    const scopedApiItems = [
      minimalActionQueueItem('fleet-api', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_NOT_READY',
        semanticKey: 'VEHICLE:veh-a:VEHICLE_NOT_READY',
      }),
    ];
    const supplementalHealth = [
      minimalActionQueueItem('health-runtime', {
        vehicleId: 'veh-a',
        issueType: 'error_codes_active',
        semanticKey: 'vehicle:veh-a:error_codes:active',
        source: 'operational-issue',
      }),
    ];

    const merged = buildFleetReadinessScopedAttentionItems(
      scopedApiItems,
      supplementalHealth,
      { attentionSplitActive: true },
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('fleet-api');
    expect(merged.some((row) => row.id === 'health-runtime')).toBe(false);
  });

  it('merges supplemental vehicle health when attention split is inactive (legacy path)', () => {
    const scopedApiItems = [
      minimalActionQueueItem('fleet-api', {
        vehicleId: 'veh-a',
        issueType: 'VEHICLE_NOT_READY',
        semanticKey: 'VEHICLE:veh-a:VEHICLE_NOT_READY',
      }),
    ];
    const supplementalHealth = [
      minimalActionQueueItem('health-runtime', {
        vehicleId: 'veh-a',
        issueType: 'error_codes_active',
        semanticKey: 'vehicle:veh-a:error_codes:active',
        source: 'operational-issue',
      }),
    ];

    const merged = buildFleetReadinessScopedAttentionItems(
      scopedApiItems,
      supplementalHealth,
      { attentionSplitActive: false },
    );

    expect(merged).toHaveLength(2);
    expect(merged.some((row) => row.id === 'health-runtime')).toBe(true);
  });
});
