import { Injectable } from '@nestjs/common';
import { PriceTariffVersionStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { resolveLineItemSourceId } from './pricing-line-item-source.util';
import { isExtrasSumLineType, isTaxablePricingLineType } from './pricing-line-item-types';
import { PricingQuoteService } from './pricing-quote.service';
import type {
  PricingIntegrityAuditReport,
  PricingIntegrityCheckId,
  PricingIntegrityCheckResult,
  PricingIntegrityRepairReport,
  PricingIntegritySeverity,
  PricingIntegrityViolation,
} from './pricing-integrity-audit.types';

const MAX_SAMPLES_PER_CHECK = 25;

const CHECK_META: Record<
  PricingIntegrityCheckId,
  { severity: PricingIntegritySeverity; label: string }
> = {
  multiple_active_versions: { severity: 'error', label: 'Multiple ACTIVE tariff versions per group' },
  overlapping_version_windows: { severity: 'error', label: 'Overlapping effective version windows' },
  active_with_unpublished_draft: { severity: 'info', label: 'ACTIVE version with newer unpublished DRAFT' },
  multiple_effective_assignments: { severity: 'error', label: 'Multiple effective vehicle assignments' },
  inactive_group_active_assignment: { severity: 'warning', label: 'Inactive tariff group with active assignment' },
  assignment_invalid_target: { severity: 'error', label: 'Assignment references invalid group or price book' },
  missing_currency: { severity: 'error', label: 'Missing or empty price book currency' },
  invalid_money_amounts: { severity: 'error', label: 'Invalid or negative money amounts' },
  possible_migration_deposit: { severity: 'info', label: 'Deposit possibly from daily×3 migration (review only)' },
  booking_missing_snapshot: { severity: 'warning', label: 'Booking without pricing snapshot' },
  snapshot_missing_tariff_version: { severity: 'error', label: 'Snapshot without tariff version ID' },
  snapshot_currency_mismatch: { severity: 'error', label: 'Snapshot currency mismatch' },
  line_item_missing_source_id: { severity: 'warning', label: 'Option line item without stable source ID' },
  orphaned_draft: { severity: 'warning', label: 'Orphaned DRAFT version' },
  orphaned_or_invalid_quote: { severity: 'warning', label: 'Orphaned or invalid pricing quote' },
  quote_reuse_anomaly: { severity: 'error', label: 'Quote consumption anomaly' },
  snapshot_deposit_in_revenue: { severity: 'error', label: 'Deposit counted in taxable revenue or extras' },
  group_without_live_or_scheduled: { severity: 'warning', label: 'Tariff group without ACTIVE or SCHEDULED version' },
};

@Injectable()
export class PricingIntegrityAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quoteService: PricingQuoteService,
  ) {}

  async runAudit(organizationId?: string): Promise<PricingIntegrityAuditReport> {
    const orgIds = organizationId
      ? [organizationId]
      : (await this.prisma.organization.findMany({ select: { id: true } })).map((o) => o.id);

    const allViolations: PricingIntegrityViolation[] = [];

    for (const orgId of orgIds) {
      const orgViolations = await this.auditOrganization(orgId);
      allViolations.push(...orgViolations);
    }

    return {
      mode: 'audit',
      generatedAt: new Date().toISOString(),
      organizationId: organizationId ?? null,
      organizationCount: orgIds.length,
      summary: {
        errors: allViolations.filter((v) => this.severityFor(v.checkId) === 'error').length,
        warnings: allViolations.filter((v) => this.severityFor(v.checkId) === 'warning').length,
        infos: allViolations.filter((v) => this.severityFor(v.checkId) === 'info').length,
      },
      checks: this.groupViolations(allViolations),
    };
  }

  async runRepair(options: {
    organizationId: string;
    dryRun: boolean;
    confirmed: boolean;
  }): Promise<PricingIntegrityRepairReport> {
    const audit = await this.runAudit(options.organizationId);
    const actions: PricingIntegrityRepairReport['actions'] = [];
    const skipped: PricingIntegrityRepairReport['skipped'] = [];

    if (!options.confirmed) {
      skipped.push({ reason: 'Repair requires --confirm flag' });
      return {
        mode: 'repair',
        dryRun: options.dryRun,
        confirmed: false,
        generatedAt: new Date().toISOString(),
        organizationId: options.organizationId,
        actions,
        skipped,
        audit,
      };
    }

    if (options.dryRun) {
      const staleCandidates = await this.prisma.pricingQuote.count({
        where: {
          organizationId: options.organizationId,
          status: 'ACTIVE',
          expiresAt: { lt: new Date() },
        },
      });
      if (staleCandidates > 0) {
        actions.push({
          actionId: 'expire_stale_quotes',
          organizationId: options.organizationId,
          entityType: 'pricing_quote',
          entityId: '*',
          description: `Mark ${staleCandidates} stale ACTIVE quote(s) as EXPIRED`,
          before: { status: 'ACTIVE' },
          after: { status: 'EXPIRED', count: staleCandidates },
        });
      }
    } else {
      const expired = await this.quoteService.expireStaleQuotes(options.organizationId);
      if (expired > 0) {
        actions.push({
          actionId: 'expire_stale_quotes',
          organizationId: options.organizationId,
          entityType: 'pricing_quote',
          entityId: '*',
          description: `Marked ${expired} stale ACTIVE quote(s) as EXPIRED`,
          before: { status: 'ACTIVE' },
          after: { status: 'EXPIRED', count: expired },
        });
      }
    }

    const inactiveAssignments =
      audit.checks.find((c) => c.checkId === 'inactive_group_active_assignment')?.violations ?? [];

    for (const v of inactiveAssignments.slice(0, MAX_SAMPLES_PER_CHECK)) {
      if (options.dryRun) {
        actions.push({
          actionId: 'deactivate_assignment_on_inactive_group',
          organizationId: options.organizationId,
          entityType: v.entityType,
          entityId: v.entityId,
          description: 'Deactivate assignment on inactive tariff group',
          before: { isActive: true },
          after: { isActive: false },
        });
      } else {
        const before = await this.prisma.vehicleTariffAssignment.findUnique({
          where: { id: v.entityId },
          select: { isActive: true },
        });
        if (before?.isActive) {
          await this.prisma.vehicleTariffAssignment.update({
            where: { id: v.entityId },
            data: { isActive: false },
          });
          actions.push({
            actionId: 'deactivate_assignment_on_inactive_group',
            organizationId: options.organizationId,
            entityType: v.entityType,
            entityId: v.entityId,
            description: 'Deactivated assignment on inactive tariff group',
            before: { isActive: true },
            after: { isActive: false },
          });
        }
      }
    }

    const repairedIds = new Set(actions.map((a) => a.actionId));
    for (const check of audit.checks) {
      if (check.count === 0) continue;
      if (check.checkId === 'orphaned_or_invalid_quote' && repairedIds.has('expire_stale_quotes')) {
        continue;
      }
      if (check.checkId === 'inactive_group_active_assignment' && actions.some((a) => a.actionId === 'deactivate_assignment_on_inactive_group')) {
        continue;
      }
      if (check.severity === 'error' || (check.severity === 'warning' && check.count > 0)) {
        const alreadySkipped = skipped.some((s) => s.checkId === check.checkId);
        if (!alreadySkipped && !['orphaned_or_invalid_quote', 'inactive_group_active_assignment', 'active_with_unpublished_draft', 'possible_migration_deposit'].includes(check.checkId)) {
          skipped.push({
            reason: 'No automatic repair — manual review required',
            checkId: check.checkId,
          });
        }
      }
    }

    return {
      mode: 'repair',
      dryRun: options.dryRun,
      confirmed: options.confirmed,
      generatedAt: new Date().toISOString(),
      organizationId: options.organizationId,
      actions,
      skipped,
      audit,
    };
  }

  private severityFor(checkId: PricingIntegrityCheckId): PricingIntegritySeverity {
    return CHECK_META[checkId].severity;
  }

  private groupViolations(violations: PricingIntegrityViolation[]): PricingIntegrityCheckResult[] {
    const byCheck = new Map<PricingIntegrityCheckId, PricingIntegrityViolation[]>();
    for (const v of violations) {
      const list = byCheck.get(v.checkId) ?? [];
      list.push(v);
      byCheck.set(v.checkId, list);
    }

    return (Object.keys(CHECK_META) as PricingIntegrityCheckId[]).map((checkId) => {
      const list = byCheck.get(checkId) ?? [];
      return {
        checkId,
        severity: CHECK_META[checkId].severity,
        count: list.length,
        violations: list.slice(0, MAX_SAMPLES_PER_CHECK),
      };
    });
  }

  private async auditOrganization(orgId: string): Promise<PricingIntegrityViolation[]> {
    const violations: PricingIntegrityViolation[] = [];

    const [groups, versions, assignments, priceBooks, snapshots, quotes] = await Promise.all([
      this.prisma.priceTariffGroup.findMany({
        where: { organizationId: orgId },
        select: { id: true, name: true, isActive: true, priceBookId: true },
      }),
      this.prisma.priceTariffVersion.findMany({
        where: { organizationId: orgId },
        include: {
          rate: true,
          mileagePackages: true,
          tariffGroup: { select: { id: true, name: true, isActive: true } },
        },
      }),
      this.prisma.vehicleTariffAssignment.findMany({
        where: { organizationId: orgId },
        include: {
          tariffGroup: { select: { id: true, name: true, isActive: true, priceBookId: true } },
        },
      }),
      this.prisma.priceBook.findMany({
        where: { organizationId: orgId },
        select: { id: true, currency: true, isActive: true, name: true },
      }),
      this.prisma.bookingPriceSnapshot.findMany({
        where: { organizationId: orgId },
        include: {
          lineItems: true,
          booking: { select: { id: true, status: true, currency: true } },
          priceBook: { select: { currency: true } },
        },
      }),
      this.prisma.pricingQuote.findMany({
        where: { organizationId: orgId },
        select: {
          id: true,
          status: true,
          expiresAt: true,
          consumedByBookingId: true,
          tariffVersionId: true,
        },
      }),
    ]);

    const priceBookById = new Map(priceBooks.map((b) => [b.id, b]));
    const versionsByGroup = new Map<string, typeof versions>();
    for (const v of versions) {
      const list = versionsByGroup.get(v.tariffGroupId) ?? [];
      list.push(v);
      versionsByGroup.set(v.tariffGroupId, list);
    }

    for (const group of groups) {
      const groupVersions = versionsByGroup.get(group.id) ?? [];
      const activeVersions = groupVersions.filter((v) => v.status === 'ACTIVE');
      const draftVersions = groupVersions.filter((v) => v.status === 'DRAFT');
      const scheduledVersions = groupVersions.filter((v) => v.status === 'SCHEDULED');

      if (activeVersions.length > 1) {
        violations.push({
          checkId: 'multiple_active_versions',
          severity: 'error',
          organizationId: orgId,
          message: `Tariff group "${group.name}" has ${activeVersions.length} ACTIVE versions`,
          entityType: 'price_tariff_group',
          entityId: group.id,
          details: { activeCount: activeVersions.length },
        });
      }

      if (activeVersions.length === 0 && scheduledVersions.length === 0 && group.isActive) {
        violations.push({
          checkId: 'group_without_live_or_scheduled',
          severity: 'warning',
          organizationId: orgId,
          message: `Active tariff group "${group.name}" has no ACTIVE or SCHEDULED version`,
          entityType: 'price_tariff_group',
          entityId: group.id,
        });
      }

      if (activeVersions.length > 0 && draftVersions.length > 0) {
        const maxDraft = Math.max(...draftVersions.map((d) => d.versionNumber));
        const active = activeVersions[0];
        if (maxDraft > active.versionNumber) {
          violations.push({
            checkId: 'active_with_unpublished_draft',
            severity: 'info',
            organizationId: orgId,
            message: `Tariff group "${group.name}" has ACTIVE v${active.versionNumber} and unpublished DRAFT v${maxDraft}`,
            entityType: 'price_tariff_group',
            entityId: group.id,
            details: { activeVersionNumber: active.versionNumber, draftVersionNumber: maxDraft },
          });
        }
      }

      const book = priceBookById.get(group.priceBookId);
      if (!book?.currency?.trim()) {
        violations.push({
          checkId: 'missing_currency',
          severity: 'error',
          organizationId: orgId,
          message: `Price book for group "${group.name}" has no currency`,
          entityType: 'price_book',
          entityId: group.priceBookId,
        });
      }
    }

    for (const [, groupVersions] of versionsByGroup) {
      const effective = groupVersions.filter(
        (v) =>
          v.status === PriceTariffVersionStatus.ACTIVE ||
          v.status === PriceTariffVersionStatus.SCHEDULED ||
          v.status === PriceTariffVersionStatus.ARCHIVED,
      );
      for (let i = 0; i < effective.length; i++) {
        for (let j = i + 1; j < effective.length; j++) {
          const a = effective[i];
          const b = effective[j];
          if (this.windowsOverlap(a.validFrom, a.validTo, b.validFrom, b.validTo)) {
            violations.push({
              checkId: 'overlapping_version_windows',
              severity: 'error',
              organizationId: orgId,
              message: `Versions v${a.versionNumber} and v${b.versionNumber} overlap`,
              entityType: 'price_tariff_version',
              entityId: a.id,
              details: { otherVersionId: b.id },
            });
          }
        }
      }
    }

    for (const v of versions) {
      if (v.status === 'DRAFT' && !v.tariffGroup) {
        violations.push({
          checkId: 'orphaned_draft',
          severity: 'warning',
          organizationId: orgId,
          message: `DRAFT v${v.versionNumber} has no tariff group`,
          entityType: 'price_tariff_version',
          entityId: v.id,
        });
      }

      const rate = v.rate;
      if (rate) {
        const moneyFields: Array<[string, number]> = [
          ['dailyRateCents', rate.dailyRateCents],
          ['weeklyRateCents', rate.weeklyRateCents],
          ['monthlyRateCents', rate.monthlyRateCents],
          ['extraKmPriceCents', rate.extraKmPriceCents],
          ['depositAmountCents', rate.depositAmountCents],
        ];
        for (const [field, cents] of moneyFields) {
          if (cents < 0 || !Number.isFinite(cents)) {
            violations.push({
              checkId: 'invalid_money_amounts',
              severity: 'error',
              organizationId: orgId,
              message: `Version v${v.versionNumber} invalid ${field}: ${cents}`,
              entityType: 'tariff_rate',
              entityId: rate.id,
              details: { field, cents },
            });
          }
        }

        if (
          rate.dailyRateCents > 0 &&
          rate.depositAmountCents > 0 &&
          rate.depositAmountCents === rate.dailyRateCents * 3
        ) {
          violations.push({
            checkId: 'possible_migration_deposit',
            severity: 'info',
            organizationId: orgId,
            message: `v${v.versionNumber} deposit equals daily×3 — migration candidate (not automatically wrong)`,
            entityType: 'tariff_rate',
            entityId: rate.id,
            details: {
              depositAmountCents: rate.depositAmountCents,
              dailyRateCents: rate.dailyRateCents,
            },
          });
        }
      } else if (v.status !== 'DRAFT') {
        violations.push({
          checkId: 'invalid_money_amounts',
          severity: 'error',
          organizationId: orgId,
          message: `Version v${v.versionNumber} (${v.status}) missing tariff rate`,
          entityType: 'price_tariff_version',
          entityId: v.id,
        });
      }

      for (const pkg of v.mileagePackages) {
        if (pkg.priceCents < 0) {
          violations.push({
            checkId: 'invalid_money_amounts',
            severity: 'error',
            organizationId: orgId,
            message: `Mileage package negative price`,
            entityType: 'mileage_package',
            entityId: pkg.id,
          });
        }
      }
    }

    const now = new Date();
    const assignmentsByVehicle = new Map<string, typeof assignments>();
    for (const a of assignments) {
      if (!a.isActive) continue;
      const effective = a.validFrom <= now && (a.validTo == null || a.validTo > now);
      if (!effective) continue;
      const list = assignmentsByVehicle.get(a.vehicleId) ?? [];
      list.push(a);
      assignmentsByVehicle.set(a.vehicleId, list);
    }

    for (const [vehicleId, list] of assignmentsByVehicle) {
      if (list.length > 1) {
        violations.push({
          checkId: 'multiple_effective_assignments',
          severity: 'error',
          organizationId: orgId,
          message: `Vehicle has ${list.length} effective assignments`,
          entityType: 'vehicle',
          entityId: vehicleId,
        });
      }
    }

    for (const a of assignments) {
      if (!a.isActive) continue;
      if (a.tariffGroup && !a.tariffGroup.isActive) {
        violations.push({
          checkId: 'inactive_group_active_assignment',
          severity: 'warning',
          organizationId: orgId,
          message: `Active assignment on inactive group "${a.tariffGroup.name}"`,
          entityType: 'vehicle_tariff_assignment',
          entityId: a.id,
        });
      }
      if (!a.tariffGroup) {
        violations.push({
          checkId: 'assignment_invalid_target',
          severity: 'error',
          organizationId: orgId,
          message: 'Assignment references missing tariff group',
          entityType: 'vehicle_tariff_assignment',
          entityId: a.id,
        });
        continue;
      }
      const book = priceBookById.get(a.tariffGroup.priceBookId);
      if (!book || !book.isActive) {
        violations.push({
          checkId: 'assignment_invalid_target',
          severity: 'error',
          organizationId: orgId,
          message: `Assignment references inactive or missing price book`,
          entityType: 'vehicle_tariff_assignment',
          entityId: a.id,
        });
      }
    }

    const bookingsWithoutSnapshot = await this.prisma.booking.findMany({
      where: {
        organizationId: orgId,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        priceSnapshots: { none: {} },
      },
      select: { id: true, status: true },
      take: MAX_SAMPLES_PER_CHECK,
    });

    for (const b of bookingsWithoutSnapshot) {
      violations.push({
        checkId: 'booking_missing_snapshot',
        severity: 'warning',
        organizationId: orgId,
        message: `Booking (${b.status}) has no pricing snapshot`,
        entityType: 'booking',
        entityId: b.id,
      });
    }

    for (const snap of snapshots) {
      if (!snap.tariffVersionId) {
        violations.push({
          checkId: 'snapshot_missing_tariff_version',
          severity: 'error',
          organizationId: orgId,
          message: 'Snapshot missing tariffVersionId',
          entityType: 'booking_price_snapshot',
          entityId: snap.id,
        });
      }

      const bookCurrency = snap.priceBook?.currency?.toUpperCase();
      const snapCurrency = snap.currency?.toUpperCase();
      const bookingCurrency = snap.booking?.currency?.toUpperCase();
      if (bookCurrency && snapCurrency && bookCurrency !== snapCurrency) {
        violations.push({
          checkId: 'snapshot_currency_mismatch',
          severity: 'error',
          organizationId: orgId,
          message: `Snapshot currency ${snapCurrency} ≠ price book ${bookCurrency}`,
          entityType: 'booking_price_snapshot',
          entityId: snap.id,
        });
      }
      if (snapCurrency && bookingCurrency && snapCurrency !== bookingCurrency) {
        violations.push({
          checkId: 'snapshot_currency_mismatch',
          severity: 'error',
          organizationId: orgId,
          message: `Snapshot currency ${snapCurrency} ≠ booking ${bookingCurrency}`,
          entityType: 'booking_price_snapshot',
          entityId: snap.id,
        });
      }

      const depositLine = snap.lineItems.find((li) => li.type === 'DEPOSIT');
      const depositTaxed = depositLine != null && depositLine.taxRatePercent > 0;
      const depositInExtras = snap.lineItems.some(
        (li) => li.type === 'DEPOSIT' && isExtrasSumLineType(li.type as never),
      );

      if (depositTaxed || depositInExtras) {
        violations.push({
          checkId: 'snapshot_deposit_in_revenue',
          severity: 'error',
          organizationId: orgId,
          message: 'Deposit in taxable revenue or extras bucket',
          entityType: 'booking_price_snapshot',
          entityId: snap.id,
        });
      }

      if (depositLine && snap.depositAmountCents !== depositLine.totalGrossCents) {
        violations.push({
          checkId: 'snapshot_deposit_in_revenue',
          severity: 'error',
          organizationId: orgId,
          message: 'depositAmountCents ≠ DEPOSIT line gross',
          entityType: 'booking_price_snapshot',
          entityId: snap.id,
        });
      }

      if (
        snap.totalDueNowCents != null &&
        snap.totalGrossCents + snap.depositAmountCents !== snap.totalDueNowCents
      ) {
        violations.push({
          checkId: 'snapshot_deposit_in_revenue',
          severity: 'error',
          organizationId: orgId,
          message: 'totalDueNowCents ≠ totalGross + deposit',
          entityType: 'booking_price_snapshot',
          entityId: snap.id,
        });
      }

      for (const li of snap.lineItems) {
        if (li.type === 'INSURANCE' || li.type === 'EXTRA' || li.type === 'MILEAGE_PACKAGE') {
          if (!resolveLineItemSourceId(li.metadataJson)) {
            violations.push({
              checkId: 'line_item_missing_source_id',
              severity: 'warning',
              organizationId: orgId,
              message: `Line item (${li.type}) missing sourceId`,
              entityType: 'booking_price_line_item',
              entityId: li.id,
            });
          }
        }
        if (li.type === 'DEPOSIT' && isTaxablePricingLineType(li.type)) {
          violations.push({
            checkId: 'snapshot_deposit_in_revenue',
            severity: 'error',
            organizationId: orgId,
            message: 'DEPOSIT line treated as taxable',
            entityType: 'booking_price_line_item',
            entityId: li.id,
          });
        }
      }
    }

    for (const q of quotes) {
      if (q.status === 'CONSUMED' && !q.consumedByBookingId) {
        violations.push({
          checkId: 'quote_reuse_anomaly',
          severity: 'error',
          organizationId: orgId,
          message: 'CONSUMED quote without consumedByBookingId',
          entityType: 'pricing_quote',
          entityId: q.id,
        });
      }
      if (q.status === 'ACTIVE' && q.expiresAt < now) {
        violations.push({
          checkId: 'orphaned_or_invalid_quote',
          severity: 'warning',
          organizationId: orgId,
          message: 'ACTIVE quote past expiresAt',
          entityType: 'pricing_quote',
          entityId: q.id,
        });
      }
      if (!q.tariffVersionId) {
        violations.push({
          checkId: 'orphaned_or_invalid_quote',
          severity: 'warning',
          organizationId: orgId,
          message: 'Quote missing tariffVersionId',
          entityType: 'pricing_quote',
          entityId: q.id,
        });
      }
    }

    return violations;
  }

  private windowsOverlap(
    aFrom: Date,
    aTo: Date | null,
    bFrom: Date,
    bTo: Date | null,
  ): boolean {
    const aEnd = aTo ?? new Date('9999-12-31T00:00:00.000Z');
    const bEnd = bTo ?? new Date('9999-12-31T00:00:00.000Z');
    return aFrom < bEnd && bFrom < aEnd;
  }
}
