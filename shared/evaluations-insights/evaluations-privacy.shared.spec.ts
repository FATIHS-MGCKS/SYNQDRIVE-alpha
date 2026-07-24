import { describe, expect, it } from 'vitest';
import {
  buildCustomerDisplayLabel,
  maskEmail,
  pseudonymizeCustomerId,
  pseudonymizeLicensePlate,
  redactDashboardInsightForTier,
  resolveEvaluationsPiiTier,
  toMisuseCaseCockpitRow,
} from './evaluations-privacy';

describe('evaluations-privacy', () => {
  it('resolves PII tier from role and permissions', () => {
    expect(
      resolveEvaluationsPiiTier({
        membershipRole: 'ORG_ADMIN',
        canReadFinance: false,
        canReadCustomerPii: false,
      }),
    ).toBe('full');

    expect(
      resolveEvaluationsPiiTier({
        membershipRole: 'WORKER',
        canReadFinance: true,
        canReadCustomerPii: false,
      }),
    ).toBe('pseudonymous');

    expect(
      resolveEvaluationsPiiTier({
        membershipRole: 'WORKER',
        canReadFinance: false,
        canReadCustomerPii: true,
      }),
    ).toBe('full');

    expect(
      resolveEvaluationsPiiTier({
        membershipRole: 'WORKER',
        canReadInvoices: true,
        canReadCustomers: false,
      }),
    ).toBe('pseudonymous');
  });

  it('pseudonymizes customer and plate labels', () => {
    expect(pseudonymizeCustomerId('cust-1234-abcd-efgh-ijkl')).toMatch(/^Kunde ····/);
    expect(pseudonymizeLicensePlate('B-AB 1234')).toBe('B-···34');
  });

  it('masks email without exposing local part', () => {
    expect(maskEmail('anna.mueller@example.com')).toBe('a···@···.com');
  });

  it('never uses email in customer display labels for pseudonymous tier', () => {
    expect(
      buildCustomerDisplayLabel({
        id: 'cust-1',
        email: 'secret@example.com',
        tier: 'pseudonymous',
      }),
    ).toBe(pseudonymizeCustomerId('cust-1'));
  });

  it('redacts pickup-overdue insight message and metrics for non-admin roles', () => {
    const insight = {
      message: 'B-AB 1234 · Max Mustermann — geplanter Pickup 24.07., 10:00 (2 h überfällig).',
      metrics: {
        bookingId: 'bk-1',
        customerId: 'cust-1',
        customerName: 'Max Mustermann',
        vehicleLicense: 'B-AB 1234',
      },
      reasons: ['Geplanter Pickup: 24.07., 10:00', 'Kunde: Max Mustermann'],
    };

    const redacted = redactDashboardInsightForTier(insight, 'pseudonymous');
    expect(redacted.message).toContain('Kunde — geplanter Pickup');
    expect(redacted.message).not.toContain('Max Mustermann');
    expect(redacted.metrics?.customerName).toBeNull();
    expect(redacted.metrics?.customerId).toBeUndefined();
    expect(redacted.metrics?.vehicleLicense).toBe('B-···34');
    expect(redacted.reasons).toEqual(['Geplanter Pickup: 24.07., 10:00']);
  });

  it('maps misuse list rows to cockpit-safe DTO', () => {
    const row = toMisuseCaseCockpitRow({
      id: 'mc-1',
      title: 'Aggressive acceleration',
      description: 'Contains raw telemetry',
      severity: 'HIGH',
      recommendedAction: 'Review return',
      customerId: 'cust-secret',
      evidence: [{ snapshotJson: { speed: 120 } }],
      evidenceCase: { evidenceLevel: 'CHECK_RECOMMENDED', explanation: 'Pattern detected' },
    });

    expect(row.id).toBe('mc-1');
    expect(row.evidenceLevel).toBe('CHECK_RECOMMENDED');
    expect(row).not.toHaveProperty('customerId');
    expect(row).not.toHaveProperty('evidence');
  });
});
