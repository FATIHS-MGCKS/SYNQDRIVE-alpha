import { useEffectiveHealth, useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { useVehicleLiveMapStore } from '../../stores/useVehicleLiveMapStore';
import type { VehicleData } from '../../data/vehicles';
import { VehicleHealthBox } from './VehicleHealthBox';
import { useVehicleHealthBoxData } from './useVehicleHealthBoxData';

export interface VehicleHealthBoxWiredProps {
  selectedVehicle: VehicleData | null;
  isDarkMode: boolean;
  onViewDetails?: () => void;
  /** Forwarded to VehicleHealthBox. Overview passes `false` to stay compact. */
  showDataBasis?: boolean;
}

export function VehicleHealthBoxWired({
  selectedVehicle,
  isDarkMode,
  onViewDetails,
  showDataBasis = true,
}: VehicleHealthBoxWiredProps) {
  const { orgId } = useRentalOrg();
  const vehicleId = selectedVehicle?.id ?? null;
  const { health: rentalHealth, loading: rentalHealthLoading } = useEffectiveHealth(vehicleId);
  const { healthError } = useFleetVehicles();
  const lvBatteryVoltage = useVehicleLiveMapStore((state) =>
    state.boundVehicleId === vehicleId ? state.snapshot?.lvBatteryVoltage ?? null : null,
  );
  const boxData = useVehicleHealthBoxData(vehicleId, orgId);

  return (
    <VehicleHealthBox
      selectedVehicle={selectedVehicle}
      isDarkMode={isDarkMode}
      lvBatteryVoltage={lvBatteryVoltage}
      rentalHealth={rentalHealth}
      rentalHealthLoading={rentalHealthLoading}
      healthError={healthError}
      boxData={boxData}
      onViewDetails={onViewDetails}
      showDataBasis={showDataBasis}
    />
  );
}

export function VehicleHealthBoxTelemetryBridge(props: VehicleHealthBoxWiredProps) {
  return <VehicleHealthBoxWired {...props} />;
}
