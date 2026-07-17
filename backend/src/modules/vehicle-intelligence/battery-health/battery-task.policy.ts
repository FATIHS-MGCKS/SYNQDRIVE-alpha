import { InsightSeverity, TaskType } from '@prisma/client';
import {
  BATTERY_ALERT_RULE_IDS,
  type BatteryAlertContract,
  type BatteryAlertRuleId,
  type BatteryAlertVehicleMeta,
  evaluateBatteryAlerts,
  shouldAutoResolveBatteryAlert,
} from './battery-alert.policy';
import { getEvidenceCapabilities } from './battery-evidence-strength.policy';
import type { CanonicalBatteryHealthService } from './canonical-battery-health.service';
import { ReferenceCapacityVerificationStatus } from './battery-v2-domain';
import { HV_SOH_GATE_GATE_REASONS } from './hv-capacity-shadow/hv-soh-gate.types';

export const BATTERY_TASK_POLICY_VERSION = '1.0.0';

export const BATTERY_TASK_INTENTS = {
  LV_PROFESSIONAL_CHECK: 'battery.task.lv_professional_check',
  WARNING_LIGHT_DIAGNOSTIC: 'battery.task.warning_light_diagnostic',
  BMS_WORKSHOP_REPORT: 'battery.task.bms_workshop_report',
  REFERENCE_CAPACITY_CONFIRM: 'battery.task.reference_capacity_confirm',
} as const;

export type BatteryTaskIntent =
  (typeof BATTERY_TASK_INTENTS)[keyof typeof BATTERY_TASK_INTENTS];

export const BATTERY_TASK_AUTO_RESOLVE = {
  [BATTERY_TASK_INTENTS.LV_PROFESSIONAL_CHECK]:
    'BATTERY_MEASURED_OK | BATTERY_REPLACED | PUBLICATION_GOOD | FALSE_POSITIVE',
  [BATTERY_TASK_INTENTS.WARNING_LIGHT_DIAGNOSTIC]:
    'WARNING_LIGHT_CLEARED | BATTERY_MEASURED_OK | FALSE_POSITIVE',
  [BATTERY_TASK_INTENTS.BMS_WORKSHOP_REPORT]:
    'WORKSHOP_RESOLVED | DOCUMENT_CONFIRMED | BATTERY_REPLACED | FALSE_POSITIVE',
  [BATTERY_TASK_INTENTS.REFERENCE_CAPACITY_CONFIRM]:
    'REFERENCE_CAPACITY_VERIFIED | FALSE_POSITIVE',
} as const;

const SHADOW_ONLY_GATE_REASONS = new Set<string>([
  HV_SOH_GATE_GATE_REASONS.CAPACITY_ASSESSMENT_NOT_STABLE,
  HV_SOH_GATE_GATE_REASONS.INSUFFICIENT_SESSIONS,
  HV_SOH_GATE_GATE_REASONS.ASSESSMENT_STALE,
]);

export interface BatteryTaskDefinition {
  intent: BatteryTaskIntent;
  title: string;
  reason: string;
  nextAction: string;
  taskType: TaskType;
  severity: InsightSeverity;
  priority: number;
  autoResolveWhen: string;
}

export interface BatteryTaskContract extends BatteryTaskDefinition {
  policyVersion: string;
  vehicleId: string;
  dedupeKey: string;
  description: string;
  alertRuleId: BatteryAlertRuleId | null;
  alertDedupeKey: string | null;
  evidenceTier: BatteryAlertContract['evidenceTier'] | null;
  metrics: Record<string, unknown>;
}

type CanonicalBatteryHealthSummary = NonNullable<
  Awaited<ReturnType<CanonicalBatteryHealthService['getSummary']>>
>;

