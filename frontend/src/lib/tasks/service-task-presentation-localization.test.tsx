// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import {
  serviceBoardColumnLabel,
  serviceTaskPriorityLabel,
  serviceTaskTypeLabel,
  serviceTaskTypeLabelForType,
  serviceVehicleLabel,
} from './service-task-presentation-i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));

const P216A_ENFORCE_CLEAN_EXACT = [
  'rental/lib/service-task-semantics.ts',
  'lib/tasks/service-task-presentation-i18n.ts',
  'rental/components/vendors/VendorOperationalTasks.tsx',
  'rental/components/VehicleTasksView.tsx',
  'rental/components/EntityTasksSection.tsx',
  'rental/components/vehicle-detail/VehicleServiceContextPanel.tsx',
  'rental/components/fleet-health-service/fleet-health-service-case-list.ts',
  'rental/components/service-center/ServiceTaskCard.tsx',
  'rental/components/service-center/ServiceScheduleRow.tsx',
  'rental/components/service-center/ServiceSchedulePanel.tsx',
  'rental/components/service-center/ServiceTasksCalendar.tsx',
  'rental/components/service-center/ServiceHistoryTimelineRow.tsx',
  'rental/components/service-center/ServiceTasksBoard.tsx',
  'rental/components/service-center/ServiceTaskCreateModal.tsx',
  'rental/components/service-center/ServiceHistoryPanel.tsx',
  'rental/components/service-center/ServiceTasksPanel.tsx',
  'rental/components/service-center/ServiceCenterContextBar.tsx',
];

function isP216AEnforceCleanPath(relPath: string): boolean {
  return P216A_ENFORCE_CLEAN_EXACT.includes(relPath);
}

describe('shared service task presentation localization (P2.2.16A)', () => {
  describe('serviceTaskTypeLabel', () => {
    it('returns English under EN locale (no German leakage)', () => {
      const label = serviceTaskTypeLabel('en', {
        type: 'VEHICLE_SERVICE',
        category: '',
        metadata: null,
      });
      expect(label).toBe(en['tasks.type.VEHICLE_SERVICE']);
      expect(label).toBe('Vehicle service');
      expect(label).not.toContain('Fahrzeug');
      expect(label).not.toMatch(/Wartung/);
    });

    it('returns German under DE locale', () => {
      const label = serviceTaskTypeLabel('de', {
        type: 'VEHICLE_SERVICE',
        category: '',
        metadata: null,
      });
      expect(label).toBe(de['tasks.type.VEHICLE_SERVICE']);
    });

    it('localizes damage repair variant without mutating machine type', () => {
      const task = {
        type: 'REPAIR' as const,
        category: '',
        metadata: { damageId: 'dmg-1', origin: 'DAMAGE' },
      };
      expect(serviceTaskTypeLabel('en', task)).toBe(en['tasks.type.repairDamage']);
      expect(serviceTaskTypeLabel('de', task)).toBe(de['tasks.type.repairDamage']);
      expect(task.type).toBe('REPAIR');
    });

    it('localizes diagnostics category hint without mutating category token', () => {
      const task = {
        type: 'CUSTOM' as const,
        category: 'DTC Fehler',
        metadata: null,
      };
      expect(serviceTaskTypeLabel('en', task)).toBe(en['tasks.type.diagnostics']);
      expect(task.category).toBe('DTC Fehler');
    });
  });

  describe('supporting presentation helpers', () => {
    it('localizes priority and board columns via canonical keys', () => {
      expect(serviceTaskPriorityLabel('en', 'HIGH')).toBe(en['tasks.filter.priority.HIGH']);
      expect(serviceBoardColumnLabel('de', 'waiting-vendor')).toBe(de['tasks.serviceBoard.waitingVendor']);
    });

    it('localizes vehicle label fallbacks', () => {
      expect(serviceVehicleLabel('en', null)).toBe(en['tasks.vehicleLabel.unknown']);
      expect(serviceVehicleLabel('de', { make: 'VW', model: 'Golf' })).toBe('VW Golf');
    });

    it('maps ApiTaskType values through canonical type keys', () => {
      expect(serviceTaskTypeLabelForType('en', 'TIRE_CHECK')).toBe(en['tasks.type.TIRE_CHECK']);
      expect(serviceTaskTypeLabelForType('de', 'BRAKE_CHECK')).toBe(de['tasks.type.BRAKE_CHECK']);
    });
  });

  describe('P216A enforce-clean inventory', () => {
    it('reports zero P216A scoped findings', () => {
      const p216aFindings = inventory.findings.filter((finding) =>
        isP216AEnforceCleanPath(finding.file),
      );
      expect(p216aFindings).toHaveLength(0);
    });

    it('keeps service-task-semantics machine-only', () => {
      const source = readFileSync(
        join(__dirname, '../../rental/lib/service-task-semantics.ts'),
        'utf8',
      );
      expect(source).not.toContain('TASK_TYPE_LABEL_DE');
      expect(source).not.toContain('function taskTypeLabel');
    });
  });
});
