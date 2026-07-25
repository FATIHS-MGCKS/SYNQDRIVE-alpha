import { DamageSource } from '@prisma/client';
import type { OperatorDamageCaptureSource } from './operator-damage.types';

export function operatorSourceToDamageSource(
  source: OperatorDamageCaptureSource,
): DamageSource {
  switch (source) {
    case 'pickup':
      return DamageSource.PICKUP_HANDOVER;
    case 'return':
      return DamageSource.RETURN_HANDOVER;
    case 'operator_inspection':
      return DamageSource.INSPECTION;
    case 'manual':
      return DamageSource.MANUAL;
    case 'ai_suggestion':
      return DamageSource.AI_UPLOAD;
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function damageSourceToOperatorSource(
  source: string,
): OperatorDamageCaptureSource | null {
  switch (source) {
    case DamageSource.PICKUP_HANDOVER:
      return 'pickup';
    case DamageSource.RETURN_HANDOVER:
      return 'return';
    case DamageSource.INSPECTION:
      return 'operator_inspection';
    case DamageSource.MANUAL:
      return 'manual';
    case DamageSource.AI_UPLOAD:
      return 'ai_suggestion';
    default:
      return null;
  }
}

/** AI suggestions must not be persisted as confirmed damages via operator capture. */
export function assertOperatorCaptureSourceAllowed(source: OperatorDamageCaptureSource): void {
  if (source === 'ai_suggestion') {
    throw new Error(
      'AI suggestions require explicit verification — use document intake confirmation flow',
    );
  }
}
