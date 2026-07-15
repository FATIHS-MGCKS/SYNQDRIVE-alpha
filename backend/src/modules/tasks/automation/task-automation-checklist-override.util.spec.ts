import { BadRequestException } from '@nestjs/common';
import {
  buildEffectiveChecklistItems,
  validateChecklistOverridePayload,
} from './task-automation-checklist-override.util';

describe('task-automation-checklist-override.util', () => {
  it('rejects hiding required checklist items', () => {
    expect(() =>
      validateChecklistOverridePayload('BOOKING_PREPARATION', {
        hiddenOptionalTitles: ['Pflichtdokumente vollständig'],
      }),
    ).toThrow(BadRequestException);
  });

  it('allows hiding optional checklist items', () => {
    expect(() =>
      validateChecklistOverridePayload('BOOKING_PREPARATION', {
        hiddenOptionalTitles: ['Zahlungsstatus geprüft'],
      }),
    ).not.toThrow();
  });

  it('rejects additional items that collide with platform titles', () => {
    expect(() =>
      validateChecklistOverridePayload('BOOKING_PICKUP', {
        additionalItems: [{ title: 'Kunde identifizieren' }],
      }),
    ).toThrow(BadRequestException);
  });

  it('builds effective checklist with hidden optional and additional items', () => {
    const result = buildEffectiveChecklistItems({
      taskType: 'BOOKING_PREPARATION',
      checklistOverrides: {
        hiddenOptionalTitles: ['Zahlungsstatus geprüft'],
        additionalItems: [{ title: 'Winterreifen prüfen', isRequired: true }],
      },
    });

    expect(result.hasOverride).toBe(true);
    expect(result.platformItems.find((item) => item.title === 'Zahlungsstatus geprüft')?.hidden).toBe(
      true,
    );
    expect(result.effectiveItems.map((item) => item.title)).toContain('Winterreifen prüfen');
    expect(result.effectiveItems.map((item) => item.title)).not.toContain('Zahlungsstatus geprüft');
    expect(result.effectiveItems.map((item) => item.title)).toContain('Pflichtdokumente vollständig');
  });
});
