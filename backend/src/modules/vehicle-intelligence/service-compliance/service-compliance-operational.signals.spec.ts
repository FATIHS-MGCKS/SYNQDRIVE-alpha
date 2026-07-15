import { InsightType } from '@prisma/client';
import {
  buildComplianceInsightCandidates,
  buildComplianceTaskSignals,
  NO_TRACKING_INFO_TITLE,
} from './service-compliance-operational.signals';
import type { ServiceComplianceEvaluation } from './service-compliance.types';

const vehicle = {
  id: 'v1',
  make: 'VW',
  model: 'ID.4',
  licensePlate: 'B-XY 100',
  homeStationId: 'st1',
  mileageKm: 42000,
  lastServiceDate: new Date('2025-01-10'),
  lastServiceOdometerKm: 35000,
  serviceIntervalManufacturerKm: 30000,
  serviceIntervalManufacturerMonths: 24,
};

const enabledTypes = [
  InsightType.SERVICE_OVERDUE,
  InsightType.TUV_OVERDUE,
  InsightType.BOKRAFT_OVERDUE,
  InsightType.HM_SERVICE_NO_TRACKING,
];

function evaluation(partial: Partial<ServiceComplianceEvaluation>): ServiceComplianceEvaluation {
  return {
    nextService: {
      trackingStatus: 'NO_TRACKING',
      source: null,
      distanceToNextServiceKm: null,
      timeToNextServiceDays: null,
      lastUpdatedAt: null,
      serviceSourceLabel: null,
      severity: 'INFO',
      blocksRental: false,
      title: 'Kein Service-Tracking',
      description: '',
      message: 'Kein Tracking',
      hmDistanceFromOem: false,
      hmTimeFromOem: false,
      hmDerivedDueDate: null,
      ...partial.nextService,
    },
    tuvBokraft: {
      tuvValidTill: null,
      tuvRemainingMonths: null,
      tuvRemainingDays: null,
      tuvOverdue: false,
      tuvLastDate: null,
      bokraftValidTill: null,
      bokraftRemainingMonths: null,
      bokraftRemainingDays: null,
      bokraftOverdue: false,
      bokraftLastDate: null,
      ...partial.tuvBokraft,
    },
  };
}

