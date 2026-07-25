import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { DamageSource } from '../../rental/lib/damage.types';
import type { HandoverDialogKind } from '../../rental/components/handover/HandoverProtocolDialog';
import type { DamageResponse } from '../../rental/lib/damage.types';
import {
  buildOperatorVehicleUrl,
  parseOperatorPath,
} from '../lib/operatorRoutes';
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
  closeDamageCapture: () => void;
}

const OperatorDamageCaptureCtx = createContext<OperatorDamageCaptureContextValue>({
  openDamageCapture: () => {},
  closeDamageCapture: () => {},
});

export function useOperatorDamageCapture() {
  return useContext(OperatorDamageCaptureCtx);
}

export function OperatorDamageCaptureProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState<OperatorDamageCaptureContext | null>(null);

  const openDamageCapture = useCallback((args: OperatorDamageCaptureOpenArgs) => {
    const targetPath = `/operator/vehicles/${encodeURIComponent(args.vehicleId)}/damage`;
    if (location.pathname !== targetPath) {
      navigate(targetPath);
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
  }, [location.pathname, navigate]);

  const closeDamageCapture = useCallback(() => {
    setIsOpen(false);
    const route = parseOperatorPath(location.pathname);
    if (route?.kind === 'vehicle-damage' && route.vehicleId) {
      navigate(buildOperatorVehicleUrl(route.vehicleId), { replace: true });
    }
  }, [location.pathname, navigate]);

  const value = useMemo(
    () => ({ openDamageCapture, closeDamageCapture }),
    [openDamageCapture, closeDamageCapture],
  );

  return (
    <OperatorDamageCaptureCtx.Provider value={value}>
      {children}
      <OperatorDamageCaptureFlow isOpen={isOpen} onClose={closeDamageCapture} context={context} />
    </OperatorDamageCaptureCtx.Provider>
  );
}
