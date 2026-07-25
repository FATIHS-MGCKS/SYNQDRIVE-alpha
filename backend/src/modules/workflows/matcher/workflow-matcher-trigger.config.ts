import type { WorkflowActionCapabilityStatus } from '@prisma/client';

/** Version-bound trigger config stored in `workflow_triggers.config`. */
export interface WorkflowTriggerMatchConfig {
  supportedEventVersions?: string[];
  entityTypes?: string[];
  validFrom?: string;
  validUntil?: string;
  /** Optional workflow-definition feature flag key (WorkflowFeatureFlag.flagKey). */
  featureFlagKey?: string;
  /** Action capability keys that must be AVAILABLE at publish time. */
  requiredCapabilities?: string[];
  /** Pre-checkable policy predicates (no secrets). */
  policyRequirements?: Record<string, unknown>;
}

const BLOCKED_CAPABILITIES = new Set<WorkflowActionCapabilityStatus>([
  'DISABLED',
  'UNSUPPORTED',
]);

export function parseWorkflowTriggerMatchConfig(
  raw: unknown,
): WorkflowTriggerMatchConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const input = raw as Record<string, unknown>;
  return {
    supportedEventVersions: readStringArray(input.supportedEventVersions),
    entityTypes: readStringArray(input.entityTypes),
    validFrom: readIso(input.validFrom),
    validUntil: readIso(input.validUntil),
    featureFlagKey: readString(input.featureFlagKey),
    requiredCapabilities: readStringArray(input.requiredCapabilities),
    policyRequirements:
      input.policyRequirements && typeof input.policyRequirements === 'object' && !Array.isArray(input.policyRequirements)
        ? (input.policyRequirements as Record<string, unknown>)
        : undefined,
  };
}

export function isCapabilityBlocked(
  status: WorkflowActionCapabilityStatus | null | undefined,
): boolean {
  if (!status) return false;
  return BLOCKED_CAPABILITIES.has(status);
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

function readIso(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