const TASK_DEFINITIONS: Record<BatteryTaskIntent, Omit<BatteryTaskDefinition, 'intent'>> = {
  [BATTERY_TASK_INTENTS.LV_PROFESSIONAL_CHECK]: {
    title: '12V-Batterie professionell prüfen',
    reason: 'Belastbarer Alarm oder bestätigte Evidenz erfordert Werkstattprüfung der 12V-Batterie.',
    nextAction: 'Spannung und Startverhalten prüfen, Messwert dokumentieren',
    taskType: 'BATTERY_CHECK',
    severity: InsightSeverity.CRITICAL,
    priority: 84,
    autoResolveWhen: BATTERY_TASK_AUTO_RESOLVE[BATTERY_TASK_INTENTS.LV_PROFESSIONAL_CHECK],
  },
  [BATTERY_TASK_INTENTS.WARNING_LIGHT_DIAGNOSTIC]: {
    title: 'Battery-Warnleuchte diagnostizieren',
    reason: 'Aktive Batterie-Warnleuchte — Fehlerursache vor Vermietung klären.',
    nextAction: 'Warnleuchte und Fehlerspeicher auslesen, Diagnose dokumentieren',
    taskType: 'BATTERY_CHECK',
    severity: InsightSeverity.WARNING,
    priority: 72,
    autoResolveWhen: BATTERY_TASK_AUTO_RESOLVE[BATTERY_TASK_INTENTS.WARNING_LIGHT_DIAGNOSTIC],
  },
  [BATTERY_TASK_INTENTS.BMS_WORKSHOP_REPORT]: {
    title: 'BMS-/Werkstattbericht hinterlegen',
    reason: 'Werkstatt- oder BMS-Befund erfordert dokumentierte Nachverfolgung.',
    nextAction: 'Werkstatt- oder BMS-Bericht hochladen und Maßnahme festhalten',
    taskType: 'DOCUMENT_REVIEW',
    severity: InsightSeverity.WARNING,
    priority: 76,
    autoResolveWhen: BATTERY_TASK_AUTO_RESOLVE[BATTERY_TASK_INTENTS.BMS_WORKSHOP_REPORT],
  },
  [BATTERY_TASK_INTENTS.REFERENCE_CAPACITY_CONFIRM]: {
    title: 'Referenzkapazität bestätigen',
    reason: 'HV-SOH benötigt verifizierte Referenzkapazität — Shadow-Kapazität allein reicht nicht.',
    nextAction: 'Referenzkapazität mit Nachweis verifizieren oder korrekten Wert hinterlegen',
    taskType: 'DOCUMENT_REVIEW',
    severity: InsightSeverity.WARNING,
    priority: 68,
    autoResolveWhen: BATTERY_TASK_AUTO_RESOLVE[BATTERY_TASK_INTENTS.REFERENCE_CAPACITY_CONFIRM],
  },
};

const ALERT_RULE_TO_TASK_INTENT: Partial<Record<BatteryAlertRuleId, BatteryTaskIntent>> = {
  [BATTERY_ALERT_RULE_IDS.WARNING_LIGHT]: BATTERY_TASK_INTENTS.WARNING_LIGHT_DIAGNOSTIC,
  [BATTERY_ALERT_RULE_IDS.SAFETY_DTC]: BATTERY_TASK_INTENTS.LV_PROFESSIONAL_CHECK,
  [BATTERY_ALERT_RULE_IDS.LV_PUBLICATION_STABLE]: BATTERY_TASK_INTENTS.LV_PROFESSIONAL_CHECK,
  [BATTERY_ALERT_RULE_IDS.WORKSHOP_FINDING]: BATTERY_TASK_INTENTS.BMS_WORKSHOP_REPORT,
};

export function buildBatteryTaskDedupKey(
  vehicleId: string,
  taskIntent: BatteryTaskIntent,
): string {
  return `battery_task:${vehicleId}:${taskIntent}`;
}

export function isBatteryTaskDedupKey(dedupKey: string | null | undefined): boolean {
  return !!dedupKey?.startsWith('battery_task:');
}

