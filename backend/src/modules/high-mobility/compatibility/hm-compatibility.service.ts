import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type {
  HighMobilityCompatibilityRecord,
  HighMobilityCompatibilitySignal,
  HmCompatibilityApp,
  Prisma,
} from '@prisma/client';
import {
  getOemPath,
  getOemRoutingNote,
  normalizeToHmBrand,
} from '../high-mobility-oem-routing';
import {
  AppCoverageSummary,
  CompatibilityAppStatus,
  CompatibilityBrandOption,
  CompatibilityCheckResponse,
  CompatibilityEligibilityMode,
  CompatibilityModelOption,
  CompatibilityOnboardingInfo,
  CompatibilityOnboardingMode,
  CompatibilityOverall,
  CompatibilitySourceInfo,
  CompatibilitySummary,
  NOT_RECOMMENDED_RATIO,
  PRESENT_COVERAGES,
  SignalCoverageItem,
  SUPPORTED_RATIO,
} from './hm-compatibility.types';

/**
 * HighMobilityCompatibilityService
 *
 * Internal Master-Admin compatibility intelligence. Looks up brand/model/year
 * records, reshapes them into a UI-ready response, and derives app status
 * deterministically from per-signal coverage.
 *
 * Design notes:
 *  - Brand lookup is normalized-lowercase (shares `normalizeToHmBrand` with
 *    the rest of the HM module — no duplicate brand aliasing).
 *  - App status is derived from signals unless the DB has an explicit
 *    override (Product rule 2: derive from signal groups). The override
 *    path exists for rare edge cases where a human reviewer wants to
 *    force a different verdict.
 *  - Onboarding mode is a first-class axis and is not coupled to
 *    app suitability (Product rule 1: eligibility absence ≠ unsupported).
 */
