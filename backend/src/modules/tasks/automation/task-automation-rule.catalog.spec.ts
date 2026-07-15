import {
  BOOKING_PICKUP_RULE_ID,
  BOOKING_PICKUP_RULE_VERSION,
  BOOKING_PREPARATION_RULE_ID,
  BOOKING_PREPARATION_RULE_VERSION,
  BOOKING_RETURN_RULE_ID,
  BOOKING_RETURN_RULE_VERSION,
} from '../booking-task-automation.constants';
import {
  INVOICE_PAYMENT_CHECK_RULE_ID,
  INVOICE_PAYMENT_CHECK_RULE_VERSION,
  INVOICE_PAYMENT_DEFAULT_DUE_DAYS,
} from '@modules/invoices/invoice-payment-task.rules';
import {
  VEHICLE_CLEANING_RULE_ID,
  VEHICLE_CLEANING_RULE_VERSION,
  VEHICLE_CLEANING_URGENT_BEFORE_PICKUP_HOURS,
} from '../vehicle-cleaning-task.rules';
import {
  SERVICE_OVERDUE_TASK_RULE_ID,
  SERVICE_OVERDUE_TASK_RULE_VERSION,
} from '@modules/vehicle-intelligence/service-compliance/service-overdue-task.rules';
import {
  MATERIALIZATION_AUTOMATION_RULES,
  TASK_AUTOMATION_CATALOG_KEYS,
  TASK_AUTOMATION_RULE_CATALOG,
} from './task-automation-rule.catalog';
import {
  automationOutboxIdentity,
  buildAutomationMetadataRef,
  getAutomationRuleByCatalogKey,
  getAutomationRuleByInsightType,
} from './task-automation-rule.util';
import { InsightType } from '@prisma/client';

describe('task-automation-rule.catalog', () => {
  it('has unique ruleIds across the full catalog', () => {
    const ruleIds = TASK_AUTOMATION_RULE_CATALOG.map((rule) => rule.ruleId);
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
  });

  it('has valid positive integer versions', () => {
    for (const rule of TASK_AUTOMATION_RULE_CATALOG) {
      expect(Number.isInteger(rule.version)).toBe(true);
      expect(rule.version).toBeGreaterThan(0);
    }
  });

  it('has unique catalog keys for all materialization rules', () => {
    const keys = MATERIALIZATION_AUTOMATION_RULES.map((rule) => rule.catalogKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(TASK_AUTOMATION_CATALOG_KEYS.length);
  });

  it('does not assume a 1:1 mapping between TaskType and catalog key', () => {
    const byTaskType = new Map<string, string[]>();
    for (const rule of MATERIALIZATION_AUTOMATION_RULES) {
      const taskType = rule.taskType!;
      const existing = byTaskType.get(taskType) ?? [];
      existing.push(rule.catalogKey!);
      byTaskType.set(taskType, existing);
    }

    expect(byTaskType.get('VEHICLE_INSPECTION')).toEqual([
      'VEHICLE_INSPECTION_TUV_DUE',
      'VEHICLE_INSPECTION_BOKRAFT_DUE',
    ]);
    expect(byTaskType.get('VEHICLE_SERVICE')).toEqual(['VEHICLE_SERVICE_OVERDUE']);
  });

  it('covers all required canonical catalog keys', () => {
    expect(TASK_AUTOMATION_CATALOG_KEYS).toEqual(
      expect.arrayContaining([
        'BOOKING_PREPARATION',
        'BOOKING_PICKUP',
        'BOOKING_RETURN',
        'DOCUMENT_PACKAGE_INCOMPLETE',
        'INVOICE_PAYMENT_CHECK',
        'VEHICLE_CLEANING_REQUIRED',
        'VEHICLE_SERVICE_OVERDUE',
        'VEHICLE_INSPECTION_TUV_DUE',
        'VEHICLE_INSPECTION_BOKRAFT_DUE',
        'REPAIR_REQUIRED',
        'TIRE_CRITICAL_HEALTH',
        'BRAKE_CRITICAL_HEALTH',
        'BATTERY_CRITICAL_HEALTH',
      ]),
    );
  });

  it('maps insight types to stable catalog rules', () => {
    expect(getAutomationRuleByInsightType(InsightType.TUV_OVERDUE)?.ruleId).toBe(
      'insight.compliance.tuv_overdue',
    );
    expect(getAutomationRuleByInsightType(InsightType.BRAKE_CRITICAL)?.catalogKey).toBe(
      'BRAKE_CRITICAL_HEALTH',
    );
  });

  it('exposes automation metadata with rule version for task rows', () => {
    expect(buildAutomationMetadataRef('BOOKING_PICKUP')).toEqual({
      ruleId: 'booking.lifecycle.confirmed.pickup',
      ruleVersion: 1,
      ruleScope: 'ORG',
    });
    expect(automationOutboxIdentity('INVOICE_PAYMENT_CHECK')).toEqual({
      ruleId: 'invoice.payment.check',
      ruleVersion: 1,
    });
  });
});

describe('legacy constants re-export catalog values', () => {
  it('booking lifecycle constants match catalog', () => {
    const prep = getAutomationRuleByCatalogKey('BOOKING_PREPARATION');
    const pickup = getAutomationRuleByCatalogKey('BOOKING_PICKUP');
    const ret = getAutomationRuleByCatalogKey('BOOKING_RETURN');

    expect(BOOKING_PREPARATION_RULE_ID).toBe(prep.ruleId);
    expect(BOOKING_PREPARATION_RULE_VERSION).toBe(prep.version);
    expect(BOOKING_PICKUP_RULE_ID).toBe(pickup.ruleId);
    expect(BOOKING_PICKUP_RULE_VERSION).toBe(pickup.version);
    expect(BOOKING_RETURN_RULE_ID).toBe(ret.ruleId);
    expect(BOOKING_RETURN_RULE_VERSION).toBe(ret.version);
  });

  it('invoice payment constants match catalog defaults', () => {
    const rule = getAutomationRuleByCatalogKey('INVOICE_PAYMENT_CHECK');
    expect(INVOICE_PAYMENT_CHECK_RULE_ID).toBe(rule.ruleId);
    expect(INVOICE_PAYMENT_CHECK_RULE_VERSION).toBe(rule.version);
    expect(INVOICE_PAYMENT_DEFAULT_DUE_DAYS).toBe(14);
  });

  it('vehicle cleaning constants match catalog', () => {
    const rule = getAutomationRuleByCatalogKey('VEHICLE_CLEANING_REQUIRED');
    expect(VEHICLE_CLEANING_RULE_ID).toBe(rule.ruleId);
    expect(VEHICLE_CLEANING_RULE_VERSION).toBe(rule.version);
    expect(VEHICLE_CLEANING_URGENT_BEFORE_PICKUP_HOURS).toBe(24);
  });

  it('service overdue constants match catalog', () => {
    const rule = getAutomationRuleByCatalogKey('VEHICLE_SERVICE_OVERDUE');
    expect(SERVICE_OVERDUE_TASK_RULE_ID).toBe(rule.ruleId);
    expect(SERVICE_OVERDUE_TASK_RULE_VERSION).toBe(rule.version);
  });
});