describe('service-compliance-operational.signals', () => {
  it('HM service due soon produces task signal and warning insight', () => {
    const ev = evaluation({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        distanceToNextServiceKm: 1200,
        timeToNextServiceDays: 20,
        lastUpdatedAt: new Date().toISOString(),
        serviceSourceLabel: 'HM/OEM',
        severity: 'WARNING',
        blocksRental: false,
        title: 'Service fällig',
        description: '',
        message: 'Nächster Service: noch 20 Tage',
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: new Date().toISOString(),
      },
    });

    const signals = buildComplianceTaskSignals(vehicle, ev);
    expect(signals).toHaveLength(1);
    expect(signals[0].suggestionOnly).toBe(true);
    expect(signals[0].dedupeKey).toBe('service_overdue:v1');

    const insights = buildComplianceInsightCandidates(vehicle, ev, {
      now: new Date(),
      enabledTypes,
    });
    expect(insights.some((i) => i.type === InsightType.SERVICE_OVERDUE && i.severity === 'WARNING')).toBe(true);
  });

  it('HM service overdue produces critical task signal', () => {
    const ev = evaluation({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        distanceToNextServiceKm: -200,
        timeToNextServiceDays: -5,
        lastUpdatedAt: new Date().toISOString(),
        serviceSourceLabel: 'HM/OEM',
        severity: 'CRITICAL',
        blocksRental: false,
        title: 'Service überfällig',
        description: '',
        message: 'Service überfällig',
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: null,
      },
    });

    const signals = buildComplianceTaskSignals(vehicle, ev);
    expect(signals[0].severity).toBe('CRITICAL');
    expect(signals[0].suggestionOnly).toBe(false);
  });

  it('HM NO_TRACKING produces info insight only — no task signal', () => {
    const ev = evaluation({});
    const signals = buildComplianceTaskSignals(vehicle, ev);
    expect(signals).toHaveLength(0);

    const insights = buildComplianceInsightCandidates(vehicle, ev, {
      now: new Date(),
      enabledTypes,
    });
    const info = insights.find((i) => i.type === InsightType.HM_SERVICE_NO_TRACKING);
    expect(info?.severity).toBe('INFO');
    expect(info?.title).toBe(NO_TRACKING_INFO_TITLE);
    expect(info?.dedupeKey).toBe('hm_no_tracking:v1');
  });

  it('HM STALE produces no task signal and no blocking insight', () => {
    const ev = evaluation({
      nextService: {
        trackingStatus: 'STALE',
        source: 'HM_OEM',
        distanceToNextServiceKm: null,
        timeToNextServiceDays: null,
        lastUpdatedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
        serviceSourceLabel: 'HM/OEM (veraltet)',
        severity: 'INFO',
        blocksRental: false,
        title: 'Veraltet',
        description: '',
        message: 'Veraltet',
        hmDistanceFromOem: false,
        hmTimeFromOem: false,
        hmDerivedDueDate: null,
      },
    });

    expect(buildComplianceTaskSignals(vehicle, ev)).toHaveLength(0);
    expect(
      buildComplianceInsightCandidates(vehicle, ev, { now: new Date(), enabledTypes }),
    ).toHaveLength(0);
  });

  it('TÜV due soon and overdue produce correct signals', () => {
    const dueSoon = evaluation({
      tuvBokraft: {
        tuvValidTill: new Date(Date.now() + 15 * 86400000).toISOString(),
        tuvRemainingMonths: 0,
        tuvRemainingDays: 15,
        tuvOverdue: false,
        tuvLastDate: null,
        bokraftValidTill: null,
        bokraftRemainingMonths: null,
        bokraftRemainingDays: null,
        bokraftOverdue: false,
        bokraftLastDate: null,
      },
    });
    const soonSignals = buildComplianceTaskSignals(vehicle, dueSoon);
    expect(soonSignals.find((s) => s.kind === 'TUV_SCHEDULE')?.suggestionOnly).toBe(true);

    const overdue = evaluation({
      tuvBokraft: {
        tuvValidTill: new Date(Date.now() - 3 * 86400000).toISOString(),
        tuvRemainingMonths: -1,
        tuvRemainingDays: -3,
        tuvOverdue: true,
        tuvLastDate: null,
        bokraftValidTill: null,
        bokraftRemainingMonths: null,
        bokraftRemainingDays: null,
        bokraftOverdue: false,
        bokraftLastDate: null,
      },
    });
    const overdueSignal = buildComplianceTaskSignals(vehicle, overdue)[0];
    expect(overdueSignal.blocksRental).toBe(true);
    expect(overdueSignal.severity).toBe('CRITICAL');
  });

  it('BOKraft due soon and overdue produce task signals', () => {
    const dueSoon = evaluation({
      tuvBokraft: {
        tuvValidTill: null,
        tuvRemainingMonths: null,
        tuvRemainingDays: null,
        tuvOverdue: false,
        tuvLastDate: null,
        bokraftValidTill: new Date(Date.now() + 10 * 86400000).toISOString(),
        bokraftRemainingMonths: 0,
        bokraftRemainingDays: 10,
        bokraftOverdue: false,
        bokraftLastDate: null,
      },
    });
    expect(buildComplianceTaskSignals(vehicle, dueSoon).some((s) => s.kind === 'BOKRAFT_SCHEDULE')).toBe(true);

    const overdue = evaluation({
      tuvBokraft: {
        tuvValidTill: null,
        tuvRemainingMonths: null,
        tuvRemainingDays: null,
        tuvOverdue: false,
        tuvLastDate: null,
        bokraftValidTill: new Date(Date.now() - 1 * 86400000).toISOString(),
        bokraftRemainingMonths: 0,
        bokraftRemainingDays: -1,
        bokraftOverdue: true,
        bokraftLastDate: null,
      },
    });
    const sig = buildComplianceTaskSignals(vehicle, overdue)[0];
    expect(sig.kind).toBe('BOKRAFT_URGENT');
    expect(sig.blocksRental).toBe(true);
  });

  it('dedupe keys are stable per vehicle and reason', () => {
    const ev = evaluation({
      nextService: {
        trackingStatus: 'TRACKED',
        source: 'HM_OEM',
        distanceToNextServiceKm: 100,
        timeToNextServiceDays: 5,
        lastUpdatedAt: new Date().toISOString(),
        serviceSourceLabel: 'HM/OEM',
        severity: 'WARNING',
        blocksRental: false,
        title: 'x',
        description: '',
        message: 'x',
        hmDistanceFromOem: true,
        hmTimeFromOem: true,
        hmDerivedDueDate: null,
      },
    });
    const vehicle2 = { ...vehicle, id: 'v2' };
    const a = buildComplianceTaskSignals(vehicle, ev)[0].dedupeKey;
    const b = buildComplianceTaskSignals(vehicle, ev)[0].dedupeKey;
    const c = buildComplianceTaskSignals(vehicle2, ev)[0].dedupeKey;
    expect(a).toBe(b);
    expect(a).toBe('service_overdue:v1');
    expect(c).toBe('service_overdue:v2');
  });
});
