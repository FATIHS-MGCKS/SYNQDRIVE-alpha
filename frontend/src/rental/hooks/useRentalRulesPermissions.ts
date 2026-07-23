import { useMemo } from 'react';
import { useRentalOrg } from '../RentalContext';
import { buildRentalRulesPermissions } from '../lib/rental-rules-permissions';

export function useRentalRulesPermissions() {
  const { hasPermission } = useRentalOrg();
  return useMemo(() => buildRentalRulesPermissions(hasPermission), [hasPermission]);
}
