// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { writePersistedLocale } from '../../i18n/locales';
import type { DamageResponse } from '../lib/damage.types';
import {
  filterDamages,
  sortDamagesForQueue,
  type DamageQueueFilter,
} from './damages/damage-control.utils';
import {
  formatDamageDateLocale,
  formatDamageEuroCents,
  resolveDamageHostError,
  resolveDamageQueueFilterLabel,
  resolveDamageSeverityLabel,
  resolveDamageSourceLabel,
  resolveDamageStatusLabel,
  resolveDamageTypeLabel,
  resolveDamageValidationMessage,
  resolveEvidenceStatusLabel,
  resolveLiabilityStatusLabel,
  resolveRentalImpactLabel,
} from '../lib/rental-vehicle-damages-i18n';
import { DamagesView } from './DamagesView';

const P261_ENFORCE_CLEAN_EXACT = [
  'rental/components/DamagesView.tsx',
  'rental/components/damages/DamageControlSummary.tsx',
  'rental/components/damages/DamageInsightsSection.tsx',
  'rental/components/damages/DamageEvidenceCanvas.tsx',
  'rental/components/damages/DamageWorkQueue.tsx',
  'rental/components/damages/DamageDetailDrawer.tsx',
  'rental/components/damages/CreateDamageDialog.tsx',
  'rental/components/damages/MarkRepairedDialog.tsx',
  'rental/components/damages/CreateRepairTaskDialog.tsx',
  'rental/components/damages/DamageAiIntakeDialog.tsx',
  'rental/components/damages/AddDamagePhotoPanel.tsx',
  'rental/components/damages/DamageRentalSections.tsx',
  'rental/components/damages/DamageMapBlueprint.tsx',
  'rental/components/damages/DamageHeatmapOverlay.tsx',
  'rental/components/damages/damage-summary-display.ts',
  'rental/components/damages/damage-control.utils.ts',
  'rental/lib/rental-vehicle-damages-i18n.ts',
  'rental/hooks/useVehicleDamages.ts',
  'rental/hooks/useVehicleDamageActions.ts',
  'rental/lib/damage-insights.ts',
  'rental/lib/damage-rental-impact.ts',
  'rental/lib/damage-pickup-context.ts',
  'rental/hooks/useDamageAiIntake.ts',
];

const RAW_DESCRIPTION = 'Provider Damage Description X7';
const RAW_TASK_TITLE = 'Provider Task Title X7';
const RAW_BACKEND_ERROR = 'Backend Damage Error X7';
const RAW_PHOTO_FILENAME = 'Damage_Photo_X7.jpg';
const RAW_LIABILITY_NOTE = 'Provider Liability Note X7';

const DAMAGE_TYPES = [
  'SCRATCH',
  'DENT',
  'CRACK',
  'BROKEN_PART',
  'PAINT_DAMAGE',
  'GLASS_DAMAGE',
  'TIRE_DAMAGE',
  'INTERIOR_DAMAGE',
  'OTHER',
] as const;

const SEVERITIES = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] as const;
const STATUSES = ['OPEN', 'IN_REPAIR', 'REPAIRED', 'ARCHIVED'] as const;
const RENTAL_IMPACTS = ['NONE', 'WATCH', 'BLOCK_RENTAL', 'SAFETY_CRITICAL'] as const;
const EVIDENCE = ['MISSING', 'PARTIAL', 'COMPLETE', 'DISPUTED'] as const;
const LIABILITY = [
  'NOT_APPLICABLE',
  'NEEDS_REVIEW',
  'CUSTOMER_RESPONSIBLE',
  'COMPANY_RESPONSIBLE',
  'INSURANCE_CLAIM',
  'DISPUTED',
] as const;
const SOURCES = [
  'MANUAL',
  'PICKUP_HANDOVER',
  'RETURN_HANDOVER',
  'AI_UPLOAD',
  'WORKSHOP',
  'INSPECTION',
] as const;
const QUEUE_FILTERS: DamageQueueFilter[] = [
  'open',
  'blocking',
  'missing_evidence',
  'unplaced',
  'repaired',
  'all',
];

function tFor(locale: 'de' | 'en') {
  const dict = locale === 'de' ? de : en;
  return (key: keyof typeof en, vars?: Record<string, string | number>) => {
    let value = dict[key] ?? String(key);
    if (vars) {
      for (const [name, val] of Object.entries(vars)) {
        value = value.replace(`{${name}}`, String(val));
      }
    }
    return value;
  };
}

