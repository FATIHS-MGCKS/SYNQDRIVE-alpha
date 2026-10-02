import type { Exp021MaturationShadowWindow } from '@prisma/client';
import { Exp021MaturationShadowStratumSemanticMismatchError } from './reference-capture-exp021-maturation-shadow.errors';
import {
  extractStratumImmutableAttributes,
  findStratumImmutableAttributeMismatches,
} from './reference-capture-exp021-maturation-shadow-stratum-attributes.lib';
import { resolveFrozenStratumSemantics } from './reference-capture-exp021-maturation-shadow-signal-lane.lib';
import type { Exp021MaturationShadowQueryGeometryMs } from './reference-capture-exp021-maturation-shadow.types';

/**
 * Recompute current execution semantics and fail closed before any provider request.
 */
export function assertExecutionSemanticsMatchStratum(stratum: Exp021MaturationShadowWindow): void {
  const current = resolveFrozenStratumSemantics({
    signalLane: stratum.signalLane,
    queryGeometryMs: stratum.queryGeometryMs as Exp021MaturationShadowQueryGeometryMs,
    windowFrom: stratum.windowFrom,
    windowTo: stratum.windowTo,
  });

  const persisted = extractStratumImmutableAttributes(stratum);
  const mismatches = findStratumImmutableAttributeMismatches(persisted, {
    windowFrom: stratum.windowFrom,
    windowTo: stratum.windowTo,
    ...current,
    runtimeBuildShaAtEnrollment: persisted.runtimeBuildShaAtEnrollment,
    activityClassificationJson: persisted.activityClassificationJson,
  });

  if (mismatches.length > 0) {
    throw new Exp021MaturationShadowStratumSemanticMismatchError(
      `Execution-time semantic drift detected for stratum ${stratum.id}: ${mismatches.join(', ')}`,
    );
  }
}
