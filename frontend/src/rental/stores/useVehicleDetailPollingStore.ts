import { create } from 'zustand';
import type { TelemetryAccessBlockReason } from '../lib/vehicle-detail-polling-policy';

interface VehicleDetailPollingStore {
  overviewMapVisible: boolean;
  telemetryAccessBlock: TelemetryAccessBlockReason | null;
  setOverviewMapVisible: (visible: boolean) => void;
  setTelemetryAccessBlock: (reason: TelemetryAccessBlockReason | null) => void;
  reset: () => void;
}

export const useVehicleDetailPollingStore = create<VehicleDetailPollingStore>((set) => ({
  overviewMapVisible: false,
  telemetryAccessBlock: null,
  setOverviewMapVisible: (visible) => set({ overviewMapVisible: visible }),
  setTelemetryAccessBlock: (reason) => set({ telemetryAccessBlock: reason }),
  reset: () => set({ overviewMapVisible: false, telemetryAccessBlock: null }),
}));