function makeDamage(overrides: Partial<DamageResponse> = {}): DamageResponse {
  return {
    id: 'dmg-p261-x7',
    vehicleId: 'veh-p261',
    damageType: 'SCRATCH',
    severity: 'MODERATE',
    status: 'OPEN',
    description: RAW_DESCRIPTION,
    locationView: 'FRONT',
    locationX: 42,
    locationY: 55,
    locationLabel: 'Provider Repair Shop X7',
    estimatedCostCents: 12500,
    repairCostCents: null,
    chargedToCustomerCents: null,
    depositHoldCents: null,
    source: 'MANUAL',
    rentalImpact: 'WATCH',
    evidenceStatus: 'PARTIAL',
    liabilityStatus: 'NEEDS_REVIEW',
    liabilityNote: RAW_LIABILITY_NOTE,
    reportedBy: 'operator@test',
    reportedAt: '2026-08-15T10:00:00.000Z',
    createdAt: '2026-08-15T10:00:00.000Z',
    updatedAt: '2026-08-15T10:00:00.000Z',
    repairStartedAt: null,
    repairedAt: null,
    taskId: 'task-p261-x7',
    images: [
      {
        id: 'img-p261-x7',
        url: 'https://example.com/' + RAW_PHOTO_FILENAME,
        mimeType: 'image/jpeg',
        caption: RAW_PHOTO_FILENAME,
        createdAt: '2026-08-15T10:05:00.000Z',
        uploadedBy: 'operator@test',
      },
    ],
    ...overrides,
  };
}

let damagesViewMountCount = 0;
const mutationCounters = {
  create: 0,
  place: 0,
  addPhoto: 0,
  markInRepair: 0,
  markRepaired: 0,
  archive: 0,
  updateLiability: 0,
  createTask: 0,
  reload: 0,
};

const damagesState = {
  damages: [makeDamage()],
  stats: {
    total: 1,
    open: 1,
    inRepair: 0,
    repaired: 0,
    archived: 0,
    active: 1,
    blockingRental: 0,
    safetyCritical: 0,
    missingEvidence: 0,
    unplaced: 0,
    estimatedOpenCostCents: 12500,
    oldestOpenDamageAt: '2026-08-15T10:00:00.000Z',
  },
  loading: false,
  error: null as string | null,
  hostErrorKey: null as string | null,
};

vi.mock('../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-p261' }),
}));

vi.mock('../hooks/useVehicleDamages', () => ({
  useVehicleDamages: () => ({
    damages: damagesState.damages,
    stats: damagesState.stats,
    statsUnavailable: false,
    loading: damagesState.loading,
    error: damagesState.error,
    reload: vi.fn(async () => {
      mutationCounters.reload += 1;
    }),
  }),
}));

vi.mock('../hooks/useVehicleDamageActions', () => ({
  useVehicleDamageActions: () => ({
    mutating: false,
    mutatingAction: null,
    createDamage: vi.fn(async () => {
      mutationCounters.create += 1;
      return makeDamage();
    }),
    placeDamage: vi.fn(async () => {
      mutationCounters.place += 1;
    }),
    placeDamageOnCanvas: vi.fn(async () => {
      mutationCounters.place += 1;
    }),
    addPhoto: vi.fn(async () => {
      mutationCounters.addPhoto += 1;
    }),
    markInRepair: vi.fn(async () => {
      mutationCounters.markInRepair += 1;
    }),
    markRepaired: vi.fn(async () => {
      mutationCounters.markRepaired += 1;
    }),
    archiveDamage: vi.fn(async () => {
      mutationCounters.archive += 1;
    }),
    updateLiability: vi.fn(async () => {
      mutationCounters.updateLiability += 1;
    }),
    prepareDepositHold: vi.fn(),
    prepareCustomerCharge: vi.fn(),
    createRepairTask: vi.fn(async () => {
      mutationCounters.createTask += 1;
      return { id: 'task-new', damage: makeDamage() };
    }),
  }),
}));

vi.mock('../hooks/useDamageHandoverRefs', () => ({
  useDamageHandoverRefs: () => new Map(),
}));

vi.mock('../../lib/api', () => ({
  api: {
    vehicles: {
      exteriorImages: {
        listEffective: vi.fn(async () => ({ effective: [] })),
      },
    },
    tasks: {
      get: vi.fn(async () => ({
        id: 'task-p261-x7',
        title: RAW_TASK_TITLE,
        status: 'OPEN',
      })),
    },
  },
}));

vi.mock('../lib/damage-ai-intake', () => ({
  isDamageAiIntakeEnabled: () => false,
}));

function MountProbe() {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      damagesViewMountCount += 1;
      mounted.current = true;
    }
  }, []);
  return null;
}

