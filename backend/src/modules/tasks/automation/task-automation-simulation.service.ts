import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InsightType, Prisma, TaskCompletionMode, TaskStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { UpsertTaskAutomationRuleOverrideInput } from './task-automation-rule-override.service';
import { buildProposedResolvedRule } from './task-automation-proposed-rule.util';
import { TaskAutomationRuleResolverService } from './task-automation-rule-resolver.service';
import {
  INVOICE_PAYMENT_TASK_DEDUP_PREFIX,
  LEGACY_INVOICE_UNPAID_DEDUP_PREFIX,
  VEHICLE_CLEANING_TASK_DEDUP_PREFIX,
  listMaterializationAutomationRules,
} from './task-automation-rule.util';
import type {
  ResolvedTaskAutomationRule,
  TaskAutomationCatalogKey,
  TaskAutomationRuleDefinition,
} from './task-automation-rule.types';

export const DEFAULT_SIMULATION_PERIOD_DAYS = 30;
export const MAX_SIMULATION_PERIOD_DAYS = 90;
export const MAX_SIMULATION_ENTITY_SCAN = 500;
export const MAX_SIMULATION_EXAMPLES = 5;

const ACTIVE_TASK_STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING'];

export interface TaskAutomationSimulationExample {
  labelDe: string;
  contextDe?: string;
  outcomeDe: 'created' | 'deduplicated' | 'active' | 'auto_resolved' | 'skipped' | 'trigger_only';
}

export interface TaskAutomationSimulationResult {
  ruleId: string;
  catalogKey: TaskAutomationCatalogKey;
  nameDe: string;
  disclaimerDe: string;
  period: {
    from: string;
    to: string;
    days: number;
  };
  proposedEffectivelyEnabled: boolean;
  dataQuality: {
    complete: boolean;
    warningsDe: string[];
    entitiesScanned: number;
    entitiesTruncated: boolean;
  };
  estimates: {
    triggerEvents: number;
    tasksWouldBeCreated: number;
    deduplicatedMerges: number;
    currentlyActive: number;
    autoResolved: number;
  };
  summaryDe: string;
  examples: TaskAutomationSimulationExample[];
}

interface SimulationPeriod {
  from: Date;
  to: Date;
  days: number;
}

interface TaskSample {
  id: string;
  dedupKey: string | null;
  status: TaskStatus;
  completionMode: TaskCompletionMode | null;
  createdAt: Date;
  completedAt: Date | null;
  title: string;
  bookingId: string | null;
  vehicleId: string | null;
  invoiceId: string | null;
}

const DEDUP_PREFIXES: Record<TaskAutomationCatalogKey, string[]> = {
  BOOKING_PREPARATION: ['booking:prep:', 'document:package:CONFIRMED:'],
  BOOKING_PICKUP: ['booking:pickup:'],
  BOOKING_RETURN: ['booking:return:'],
  DOCUMENT_PACKAGE_INCOMPLETE: ['document:package:'],
  INVOICE_PAYMENT_CHECK: [INVOICE_PAYMENT_TASK_DEDUP_PREFIX, LEGACY_INVOICE_UNPAID_DEDUP_PREFIX],
  VEHICLE_CLEANING_REQUIRED: [VEHICLE_CLEANING_TASK_DEDUP_PREFIX, 'booking:clean:'],
  VEHICLE_SERVICE_OVERDUE: ['service_overdue:'],
  VEHICLE_INSPECTION_TUV_DUE: ['tuv_overdue:'],
  VEHICLE_INSPECTION_BOKRAFT_DUE: ['bokraft_overdue:'],
  TIRE_CRITICAL_HEALTH: ['tire_critical:'],
  BRAKE_CRITICAL_HEALTH: ['brake_critical:'],
  BATTERY_CRITICAL_HEALTH: ['battery_critical:'],
  REPAIR_REQUIRED: ['vendor:repair:'],
};

