import { describe, expect, it } from 'vitest';
import {
  formatWorkflowStationRef,
  isVersionConflictError,
  previewHasRentedWarning,
  workflowNeedsTargetStation,
  workflowRestrictHomeFleet,
} from './station-vehicle-workflow.utils';
import type { StationVehicleWorkflowPreviewResult } from '../../lib/api';

describe('station-vehicle-workflow.utils', () => {
  it('formats station refs with code', () => {
    expect(
      formatWorkflowStationRef(
        { id: '1', name: 'Airport', code: 'APT', status: 'ACTIVE' },
        '—',
      ),
    ).toBe('Airport (APT)');
  });

  it('detects target station requirement per workflow', () => {
    expect(workflowNeedsTargetStation('plan_transfer')).toBe(true);
    expect(workflowNeedsTargetStation('check_in')).toBe(false);
    expect(workflowRestrictHomeFleet('remove_home')).toBe(true);
  });

  it('detects version conflict payloads', () => {
    expect(
      isVersionConflictError({
        body: { code: 'STATION_POSITION_VERSION_CONFLICT' },
      }),
    ).toBe(true);
  });

  it('flags rented preview warnings', () => {
    const preview = {
      rentalStatus: 'RENTED',
      warnings: [],
    } as StationVehicleWorkflowPreviewResult;
    expect(previewHasRentedWarning(preview)).toBe(true);
  });
});