@Injectable()
export class HighMobilityCompatibilityService {
  private readonly logger = new Logger(HighMobilityCompatibilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Public API ────────────────────────────────────────────────────────────

  async listBrands(): Promise<CompatibilityBrandOption[]> {
    const groups = await this.prisma.highMobilityCompatibilityRecord.groupBy({
      by: ['brand', 'brandDisplayName'],
      _count: { _all: true },
      orderBy: { brandDisplayName: 'asc' },
    });

    // Collapse duplicates that only differ by brandDisplayName casing.
    const byBrand = new Map<string, CompatibilityBrandOption>();
    for (const g of groups) {
      const existing = byBrand.get(g.brand);
      if (existing) {
        existing.modelCount += g._count._all;
      } else {
        byBrand.set(g.brand, {
          brand: g.brand,
          displayName: g.brandDisplayName,
          modelCount: g._count._all,
        });
      }
    }
    return Array.from(byBrand.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }

  async listModels(brandRaw: string): Promise<CompatibilityModelOption[]> {
    const brand = normalizeToHmBrand(brandRaw);
    const records = await this.prisma.highMobilityCompatibilityRecord.findMany({
      where: { brand },
      orderBy: [{ modelDisplayName: 'asc' }, { modelYearFrom: 'asc' }],
    });

    // Group multiple year-range rows for the same model into a single option
    // for the picker (the actual year-specific row is resolved in check()).
    const byModel = new Map<string, CompatibilityModelOption>();
    for (const r of records) {
      const existing = byModel.get(r.model);
      const range = this.formatYearRange(r.modelYearFrom, r.modelYearTo);
      if (!existing) {
        byModel.set(r.model, {
          model: r.model,
          displayName: r.modelDisplayName,
          yearRange: range,
        });
      } else if (range && !existing.yearRange?.includes(range)) {
        // Merge multiple ranges: "2019+ · 2018-2023"
        existing.yearRange = existing.yearRange
          ? `${existing.yearRange} · ${range}`
          : range;
      }
    }
    return Array.from(byModel.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
  }

  async check(
    brandRaw: string,
    modelRaw: string,
    year: number | null,
  ): Promise<CompatibilityCheckResponse> {
    const normalizedBrand = normalizeToHmBrand(brandRaw);
    const normalizedModel = this.normalizeModel(modelRaw);

    const lookup = {
      brand: brandRaw,
      model: modelRaw,
      year,
      resolvedBrandNormalized: normalizedBrand || null,
      resolvedModelNormalized: normalizedModel || null,
    };

    const record = await this.findRecord(normalizedBrand, normalizedModel, year);
    const generatedAt = new Date().toISOString();

    if (!record) {
      return {
        lookup,
        found: false,
        summary: null,
        healthApp: null,
        telemetryApp: null,
        onboarding: this.buildFallbackOnboarding(brandRaw),
        source: null,
        notFoundReason: this.buildNotFoundReason(brandRaw, modelRaw, year),
        generatedAt,
      };
    }

    const healthApp = this.buildAppSummary(record, record.signals, 'HEALTH');
    const telemetryApp = this.buildAppSummary(record, record.signals, 'TELEMETRY');
    const overall = this.computeOverall(record, healthApp.status, telemetryApp.status);

    const summary: CompatibilitySummary = {
      brand: record.brand,
      brandDisplayName: record.brandDisplayName,
      model: record.model,
      modelDisplayName: record.modelDisplayName,
      modelYearFrom: record.modelYearFrom,
      modelYearTo: record.modelYearTo,
      supportFromText: record.supportFromText,
      overallStatus: overall.status,
      overallNotes: overall.notes,
    };

    const onboarding = this.buildOnboarding(record);

    const source: CompatibilitySourceInfo = {
      supportSource: record.supportSource,
      confidence: record.confidence,
      lastReviewedAt: record.lastReviewedAt
        ? record.lastReviewedAt.toISOString()
        : null,
      notes: record.notes,
    };

    return {
      lookup,
      found: true,
      summary,
      healthApp,
      telemetryApp,
      onboarding,
      source,
      notFoundReason: null,
      generatedAt,
    };
  }

  // ── Record lookup ─────────────────────────────────────────────────────────

  private async findRecord(
    brand: string,
    model: string,
    year: number | null,
  ): Promise<
    | (HighMobilityCompatibilityRecord & {
        signals: HighMobilityCompatibilitySignal[];
      })
    | null
  > {
    // Strategy: find all records for brand + model, then pick the best
    // year-range match (record whose [from..to] contains the year, else
    // the latest or the open-ended one).
    const candidates = await this.prisma.highMobilityCompatibilityRecord.findMany({
      where: { brand, model },
      include: {
        signals: {
          orderBy: [{ app: 'asc' }, { displayOrder: 'asc' }, { signalLabel: 'asc' }],
        },
      },
    });

    if (candidates.length === 0) return null;

    if (year != null && Number.isFinite(year)) {
      const match = candidates.find((c) => this.yearFits(c, year));
      if (match) return match;
    }

    // Pick the record with the most recent modelYearFrom (or null-from as fallback).
    return candidates.sort((a, b) => {
      const af = a.modelYearFrom ?? -Infinity;
      const bf = b.modelYearFrom ?? -Infinity;
      return bf - af;
    })[0];
  }

  private yearFits(
    record: HighMobilityCompatibilityRecord,
    year: number,
  ): boolean {
    const from = record.modelYearFrom;
    const to = record.modelYearTo;
    if (from == null && to == null) return true;
    if (from != null && year < from) return false;
    if (to != null && year > to) return false;
    return true;
  }

  // ── App status derivation ────────────────────────────────────────────────

  private buildAppSummary(
    record: HighMobilityCompatibilityRecord,
    signals: HighMobilityCompatibilitySignal[],
    app: HmCompatibilityApp,
  ): AppCoverageSummary {
    const appSignals = signals
      .filter((s) => s.app === app)
      .map<SignalCoverageItem>((s) => ({
        app: s.app,
        signalKey: s.signalKey,
        signalLabel: s.signalLabel,
        signalGroup: s.signalGroup,
        required: s.required,
        coverage: s.coverage,
        confidence: s.confidence,
        notes: s.notes,
        displayOrder: s.displayOrder,
      }));

    const required = appSignals.filter((s) => s.required);
    const totalRequired = required.length;
    const coveredRequired = required.filter((s) =>
      PRESENT_COVERAGES.includes(s.coverage),
    ).length;

    const override =
      app === 'HEALTH'
        ? record.healthAppStatus
        : record.telemetryAppStatus;

    const derived = this.deriveAppStatus(coveredRequired, totalRequired);
    const status: CompatibilityAppStatus = override ?? derived;

    const reason = this.describeAppStatus(
      app,
      status,
      coveredRequired,
      totalRequired,
      override != null,
    );

    return {
      status,
      coveredRequired,
      totalRequired,
      totalSignals: appSignals.length,
      reason,
      signals: appSignals,
    };
  }

  private deriveAppStatus(
    covered: number,
    total: number,
  ): CompatibilityAppStatus {
    if (total === 0) return 'NOT_RECOMMENDED';
    const ratio = covered / total;
    if (ratio >= SUPPORTED_RATIO) return 'SUPPORTED';
    if (ratio < NOT_RECOMMENDED_RATIO) return 'NOT_RECOMMENDED';
    return 'PARTIAL';
  }

  private describeAppStatus(
    app: HmCompatibilityApp,
    status: CompatibilityAppStatus,
    covered: number,
    total: number,
    manualOverride: boolean,
  ): string {
    const appLabel = app === 'HEALTH' ? 'Health APP' : 'Telemetry APP';
    const coverage = total > 0 ? `${covered} / ${total} Pflicht-Signalgruppen abgedeckt` : 'keine Pflicht-Signale definiert';
    const overrideNote = manualOverride ? ' (manuelle Kuration)' : '';
    switch (status) {
      case 'SUPPORTED':
        return `${appLabel} wird vollständig unterstützt — ${coverage}${overrideNote}.`;
      case 'PARTIAL':
        return `${appLabel} ist eingeschränkt nutzbar — ${coverage}${overrideNote}.`;
      case 'NOT_RECOMMENDED':
      default:
        return `${appLabel} wird nicht empfohlen — ${coverage}${overrideNote}.`;
    }
  }

  // ── Overall status + onboarding ──────────────────────────────────────────

  private computeOverall(
    record: HighMobilityCompatibilityRecord,
    health: CompatibilityAppStatus,
    telemetry: CompatibilityAppStatus,
  ): { status: CompatibilityOverall; notes: string | null } {
    if (record.overallStatus) {
      return {
        status: record.overallStatus,
        notes: record.notes ?? null,
      };
    }

    // Derivation:
    //  GOOD    → both apps SUPPORTED
    //  LIMITED → at least one app PARTIAL or one SUPPORTED + one PARTIAL/NOT_RECOMMENDED
    //  WEAK    → both NOT_RECOMMENDED
    const both = (s: CompatibilityAppStatus) => health === s && telemetry === s;
    const either = (s: CompatibilityAppStatus) => health === s || telemetry === s;

    let status: CompatibilityOverall;
    if (both('SUPPORTED')) status = 'GOOD';
    else if (both('NOT_RECOMMENDED')) status = 'WEAK';
    else if (either('SUPPORTED')) status = 'LIMITED';
    else status = 'LIMITED';

    const humanHealth = this.humanStatus(health);
    const humanTelemetry = this.humanStatus(telemetry);
    const notes = `Health APP: ${humanHealth} · Telemetry APP: ${humanTelemetry}`;
    return { status, notes };
  }

  private humanStatus(s: CompatibilityAppStatus): string {
    return s === 'SUPPORTED'
      ? 'unterstützt'
      : s === 'PARTIAL'
        ? 'eingeschränkt'
        : 'nicht empfohlen';
  }

  private buildOnboarding(
    record: HighMobilityCompatibilityRecord,
  ): CompatibilityOnboardingInfo {
    const oemPath = getOemPath(record.brand);
    const routingNote = getOemRoutingNote(record.brand);
    const guidance = this.buildOnboardingGuidance(
      record.eligibilityMode,
      record.onboardingMode,
      oemPath,
    );
    return {
      eligibilityMode: record.eligibilityMode,
      onboardingMode: record.onboardingMode,
      oemPath,
      routingNote,
      guidance,
    };
  }

  private buildFallbackOnboarding(
    brandRaw: string,
  ): CompatibilityOnboardingInfo {
    const oemPath = getOemPath(brandRaw);
    const routingNote = getOemRoutingNote(brandRaw);
    // Fallback eligibility hint from OEM path alone (no DB record available).
    const eligibilityMode: CompatibilityEligibilityMode =
      oemPath === 'ELIGIBILITY_FIRST'
        ? 'AVAILABLE'
        : oemPath === 'DIRECT_FLEET_CLEARANCE'
          ? 'NOT_AVAILABLE'
          : 'SUPPORT_REQUEST';
    const onboardingMode: CompatibilityOnboardingMode =
      eligibilityMode === 'AVAILABLE'
        ? 'PRECHECK_CONNECT'
        : eligibilityMode === 'NOT_AVAILABLE'
          ? 'DIRECT_CONNECT'
          : 'MANUAL_REVIEW';
    return {
      eligibilityMode,
      onboardingMode,
      oemPath,
      routingNote,
      guidance: this.buildOnboardingGuidance(
        eligibilityMode,
        onboardingMode,
        oemPath,
      ),
    };
  }

  private buildOnboardingGuidance(
    eligibility: CompatibilityEligibilityMode,
    onboarding: CompatibilityOnboardingMode,
    oemPath: 'ELIGIBILITY_FIRST' | 'DIRECT_FLEET_CLEARANCE' | 'UNKNOWN',
  ): string {
    const parts: string[] = [];
    switch (eligibility) {
      case 'AVAILABLE':
        parts.push('Eligibility-API verfügbar — Precheck möglich vor Fleet-Clearance.');
        break;
      case 'NOT_AVAILABLE':
        parts.push('Eligibility-API nicht verfügbar — Direct Fleet Clearance aktivieren (VW/Porsche-Pfad).');
        break;
      case 'SUPPORT_REQUEST':
        parts.push('Eligibility-API liefert kein klares Urteil — Support Request erforderlich.');
        break;
      case 'VIN_DEPENDENT':
        parts.push('Eligibility ist VIN-abhängig — Klärung nur mit konkreter Fahrzeug-VIN.');
        break;
    }
    switch (onboarding) {
      case 'PRECHECK_CONNECT':
        parts.push('Onboarding: Precheck → Connect.');
        break;
      case 'DIRECT_CONNECT':
        parts.push('Onboarding: Direct Connect (kein Precheck).');
        break;
      case 'MANUAL_REVIEW':
        parts.push('Onboarding: Manuelle Prüfung / Support Flow.');
        break;
    }
    if (oemPath === 'UNKNOWN') {
      parts.push('Hinweis: Brand ist im OEM-Routing nicht bekannt — sichere Default-Route ist Direct Clearance.');
    }
    return parts.join(' ');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private normalizeModel(model: string): string {
    return model
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  }

  private formatYearRange(
    from: number | null,
    to: number | null,
  ): string | null {
    if (from == null && to == null) return null;
    if (from != null && to == null) return `MY ${from}+`;
    if (from == null && to != null) return `bis MY ${to}`;
    if (from === to) return `MY ${from}`;
    return `MY ${from}–${to}`;
  }

  private buildNotFoundReason(
    brand: string,
    model: string,
    year: number | null,
  ): string {
    const yr = year != null ? ` (Modelljahr ${year})` : '';
    return (
      `Für "${brand} ${model}"${yr} ist noch kein HM-Compatibility-Datensatz gepflegt. ` +
      'Fallback-Onboarding-Empfehlung basiert auf der OEM-Routing-Regel der Marke.'
    );
  }

  // ── Admin mutation helpers (used by seed script) ─────────────────────────

  /**
   * Upsert a compatibility record + its signals. Used by the seed script and
   * later possibly by an admin editor. Not exposed as HTTP endpoint in V1.
   */
  async upsertRecord(payload: {
    brand: string;
    brandDisplayName: string;
    model: string;
    modelDisplayName: string;
    modelYearFrom: number | null;
    modelYearTo: number | null;
    supportFromText?: string | null;
    eligibilityMode: CompatibilityEligibilityMode;
    onboardingMode: CompatibilityOnboardingMode;
    healthAppStatus?: CompatibilityAppStatus | null;
    telemetryAppStatus?: CompatibilityAppStatus | null;
    overallStatus?: CompatibilityOverall | null;
    supportSource?: string | null;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    notes?: string | null;
    lastReviewedAt?: Date | null;
    signals: Array<
      Omit<SignalCoverageItem, 'app'> & { app: 'HEALTH' | 'TELEMETRY' }
    >;
  }): Promise<string> {
    const brand = normalizeToHmBrand(payload.brand);
    const model = this.normalizeModel(payload.model);

    const baseData: Prisma.HighMobilityCompatibilityRecordUncheckedCreateInput = {
      brand,
      brandDisplayName: payload.brandDisplayName,
      model,
      modelDisplayName: payload.modelDisplayName,
      modelYearFrom: payload.modelYearFrom,
      modelYearTo: payload.modelYearTo,
      supportFromText: payload.supportFromText ?? null,
      eligibilityMode: payload.eligibilityMode,
      onboardingMode: payload.onboardingMode,
      healthAppStatus: payload.healthAppStatus ?? null,
      telemetryAppStatus: payload.telemetryAppStatus ?? null,
      overallStatus: payload.overallStatus ?? null,
      supportSource: payload.supportSource ?? null,
      confidence: payload.confidence,
      notes: payload.notes ?? null,
      lastReviewedAt: payload.lastReviewedAt ?? null,
    };

    // Compound unique includes nullable model-year columns, which Prisma's
    // upsert where-type does not accept (it requires non-null compound keys).
    // We emulate upsert via findFirst → create/update with identical match.
    const existing = await this.prisma.highMobilityCompatibilityRecord.findFirst({
      where: {
        brand,
        model,
        modelYearFrom: payload.modelYearFrom ?? null,
        modelYearTo: payload.modelYearTo ?? null,
      },
      select: { id: true },
    });

    const record = existing
      ? await this.prisma.highMobilityCompatibilityRecord.update({
          where: { id: existing.id },
          data: {
            brandDisplayName: baseData.brandDisplayName,
            modelDisplayName: baseData.modelDisplayName,
            supportFromText: baseData.supportFromText,
            eligibilityMode: baseData.eligibilityMode,
            onboardingMode: baseData.onboardingMode,
            healthAppStatus: baseData.healthAppStatus,
            telemetryAppStatus: baseData.telemetryAppStatus,
            overallStatus: baseData.overallStatus,
            supportSource: baseData.supportSource,
            confidence: baseData.confidence,
            notes: baseData.notes,
            lastReviewedAt: baseData.lastReviewedAt,
          },
        })
      : await this.prisma.highMobilityCompatibilityRecord.create({
          data: baseData,
        });

    // Replace signals atomically (simpler than per-row upsert; V1 is fine with this).
    await this.prisma.highMobilityCompatibilitySignal.deleteMany({
      where: { compatibilityRecordId: record.id },
    });
    if (payload.signals.length > 0) {
      await this.prisma.highMobilityCompatibilitySignal.createMany({
        data: payload.signals.map((s, idx) => ({
          compatibilityRecordId: record.id,
          app: s.app,
          signalKey: s.signalKey,
          signalLabel: s.signalLabel,
          signalGroup: s.signalGroup,
          required: s.required,
          coverage: s.coverage,
          confidence: s.confidence,
          notes: s.notes ?? null,
          displayOrder: s.displayOrder ?? idx,
        })),
      });
    }
    return record.id;
  }
}