const INSIGHT_TYPES: Partial<Record<TaskAutomationCatalogKey, InsightType>> = {
  VEHICLE_SERVICE_OVERDUE: InsightType.SERVICE_OVERDUE,
  VEHICLE_INSPECTION_TUV_DUE: InsightType.TUV_OVERDUE,
  VEHICLE_INSPECTION_BOKRAFT_DUE: InsightType.BOKRAFT_OVERDUE,
  TIRE_CRITICAL_HEALTH: InsightType.TIRE_CRITICAL,
  BRAKE_CRITICAL_HEALTH: InsightType.BRAKE_CRITICAL,
  BATTERY_CRITICAL_HEALTH: InsightType.BATTERY_CRITICAL,
};

@Injectable()
export class TaskAutomationSimulationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: TaskAutomationRuleResolverService,
  ) {}

  async simulate(
    orgId: string,
    ruleId: string,
    input: {
      proposedConfig?: Partial<UpsertTaskAutomationRuleOverrideInput> | null;
      periodDays?: number;
    },
  ): Promise<TaskAutomationSimulationResult> {
    const rule = listMaterializationAutomationRules().find((entry) => entry.ruleId === ruleId);
    if (!rule?.catalogKey) {
      throw new NotFoundException(`Task automation rule ${ruleId} not found`);
    }

    const period = this.resolvePeriod(input.periodDays);
    const currentResolved = await this.resolver.resolveTaskAutomationRule(orgId, ruleId);
    const proposedResolved = buildProposedResolvedRule(currentResolved, input.proposedConfig ?? null);

    if (!proposedResolved.effectivelyEnabled) {
      return this.buildDisabledResult(rule, proposedResolved, period, orgId);
    }

    const warnings: string[] = [];
    const { triggerEvents, tasks, truncated } = await this.countTriggerEvents(
      orgId,
      rule,
      period,
      proposedResolved,
    );

    if (truncated) {
      warnings.push(
        `Nur die letzten ${MAX_SIMULATION_ENTITY_SCAN} passenden Aufgaben wurden ausgewertet — die Schätzung kann unvollständig sein.`,
      );
    }

    const uniqueDedupKeys = new Set(tasks.map((task) => task.dedupKey).filter(Boolean) as string[]);
    const tasksWouldBeCreated = uniqueDedupKeys.size > 0 ? uniqueDedupKeys.size : Math.min(triggerEvents, 1);
    const deduplicatedMerges = Math.max(0, triggerEvents - tasksWouldBeCreated);

    const autoResolved = tasks.filter(
      (task) => task.completionMode === TaskCompletionMode.AUTO_RESOLVED,
    ).length;
    const currentlyActive = tasks.filter((task) => ACTIVE_TASK_STATUSES.includes(task.status)).length;

    if (triggerEvents === 0 && tasks.length === 0) {
      warnings.push('Im gewählten Zeitraum wurden keine passenden Auslöser oder Aufgaben gefunden.');
    }

    if (triggerEvents > 0 && tasks.length === 0) {
      warnings.push(
        'Auslöser wurden erkannt, aber es fehlen historische Aufgaben — die Schätzung basiert auf Ereignissen, nicht auf tatsächlichen Task-Läufen.',
      );
    }

    const examples = await this.buildExamples(orgId, rule, tasks, triggerEvents, deduplicatedMerges);

    const estimates = {
      triggerEvents,
      tasksWouldBeCreated,
      deduplicatedMerges,
      currentlyActive,
      autoResolved,
    };

    return {
      ruleId: rule.ruleId,
      catalogKey: rule.catalogKey,
      nameDe: rule.nameDe,
      disclaimerDe:
        'Diese Schätzung basiert auf historischen Daten und ersetzt keine exakte Prognose. Künftige Aufgaben werden erst nach dem Speichern mit der neuen Konfiguration erzeugt; bestehende aktive Aufgaben bleiben unverändert.',
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        days: period.days,
      },
      proposedEffectivelyEnabled: true,
      dataQuality: {
        complete: warnings.length === 0,
        warningsDe: warnings,
        entitiesScanned: tasks.length + triggerEvents,
        entitiesTruncated: truncated,
      },
      estimates,
      summaryDe: this.buildSummaryDe(period.days, estimates),
      examples,
    };
  }

  private resolvePeriod(periodDays?: number): SimulationPeriod {
    const days = periodDays ?? DEFAULT_SIMULATION_PERIOD_DAYS;
    if (!Number.isInteger(days) || days < 1 || days > MAX_SIMULATION_PERIOD_DAYS) {
      throw new BadRequestException(
        `periodDays must be an integer between 1 and ${MAX_SIMULATION_PERIOD_DAYS}`,
      );
    }
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    return { from, to, days };
  }

  private async buildDisabledResult(
    rule: TaskAutomationRuleDefinition,
    proposedResolved: ResolvedTaskAutomationRule,
    period: SimulationPeriod,
    orgId: string,
  ): Promise<TaskAutomationSimulationResult> {
    const { triggerEvents } = await this.countTriggerEvents(orgId, rule, period, proposedResolved);
    const warnings =
      triggerEvents > 0
        ? [
            `Im Zeitraum wären etwa ${triggerEvents} Auslöser aufgetreten — mit deaktivierter Regel entstehen daraus keine neuen Aufgaben.`,
          ]
        : ['Regel ist deaktiviert — im gewählten Zeitraum wurden keine relevanten Auslöser gefunden.'];

    const estimates = {
      triggerEvents,
      tasksWouldBeCreated: 0,
      deduplicatedMerges: 0,
      currentlyActive: 0,
      autoResolved: 0,
    };

    return {
      ruleId: rule.ruleId,
      catalogKey: rule.catalogKey!,
      nameDe: rule.nameDe,
      disclaimerDe:
        'Deaktivierte Regeln erzeugen keine neuen Aufgaben. Die Schätzung zeigt nur unterdrückte Auslöser und ist keine exakte Garantie.',
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        days: period.days,
      },
      proposedEffectivelyEnabled: false,
      dataQuality: {
        complete: triggerEvents === 0,
        warningsDe: warnings,
        entitiesScanned: 0,
        entitiesTruncated: false,
      },
      estimates,
      summaryDe: `Mit deaktivierter Regel wären in den letzten ${period.days} Tagen voraussichtlich keine neuen Aufgaben entstanden${
        triggerEvents > 0 ? ` (${triggerEvents} Auslöser wären unterdrückt worden)` : ''
      }.`,
      examples: [],
    };
  }

  private async loadHistoricalTasks(
    orgId: string,
    rule: TaskAutomationRuleDefinition,
    period: SimulationPeriod,
  ): Promise<{ tasks: TaskSample[]; truncated: boolean }> {
    const catalogKey = rule.catalogKey!;
    const dedupPrefixes = DEDUP_PREFIXES[catalogKey];
    const dedupOr: Prisma.OrgTaskWhereInput[] = dedupPrefixes.map((prefix) => ({
      dedupKey: { startsWith: prefix },
    }));

    const where: Prisma.OrgTaskWhereInput = {
      organizationId: orgId,
      createdAt: { gte: period.from, lte: period.to },
      OR: dedupOr,
    };

    if (rule.taskType) {
      where.OR = [...dedupOr, { type: rule.taskType, source: rule.source }];
    }

    const rows = await this.prisma.orgTask.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: MAX_SIMULATION_ENTITY_SCAN + 1,
      select: {
        id: true,
        dedupKey: true,
        status: true,
        completionMode: true,
        createdAt: true,
        completedAt: true,
        title: true,
        bookingId: true,
        vehicleId: true,
        invoiceId: true,
      },
    });

    const truncated = rows.length > MAX_SIMULATION_ENTITY_SCAN;
    return {
      tasks: truncated ? rows.slice(0, MAX_SIMULATION_ENTITY_SCAN) : rows,
      truncated,
    };
  }

  private async countTriggerEvents(
    orgId: string,
    rule: TaskAutomationRuleDefinition,
    period: SimulationPeriod,
    resolved: ResolvedTaskAutomationRule,
  ): Promise<{ triggerEvents: number; tasks: TaskSample[]; truncated: boolean }> {
    const catalogKey = rule.catalogKey!;
    let triggerEvents = 0;

    switch (catalogKey) {
      case 'BOOKING_PREPARATION':
      case 'BOOKING_PICKUP':
        triggerEvents = await this.prisma.booking.count({
          where: {
            organizationId: orgId,
            createdAt: { gte: period.from, lte: period.to },
            status: { in: ['CONFIRMED', 'ACTIVE', 'COMPLETED'] },
            ...(resolved.effective.stationScope
              ? { pickupStationId: resolved.effective.stationScope }
              : {}),
          },
        });
        break;
      case 'BOOKING_RETURN':
        triggerEvents = await this.prisma.booking.count({
          where: {
            organizationId: orgId,
            updatedAt: { gte: period.from, lte: period.to },
            status: { in: ['ACTIVE', 'COMPLETED'] },
            ...(resolved.effective.stationScope
              ? { returnStationId: resolved.effective.stationScope }
              : {}),
          },
        });
        break;
      case 'DOCUMENT_PACKAGE_INCOMPLETE':
        triggerEvents = await this.prisma.orgTask.count({
          where: {
            organizationId: orgId,
            createdAt: { gte: period.from, lte: period.to },
            OR: DEDUP_PREFIXES.DOCUMENT_PACKAGE_INCOMPLETE.map((prefix) => ({
              dedupKey: { startsWith: prefix },
            })),
          },
        });
        if (triggerEvents === 0) {
          triggerEvents = await this.prisma.booking.count({
            where: {
              organizationId: orgId,
              createdAt: { gte: period.from, lte: period.to },
              status: { in: ['CONFIRMED', 'ACTIVE'] },
            },
          });
        }
        break;
      case 'INVOICE_PAYMENT_CHECK':
        triggerEvents = await this.prisma.orgInvoice.count({
          where: {
            organizationId: orgId,
            issuedAt: { gte: period.from, lte: period.to },
            outstandingCents: { gt: 0 },
            status: { in: ['ISSUED', 'SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
          },
        });
        break;
      case 'VEHICLE_CLEANING_REQUIRED':
        triggerEvents = await this.prisma.vehicle.count({
          where: {
            organizationId: orgId,
            cleaningStatus: 'NEEDS_CLEANING',
            updatedAt: { gte: period.from, lte: period.to },
            ...(resolved.effective.stationScope ? { stationId: resolved.effective.stationScope } : {}),
          },
        });
        break;
      default: {
        const insightType = INSIGHT_TYPES[catalogKey];
        if (insightType) {
          triggerEvents = await this.prisma.dashboardInsight.count({
            where: {
              organizationId: orgId,
              type: insightType,
              createdAt: { gte: period.from, lte: period.to },
            },
          });
        } else if (catalogKey === 'REPAIR_REQUIRED') {
          triggerEvents = await this.prisma.orgTask.count({
            where: {
              organizationId: orgId,
              createdAt: { gte: period.from, lte: period.to },
              dedupKey: { startsWith: 'vendor:repair:' },
            },
          });
        }
        break;
      }
    }

    const scopedTasks = await this.loadHistoricalTasks(orgId, rule, period);
    const effectiveTriggers = Math.max(triggerEvents, scopedTasks.tasks.length);
    return {
      triggerEvents: effectiveTriggers,
      tasks: scopedTasks.tasks,
      truncated: scopedTasks.truncated,
    };
  }

  private async buildExamples(
    orgId: string,
    rule: TaskAutomationRuleDefinition,
    tasks: TaskSample[],
    triggerEvents: number,
    deduplicatedMerges: number,
  ): Promise<TaskAutomationSimulationExample[]> {
    const examples: TaskAutomationSimulationExample[] = [];
    const bookingIds = [...new Set(tasks.map((task) => task.bookingId).filter(Boolean))] as string[];
    const vehicleIds = [...new Set(tasks.map((task) => task.vehicleId).filter(Boolean))] as string[];
    const invoiceIds = [...new Set(tasks.map((task) => task.invoiceId).filter(Boolean))] as string[];

    const [bookings, vehicles, invoices] = await Promise.all([
      bookingIds.length
        ? this.prisma.booking.findMany({
            where: { organizationId: orgId, id: { in: bookingIds.slice(0, MAX_SIMULATION_EXAMPLES) } },
            select: { id: true, status: true, startDate: true },
          })
        : Promise.resolve([]),
      vehicleIds.length
        ? this.prisma.vehicle.findMany({
            where: { organizationId: orgId, id: { in: vehicleIds.slice(0, MAX_SIMULATION_EXAMPLES) } },
            select: { id: true, licensePlate: true },
          })
        : Promise.resolve([]),
      invoiceIds.length
        ? this.prisma.orgInvoice.findMany({
            where: { organizationId: orgId, id: { in: invoiceIds.slice(0, MAX_SIMULATION_EXAMPLES) } },
            select: { id: true, invoiceNumberDisplay: true, title: true },
          })
        : Promise.resolve([]),
    ]);

    const bookingLabel = new Map(
      bookings.map((booking) => [
        booking.id,
        `Buchung ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'short' }).format(booking.startDate)}`,
      ]),
    );
    const vehicleLabel = new Map(
      vehicles.map((vehicle) => [vehicle.id, vehicle.licensePlate ? `Fahrzeug ${vehicle.licensePlate}` : 'Fahrzeug']),
    );
    const invoiceLabel = new Map(
      invoices.map((invoice) => [
        invoice.id,
        invoice.invoiceNumberDisplay
          ? `Rechnung ${invoice.invoiceNumberDisplay}`
          : invoice.title || 'Rechnung',
      ]),
    );

    for (const task of tasks.slice(0, MAX_SIMULATION_EXAMPLES)) {
      const context =
        (task.bookingId && bookingLabel.get(task.bookingId)) ||
        (task.vehicleId && vehicleLabel.get(task.vehicleId)) ||
        (task.invoiceId && invoiceLabel.get(task.invoiceId)) ||
        undefined;

      let outcomeDe: TaskAutomationSimulationExample['outcomeDe'] = 'created';
      if (task.completionMode === TaskCompletionMode.AUTO_RESOLVED) outcomeDe = 'auto_resolved';
      else if (ACTIVE_TASK_STATUSES.includes(task.status)) outcomeDe = 'active';

      examples.push({
        labelDe: task.title || rule.nameDe,
        contextDe: context,
        outcomeDe,
      });
    }

    if (deduplicatedMerges > 0 && examples.length < MAX_SIMULATION_EXAMPLES) {
      examples.push({
        labelDe: rule.nameDe,
        contextDe: `${deduplicatedMerges} wiederholte Auslöser`,
        outcomeDe: 'deduplicated',
      });
    }

    if (examples.length === 0 && triggerEvents > 0) {
      examples.push({
        labelDe: rule.nameDe,
        contextDe: `${triggerEvents} historische Auslöser`,
        outcomeDe: 'trigger_only',
      });
    }

    return examples.slice(0, MAX_SIMULATION_EXAMPLES);
  }

  private buildSummaryDe(
    days: number,
    estimates: TaskAutomationSimulationResult['estimates'],
  ): string {
    const parts = [
      `Mit dieser Einstellung wären in den letzten ${days} Tagen voraussichtlich ${estimates.tasksWouldBeCreated} Aufgabe${
        estimates.tasksWouldBeCreated === 1 ? '' : 'n'
      } entstanden`,
    ];

    if (estimates.autoResolved > 0) {
      parts.push(
        `${estimates.autoResolved} davon wären automatisch aufgelöst worden`,
      );
    }
    if (estimates.currentlyActive > 0) {
      parts.push(`${estimates.currentlyActive} wären aktuell noch offen`);
    }
    if (estimates.deduplicatedMerges > 0) {
      parts.push(
        `${estimates.deduplicatedMerges} Auslöser wären durch Dedup zusammengeführt worden`,
      );
    }

    return `${parts.join('; ')}.`;
  }
}
