import { useMemo } from 'react';
import { useRentalOrg } from '../RentalContext';
import { buildDataProcessingPermissions } from '../lib/data-processing-permissions';

export function useDataProcessingPermissions() {
  const { hasPermission } = useRentalOrg();
  return useMemo(() => buildDataProcessingPermissions(hasPermission), [hasPermission]);
}
