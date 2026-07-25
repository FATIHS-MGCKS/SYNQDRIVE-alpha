import type { DamageResponseDto } from '@modules/vehicle-intelligence/damages/damage.mapper';
import { isFinalDamageStatus } from '@shared/damage/damage-status-transition.util';
import type { OperatorDamageCaptureSource, OperatorDamageListItemDto } from './operator-damage.types';
import { damageSourceToOperatorSource } from './operator-damage-source.util';

export function mapOperatorDamageListItem(
  row: DamageResponseDto,
  options: { isKnownDamage?: boolean } = {},
): OperatorDamageListItemDto {
  const operatorSource = damageSourceToOperatorSource(row.source);
  const isFinal = isFinalDamageStatus(row.status);
  const isAiSuggestion = operatorSource === 'ai_suggestion';

  return {
    id: row.id,
    vehicleId: row.vehicleId,
    damageType: row.damageType,
    severity: row.severity,
    status: row.status,
    source: row.source,
    operatorSource,
    description: row.description,
    locationView: row.locationView,
    locationLabel: row.locationLabel,
    rentalImpact: row.rentalImpact,
    liabilityStatus: row.liabilityStatus,
    evidenceStatus: row.evidenceStatus,
    bookingId: row.bookingId,
    customerId: row.customerId,
    handoverProtocolId: row.handoverProtocolId,
    reportedBy: row.reportedBy,
    isFinal,
    isEditable: !isFinal,
    isKnownDamage: options.isKnownDamage ?? false,
    isAiSuggestion,
    imageCount: row.images?.length ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function resolveOperatorCaptureSource(input: {
  source?: OperatorDamageCaptureSource;
  handoverKind?: 'PICKUP' | 'RETURN';
}): OperatorDamageCaptureSource {
  if (input.source) return input.source;
  if (input.handoverKind === 'PICKUP') return 'pickup';
  if (input.handoverKind === 'RETURN') return 'return';
  return 'operator_inspection';
}
