import {
  E7_APPLICATION_ROUTE_TARGETS,
  E7_ENTITY_REFERENCE_KINDS,
  type E7ActionTarget,
  type E7ApplicationRouteTarget,
  type E7EntityReferenceKind,
  type E7EvaluationsSectionTarget,
  E7_EVALUATIONS_SECTION_TARGETS,
} from './evaluations-recommendations.contract';

export class E7InvalidActionTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'E7InvalidActionTargetError';
  }
}

function isEvaluationsSectionTarget(value: string): value is E7EvaluationsSectionTarget {
  return (E7_EVALUATIONS_SECTION_TARGETS as readonly string[]).includes(value);
}

function isApplicationRouteTarget(value: string): value is E7ApplicationRouteTarget {
  return (E7_APPLICATION_ROUTE_TARGETS as readonly string[]).includes(value);
}

function isEntityReferenceKind(value: string): value is E7EntityReferenceKind {
  return (E7_ENTITY_REFERENCE_KINDS as readonly string[]).includes(value);
}

/** Fail-closed runtime validation for recommendation action targets. */
export function assertValidE7ActionTarget(target: E7ActionTarget): void {
  switch (target.kind) {
    case 'EVALUATIONS_SECTION':
      if (!isEvaluationsSectionTarget(target.value)) {
        throw new E7InvalidActionTargetError(`Invalid EVALUATIONS_SECTION target: ${target.value}`);
      }
      return;
    case 'APPLICATION_ROUTE':
      if (!isApplicationRouteTarget(target.value)) {
        throw new E7InvalidActionTargetError(`Invalid APPLICATION_ROUTE target: ${target.value}`);
      }
      return;
    case 'ENTITY_REFERENCE':
      if (!isEntityReferenceKind(target.entityKind)) {
        throw new E7InvalidActionTargetError(`Invalid ENTITY_REFERENCE kind: ${target.entityKind}`);
      }
      if (!target.entityId || target.entityId.trim().length === 0) {
        throw new E7InvalidActionTargetError('ENTITY_REFERENCE requires non-empty entityId');
      }
      return;
    default: {
      const _exhaustive: never = target;
      throw new E7InvalidActionTargetError(`Unknown action target kind: ${String(_exhaustive)}`);
    }
  }
}
