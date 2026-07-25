import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { DamageSource } from '../../rental/lib/damage.types';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import type { DamageResponse } from '../../rental/lib/damage.types';
import { getStoredUser, isMasterAdmin } from '../../lib/auth';
import { useRentalOrg } from '../../rental/RentalContext';
import { evaluateOperatorPermission } from '../lib/operatorPermissions';
import {
  OperatorDamageCaptureFlow,
  type OperatorDamageCaptureContext,
} from './OperatorDamageCaptureFlow';

export interface OperatorDamageCaptureOpenArgs {
  vehicleId: string;
  vehicleName?: string;
  plate?: string;
  bookingId?: string;
  customerId?: string;
  customerName?: string;
  bookingLabel?: string;
  source?: DamageSource;
  handoverKind?: HandoverDialogKind;
  reportedBy?: string;
  skipVehicleConfirm?: boolean;
  onCreated?: (damage: DamageResponse) => void;
}

interface OperatorDamageCaptureContextValue {
  openDamageCapture: (args: OperatorDamageCaptureOpenArgs) => void;
}

const OperatorDamageCaptureCtx = createContext<OperatorDamageCaptureContextValue>({
  openDamageCapture: () => {},
});

export function useOperatorDamageCapture() {
  return useContext(OperatorDamageCaptureCtx);
}

export function OperatorDamageCaptureProvider({ children }: { children: ReactNode }) {
  const { userRole, userPermissions } = useRentalOrg();
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<OperatorDamageCaptureContext | null>(null);

  const openDamageCapture = useCallback((args: OperatorDamageCaptureOpenArgs) => {
    if (!isMasterAdmin()) {
      const allowed = evaluateOperatorPermission(userPermissions, 'operator.damage.create', {
        membershipRole: userRole,
        fieldAgentAccess: getStoredUser()?.fieldAgentAccess ?? false,
      });
      if (!allowed) return;
    }
    setContext({
      vehicleId: args.vehicleId,
      vehicleName: args.vehicleName ?? 'Fahrzeug',
      plate: args.plate ?? '',
      bookingId: args.bookingId,
      customerId: args.customerId,
      customerName: args.customerName,
      bookingLabel: args.bookingLabel,
      source: args.source,
      handoverKind: args.handoverKind,
      reportedBy: args.reportedBy,
      skipVehicleConfirm: args.skipVehicleConfirm ?? Boolean(args.vehicleId && args.plate),
      onCreated: args.onCreated,
    });
    setIsOpen(true);
  }, [userPermissions, userRole]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(() => ({ openDamageCapture }), [openDamageCapture]);

  return (
    <OperatorDamageCaptureCtx.Provider value={value}>
      {children}
      <OperatorDamageCaptureFlow isOpen={isOpen} onClose={handleClose} context={context} />
    </OperatorDamageCaptureCtx.Provider>
  );
}