function buildTaskContract(input: {
  vehicleId: string;
  intent: BatteryTaskIntent;
  description: string;
  alert?: BatteryAlertContract | null;
  severity?: InsightSeverity;
  priority?: number;
  metrics?: Record<string, unknown>;
}): BatteryTaskContract {
  const definition = TASK_DEFINITIONS[input.intent];
  return {
    policyVersion: BATTERY_TASK_POLICY_VERSION,
    intent: input.intent,
    vehicleId: input.vehicleId,
    dedupeKey: buildBatteryTaskDedupKey(input.vehicleId, input.intent),
    title: definition.title,
    reason: input.alert?.cause ?? definition.reason,
    nextAction: definition.nextAction,
    description: input.description,
    taskType: definition.taskType,
    severity: input.severity ?? input.alert?.severity ?? definition.severity,
    priority: input.priority ?? input.alert?.priority ?? definition.priority,
    autoResolveWhen: definition.autoResolveWhen,
    alertRuleId: input.alert?.ruleId ?? null,
    alertDedupeKey: input.alert?.dedupeKey ?? null,
    evidenceTier: input.alert?.evidenceTier ?? null,
    metrics: {
      taskIntent: input.intent,
      alertRuleId: input.alert?.ruleId ?? null,
      alertDedupeKey: input.alert?.dedupeKey ?? null,
      evidenceTier: input.alert?.evidenceTier ?? null,
      autoResolveWhen: definition.autoResolveWhen,
      ...input.metrics,
    },
  };
}

function shouldMaterializeTaskFromAlert(alert: BatteryAlertContract): boolean {
  if (alert.ruleId === BATTERY_ALERT_RULE_IDS.MANUAL_MEASUREMENT) {
    return false;
  }
  if (alert.evidenceTier) {
    const fromAlertPath = getEvidenceCapabilities(alert.evidenceTier).canTriggerAlert;
    if (!fromAlertPath && alert.ruleId !== BATTERY_ALERT_RULE_IDS.WARNING_LIGHT) {
      return false;
    }
  }
  return ALERT_RULE_TO_TASK_INTENT[alert.ruleId] != null;
}

function isHvShadowOnlyReferenceNeed(summary: CanonicalBatteryHealthSummary): boolean {
  const gateReasons =
    summary.canonical?.hv?.sohAssessment?.gateReasonCodes?.map(String) ?? [];
  if (gateReasons.length === 0) return false;
  const refReasons = new Set([
    HV_SOH_GATE_GATE_REASONS.NO_REFERENCE_CAPACITY,
    HV_SOH_GATE_GATE_REASONS.REFERENCE_NOT_VERIFIED,
    HV_SOH_GATE_GATE_REASONS.INCOMPATIBLE_CAPACITY_TYPE,
  ]);
  const hasRefNeed = gateReasons.some((code) => refReasons.has(code as never));
  if (!hasRefNeed) return true;
  const nonRefReasons = gateReasons.filter((code) => !refReasons.has(code as never));
  return nonRefReasons.length > 0 && nonRefReasons.every((code) => SHADOW_ONLY_GATE_REASONS.has(code));
}

export function evaluateReferenceCapacityTask(input: {
  summary: CanonicalBatteryHealthSummary | null;
  vehicle: BatteryAlertVehicleMeta;
}): BatteryTaskContract | null {
  const summary = input.summary;
  if (!summary?.support?.hv) return null;
  if (isHvShadowOnlyReferenceNeed(summary)) return null;

  const reference = summary.canonical?.hv?.referenceCapacity ?? null;
  const gateReasons =
    summary.canonical?.hv?.sohAssessment?.gateReasonCodes?.map(String) ?? [];

  const needsReference =
    !reference ||
    reference.verificationStatus !== ReferenceCapacityVerificationStatus.VERIFIED ||
    gateReasons.includes(HV_SOH_GATE_GATE_REASONS.NO_REFERENCE_CAPACITY) ||
    gateReasons.includes(HV_SOH_GATE_GATE_REASONS.REFERENCE_NOT_VERIFIED);

  if (!needsReference) return null;

  const label =
    input.vehicle.licensePlate ||
    `${input.vehicle.make} ${input.vehicle.model}`;
  const capacityLabel =
    reference?.capacityKwh != null ? `${reference.capacityKwh} kWh` : 'fehlend';

  return buildTaskContract({
    vehicleId: input.vehicle.id,
    intent: BATTERY_TASK_INTENTS.REFERENCE_CAPACITY_CONFIRM,
    description: `${label}: Referenzkapazität (${capacityLabel}) muss verifiziert werden — nicht aus HV-Shadow-Kapazität ableiten.`,
    metrics: {
      referenceCapacityId: reference?.id ?? null,
      referenceVerificationStatus: reference?.verificationStatus ?? null,
      gateReasonCodes: gateReasons,
      source: 'reference_capacity_gate',
    },
  });
}

