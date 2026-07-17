import { StationStatus } from '@prisma/client';
import {
  StationRestoreCommandIssueCode,
  StationRestoreCommandName,
  StationRestoreCommandOutcome,
  type EvaluateStationRestoreCommandInput,
  type StationRestoreCommandEvaluation,
  type StationRestoreCommandIssue,
  type StationRestoreCommandOptions,
} from './station-restore-command.types';
import type { StationRestorePreviewEvaluation } from './station-restore-preview.types';

function issue(code: string, message: string): StationRestoreCommandIssue {
  return { code, message };
}

function mapPreviewIssues(
  items: Array<{ code: string; message: string }>,
): StationRestoreCommandIssue[] {
  return items.map((item) => ({ code: item.code, message: item.message }));
}

export function evaluateStationRestoreCommand(
  input: EvaluateStationRestoreCommandInput,
): StationRestoreCommandEvaluation {
  const { preview, options, stationStatus } = input;

  if (preview.idempotent) {
    return {
      outcome: StationRestoreCommandOutcome.IDEMPOTENT,
      allowed: true,
      idempotent: true,
      blockingReasons: [],
      warnings: mapPreviewIssues(preview.warnings),
      requiredActions: mapPreviewIssues(preview.requiredFollowUpActions),
    };
  }

  const blockingReasons = mapPreviewIssues(preview.blockingReasons);
  const warnings = mapPreviewIssues(preview.warnings);
  const requiredActions = mapPreviewIssues(preview.requiredFollowUpActions);

  if (stationStatus !== 'ARCHIVED') {
    blockingReasons.push(
      issue(
        'NOT_ARCHIVED',
        'Only archived stations can be restored.',
      ),
    );
  }

  if (
    options.pickupEnabled === undefined ||
    options.returnEnabled === undefined ||
    typeof options.pickupEnabled !== 'boolean' ||
    typeof options.returnEnabled !== 'boolean'
  ) {
    blockingReasons.push(
      issue(
        StationRestoreCommandIssueCode.CAPABILITIES_CONFIRMATION_REQUIRED,
        'Restore requires explicit pickupEnabled and returnEnabled confirmation.',
      ),
    );
  }

  const afterHoursReturnEnabled =
    options.afterHoursReturnEnabled ??
    preview.suggestedCapabilities.afterHoursReturnEnabled;
  if (afterHoursReturnEnabled && !options.returnEnabled) {
    blockingReasons.push(
      issue(
        StationRestoreCommandIssueCode.AFTER_HOURS_WITHOUT_RETURN,
        'After-hours return requires returnEnabled=true.',
      ),
    );
  }

  const dedupedBlocking = dedupeIssues(blockingReasons);
  const allowed = dedupedBlocking.length === 0 && preview.restoreAllowed;

  return {
    outcome: allowed
      ? StationRestoreCommandOutcome.APPLIED
      : StationRestoreCommandOutcome.BLOCKED,
    allowed,
    idempotent: false,
    blockingReasons: dedupedBlocking,
    warnings: dedupeIssues(warnings),
    requiredActions: dedupeIssues(requiredActions),
  };
}

function dedupeIssues(items: StationRestoreCommandIssue[]): StationRestoreCommandIssue[] {
  const seen = new Set<string>();
  const result: StationRestoreCommandIssue[] = [];
  for (const item of items) {
    const key = `${item.code}::${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function buildStationRestoreCommandAudit(
  input: {
    stationId: string;
    organizationId: string;
    previousStatus: StationStatus;
    nextStatus: StationStatus;
    performedByUserId: string | null;
    idempotent: boolean;
    appliedCapabilities: StationRestoreCommandOptions;
    suggestedCapabilities: StationRestorePreviewEvaluation['suggestedCapabilities'];
  },
  performedAt: Date = new Date(),
) {
  return {
    command: StationRestoreCommandName.RESTORE,
    stationId: input.stationId,
    organizationId: input.organizationId,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    performedAt: performedAt.toISOString(),
    performedByUserId: input.performedByUserId,
    idempotent: input.idempotent,
    appliedCapabilities: input.appliedCapabilities,
    suggestedCapabilities: input.suggestedCapabilities,
  };
}