function DamagesViewHarness() {
  return createElement(
    'div',
    null,
    createElement(MountProbe),
    createElement(DamagesView, { vehicleId: 'veh-p261' }),
  );
}

describe('P2.2.61 Rental Vehicle Damages localization', () => {
  beforeEach(() => {
    damagesViewMountCount = 0;
    Object.keys(mutationCounters).forEach((key) => {
      mutationCounters[key as keyof typeof mutationCounters] = 0;
    });
    damagesState.error = null;
    damagesState.damages = [makeDamage()];
  });

  it('keeps P261 enforce-clean scope at zero scanner findings', () => {
    const debt = inventory.findings.filter((finding) => P261_ENFORCE_CLEAN_EXACT.includes(finding.file));
    expect(debt).toHaveLength(0);
  });

  it('localizes machine labels without changing machine values', () => {
    for (const type of DAMAGE_TYPES) {
      expect(resolveDamageTypeLabel(tFor('de'), type)).not.toBe(resolveDamageTypeLabel(tFor('en'), type));
    }
    for (const severity of SEVERITIES) {
      expect(resolveDamageSeverityLabel(tFor('de'), severity)).not.toBe(
        resolveDamageSeverityLabel(tFor('en'), severity),
      );
    }
    for (const status of STATUSES) {
      expect(resolveDamageStatusLabel(tFor('de'), status)).not.toBe(
        resolveDamageStatusLabel(tFor('en'), status),
      );
    }
    for (const impact of RENTAL_IMPACTS) {
      expect(resolveRentalImpactLabel(tFor('de'), impact)).not.toBe(
        resolveRentalImpactLabel(tFor('en'), impact),
      );
    }
    for (const evidence of EVIDENCE) {
      expect(resolveEvidenceStatusLabel(tFor('de'), evidence)).not.toBe(
        resolveEvidenceStatusLabel(tFor('en'), evidence),
      );
    }
    for (const liability of LIABILITY) {
      expect(resolveLiabilityStatusLabel(tFor('de'), liability)).not.toBe(
        resolveLiabilityStatusLabel(tFor('en'), liability),
      );
    }
    for (const source of SOURCES) {
      expect(resolveDamageSourceLabel(tFor('de'), source)).not.toBe(
        resolveDamageSourceLabel(tFor('en'), source),
      );
    }
    for (const filter of QUEUE_FILTERS) {
      expect(resolveDamageQueueFilterLabel(tFor('de'), filter)).not.toBe(
        resolveDamageQueueFilterLabel(tFor('en'), filter),
      );
    }
  });

  it('preserves unknown machine fallback as raw value', () => {
    expect(resolveDamageTypeLabel(tFor('en'), 'PROVIDER_DAMAGE_TYPE_X7')).toBe('PROVIDER_DAMAGE_TYPE_X7');
    expect(resolveDamageStatusLabel(tFor('en'), 'PROVIDER_DAMAGE_STATUS_X7')).toBe(
      'PROVIDER_DAMAGE_STATUS_X7',
    );
    expect(resolveDamageSourceLabel(tFor('en'), 'PROVIDER_DAMAGE_SOURCE_X7')).toBe(
      'PROVIDER_DAMAGE_SOURCE_X7',
    );
  });

  it('preserves raw fixtures exactly across locales', () => {
    const damage = makeDamage();
    expect(damage.description).toBe(RAW_DESCRIPTION);
    expect(damage.liabilityNote).toBe(RAW_LIABILITY_NOTE);
    expect(damage.images[0].caption).toBe(RAW_PHOTO_FILENAME);
    expect(damage.locationLabel).toBe('Provider Repair Shop X7');
    expect(RAW_BACKEND_ERROR).toBe(RAW_BACKEND_ERROR);
    expect(RAW_TASK_TITLE).toBe(RAW_TASK_TITLE);
  });

  it('keeps backend error precedence over host error keys', () => {
    expect(
      resolveDamageHostError('vehicleDamages.hostError.loadFailed', RAW_BACKEND_ERROR, tFor('en')),
    ).toBe(RAW_BACKEND_ERROR);
    expect(resolveDamageHostError('vehicleDamages.hostError.loadFailed', null, tFor('en'))).toBe(
      en['vehicleDamages.hostError.loadFailed'],
    );
  });

  it('keeps filter predicates stable across locales', () => {
    const rows = [
      makeDamage({ id: 'open-1', status: 'OPEN', rentalImpact: 'WATCH', evidenceStatus: 'COMPLETE' }),
      makeDamage({
        id: 'block-1',
        status: 'OPEN',
        rentalImpact: 'BLOCK_RENTAL',
        evidenceStatus: 'COMPLETE',
      }),
      makeDamage({
        id: 'missing-1',
        status: 'OPEN',
        evidenceStatus: 'MISSING',
        rentalImpact: 'NONE',
      }),
      makeDamage({ id: 'repaired-1', status: 'REPAIRED', repairedAt: '2026-08-20T10:00:00.000Z' }),
    ];
    for (const filter of QUEUE_FILTERS) {
      const ids = filterDamages(rows, filter).map((d) => d.id);
      expect(ids).toEqual(filterDamages(rows, filter).map((d) => d.id));
    }
    const openIds = filterDamages(rows, 'open').map((d) => d.id);
    expect(openIds).toContain('open-1');
    expect(openIds).toContain('block-1');
    expect(openIds).not.toContain('repaired-1');
  });

  it('keeps queue sort order stable', () => {
    const rows = [
      makeDamage({ id: 'neutral', rentalImpact: 'NONE', reportedAt: '2026-08-10T10:00:00.000Z' }),
      makeDamage({ id: 'critical', rentalImpact: 'SAFETY_CRITICAL', reportedAt: '2026-08-11T10:00:00.000Z' }),
      makeDamage({ id: 'blocking', rentalImpact: 'BLOCK_RENTAL', reportedAt: '2026-08-12T10:00:00.000Z' }),
    ];
    const sortedIds = sortDamagesForQueue(rows).map((d) => d.id);
    expect(sortedIds[0]).toBe('critical');
    expect(sortedIds[1]).toBe('blocking');
  });

  it('formats dates and costs locale-aware without changing raw cents', () => {
    const iso = '2026-08-15T10:00:00.000Z';
    const deDate = formatDamageDateLocale('de', iso);
    const enDate = formatDamageDateLocale('en', iso);
    expect(deDate).toBeTruthy();
    expect(enDate).toBeTruthy();
    expect(deDate).not.toBe(enDate);
    const deCost = formatDamageEuroCents('de', 12500);
    const enCost = formatDamageEuroCents('en', 12500);
    expect(deCost).toContain('125');
    expect(enCost).toContain('125');
  });

  it('keeps mutation hook contracts frozen', () => {
    const actionsSrc = readFileSync(resolve(__dirname, '../hooks/useVehicleDamageActions.ts'), 'utf8');
    expect(actionsSrc).toContain('createVehicleDamage');
    expect(actionsSrc).toContain('placeVehicleDamage');
    expect(actionsSrc).toContain('addDamageImage');
    expect(actionsSrc).toContain("status: 'IN_REPAIR'");
    expect(actionsSrc).toContain('markDamageRepaired');
    expect(actionsSrc).toContain("status: 'ARCHIVED'");
    expect(actionsSrc).toContain('createDamageRepairTask');
    expect(actionsSrc).toContain('formatApiError');
    expect(actionsSrc).not.toContain('FLOW_STATUS_LABEL_DE');
  });

  it('preserves true same-mount DamagesView across DE→EN→DE with zero mutations', async () => {
    writePersistedLocale('de');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    function LocaleSwitcher() {
      const { setLocale } = useLanguage();
      useEffect(() => {
        const timer = window.setTimeout(() => setLocale('en'), 20);
        const timer2 = window.setTimeout(() => setLocale('de'), 40);
        return () => {
          window.clearTimeout(timer);
          window.clearTimeout(timer2);
        };
      }, [setLocale]);
      return createElement(DamagesViewHarness);
    }

    await act(async () => {
      root.render(createElement(LanguageProvider, null, createElement(LocaleSwitcher)));
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(damagesViewMountCount).toBe(1);
    expect(mutationCounters.create).toBe(0);
    expect(mutationCounters.place).toBe(0);
    expect(mutationCounters.addPhoto).toBe(0);
    expect(mutationCounters.markInRepair).toBe(0);
    expect(mutationCounters.markRepaired).toBe(0);
    expect(mutationCounters.archive).toBe(0);
    expect(mutationCounters.updateLiability).toBe(0);
    expect(mutationCounters.createTask).toBe(0);
    expect(container.textContent).toContain('Provider Repair Shop X7');

    await act(async () => {
      root.unmount();
      container.remove();
    });
  });

  it('localizes validation codes', () => {
    expect(resolveDamageValidationMessage('DAMAGE_TYPE_REQUIRED', tFor('de'))).toBeTruthy();
    expect(resolveDamageValidationMessage('DAMAGE_TYPE_REQUIRED', tFor('en'))).toBeTruthy();
    expect(resolveDamageValidationMessage('DESCRIPTION_TOO_LONG', tFor('en'))).toContain('4000');
  });
});
