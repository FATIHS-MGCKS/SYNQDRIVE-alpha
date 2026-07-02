export interface VehicleSpecContext {
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  drivetrain?: string;
  powertrainType?: string;
  fuelType?: string;
}

export interface VehicleSpecAgentStep {
  step: string;
  status: 'done' | 'error' | 'skipped' | 'working';
  detail?: string;
}

export interface VehicleSpecsResult {
  success: boolean;
  specs?: Record<string, string | number | boolean | null>;
  providerId?: string;
  rawResponse?: string;
  error?: string;
  configFailure?: boolean;
  steps: VehicleSpecAgentStep[];
  dimoVehicleConnected?: boolean;
  knowledgeOnlyFallback?: boolean;
}

export interface VehicleSpecsScopeResolution {
  vehicleIds?: number[];
  hasVehicleScope: boolean;
  knowledgeOnlyFallback: boolean;
}

export type VehicleSpecStreamEmit = (event: string, data: unknown) => void;
