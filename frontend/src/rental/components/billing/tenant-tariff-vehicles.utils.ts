import type { TenantVehicleBillingChangeDto } from '../../types/billing.types';

export function changeTypeLabel(change: TenantVehicleBillingChangeDto): string {
  switch (change.changeType) {
    case 'ADDED':
      return 'Hinzugefügt';
    case 'REMOVED':
      return 'Entfernt';
    default:
      return 'Geändert';
  }
}

export function changeTypeTone(changeType: TenantVehicleBillingChangeDto['changeType']): string {
  switch (changeType) {
    case 'ADDED':
      return 'sq-tone-success';
    case 'REMOVED':
      return 'sq-tone-warning';
    default:
      return 'sq-tone-neutral';
  }
}