export function evaluateBatteryTasks(input: {
  summary: CanonicalBatteryHealthSummary | null;
  vehicle: BatteryAlertVehicleMeta;
  now?: Date;
  warningLightActive?: boolean;
  activeDtcFaults?: Parameters<typeof evaluateBatteryAlerts>[0]['activeDtcFaults'];
}): BatteryTaskContract[] {
  const alerts = evaluateBatteryAlerts({
    summary: input.summary,
    vehicle: input.vehicle,
    now: input.now,
    warningLightActive: input.warningLightActive,
    activeDtcFaults: input.activeDtcFaults,
  });

  const byIntent = new Map<BatteryTaskIntent, BatteryTaskContract>();

  for (const alert of alerts) {
    if (!shouldMaterializeTaskFromAlert(alert)) continue;
    const intent = ALERT_RULE_TO_TASK_INTENT[alert.ruleId];
    if (!intent) continue;

    const label =
      input.vehicle.licensePlate ||
      `${input.vehicle.make} ${input.vehicle.model}`;
    const contract = buildTaskContract({
      vehicleId: input.vehicle.id,
      intent,
      alert,
      description: alert.message || `${label}: ${alert.cause}`,
      metrics: {
        ...alert.metrics,
        source: 'battery_alert',
      },
    });

    const existing = byIntent.get(intent);
    if (!existing || contract.priority > existing.priority) {
      byIntent.set(intent, contract);
    }
  }

  const refTask = evaluateReferenceCapacityTask({
    summary: input.summary,
    vehicle: input.vehicle,
  });
  if (refTask) {
    byIntent.set(refTask.intent, refTask);
  }

  return [...byIntent.values()].sort((a, b) => b.priority - a.priority);
}

export function shouldAutoResolveBatteryTask(input: {
  taskIntent: BatteryTaskIntent;
  summary: CanonicalBatteryHealthSummary | null;
  vehicleId: string;
  now?: Date;
  warningLightActive?: boolean;
  activeDtcFaults?: Parameters<typeof evaluateBatteryAlerts>[0]['activeDtcFaults'];
}): { autoResolve: boolean; resolutionCode: string; reason: string } | null {
  if (input.taskIntent === BATTERY_TASK_INTENTS.REFERENCE_CAPACITY_CONFIRM) {
    const refTask = evaluateReferenceCapacityTask({
      summary: input.summary,
      vehicle: {
        id: input.vehicleId,
        make: '',
        model: '',
        licensePlate: null,
        homeStationId: null,
      },
    });
    if (!refTask) {
      return {
        autoResolve: true,
        resolutionCode: 'REFERENCE_CAPACITY_VERIFIED',
        reason: 'Referenzkapazität verifiziert oder Bedarf entfallen',
      };
    }
    return null;
  }

  const activeTasks = evaluateBatteryTasks({
    summary: input.summary,
    vehicle: {
      id: input.vehicleId,
      make: '',
      model: '',
      licensePlate: null,
      homeStationId: null,
    },
    now: input.now,
    warningLightActive: input.warningLightActive,
    activeDtcFaults: input.activeDtcFaults,
  });
  const stillActive = activeTasks.some((task) => task.intent === input.taskIntent);
  if (stillActive) return null;

  const alertRuleForIntent = Object.entries(ALERT_RULE_TO_TASK_INTENT).find(
    ([, intent]) => intent === input.taskIntent,
  )?.[0] as BatteryAlertRuleId | undefined;

  if (alertRuleForIntent) {
    const alertResolved = shouldAutoResolveBatteryAlert({
      existingRuleId: alertRuleForIntent,
      summary: input.summary,
      warningLightActive: input.warningLightActive,
      activeDtcFaults: input.activeDtcFaults,
      now: input.now,
    });
    if (alertResolved) {
      return {
        autoResolve: true,
        resolutionCode:
          input.taskIntent === BATTERY_TASK_INTENTS.WARNING_LIGHT_DIAGNOSTIC
            ? 'WARNING_LIGHT_CLEARED'
            : 'BATTERY_MEASURED_OK',
        reason: 'Auslösende Batterie-Bedingung nicht mehr aktiv',
      };
    }
  }

  return {
    autoResolve: true,
    resolutionCode: 'FALSE_POSITIVE',
    reason: 'Batterie-Task-Bedingung nicht mehr aktiv',
  };
}
