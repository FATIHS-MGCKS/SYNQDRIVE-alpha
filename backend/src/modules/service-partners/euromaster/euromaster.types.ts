import { ServiceCaseType } from '@prisma/client';

// ─── Config ─────────────────────────────────────────────────────────

export interface EuromasterConfig {
  enabled: boolean;
  liveApiEnabled: boolean;
  manualMode: boolean;
  baseUrl: string;
  environment: 'sandbox' | 'production';
  apiKey: string;
  clientId: string;
  clientSecret: string;
  requestTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

// ─── Auth ───────────────────────────────────────────────────────────

export interface EuromasterAuthToken {
  accessToken: string;
  expiresAt: Date;
  tokenType: string;
}

// ─── Outbound Request DTOs (SynqDrive → Euromaster API) ────────────

export interface EmAppointmentCreateRequest {
  customer: {
    customerId: string;
    companyName: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
  };
  vehicle: {
    licensePlate: string;
    vin?: string;
    make?: string;
    model?: string;
    mileageKm?: number;
  };
  service: {
    type: string;
    description?: string;
    preferredDate?: string;
    preferredTimeSlot?: string;
    urgency?: 'normal' | 'urgent';
  };
  branch?: {
    branchId?: string;
    postalCode?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
    searchRadiusKm?: number;
  };
  notes?: string;
  externalReference?: string;
}

export interface EmServiceStatusRequest {
  appointmentId: string;
}

export interface EmBranchSearchRequest {
  latitude?: number;
  longitude?: number;
  postalCode?: string;
  radiusKm?: number;
  services?: string[];
}

// ─── Inbound Response DTOs (Euromaster API → SynqDrive) ────────────

export interface EmAppointmentCreateResponse {
  appointmentId: string;
  status: 'CONFIRMED' | 'PENDING' | 'REJECTED' | 'REQUIRES_CALLBACK';
  scheduledDate?: string;
  scheduledTimeSlot?: string;
  branch?: {
    branchId: string;
    name: string;
    address: string;
    city: string;
    phone?: string;
  };
  estimatedDurationMinutes?: number;
  estimatedCostEur?: number;
  confirmationNumber?: string;
  message?: string;
}

export interface EmServiceStatusResponse {
  appointmentId: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  lastUpdatedAt?: string;
  completionNotes?: string;
  invoiceReference?: string;
  actualCostEur?: number;
}

export interface EmBranch {
  branchId: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
  openingHours?: string;
  services: string[];
  distanceKm?: number;
}

export interface EmBranchSearchResponse {
  branches: EmBranch[];
  totalCount: number;
}

export interface EmApiErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// ─── Normalized SynqDrive-side Domain Objects ──────────────────────

export interface EuromasterAppointmentInput {
  organizationId: string;
  vehicleId?: string;
  vehiclePlate: string;
  vehicleVin?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  mileageKm?: number;
  serviceType: ServiceCaseType;
  serviceDescription?: string;
  preferredDate?: string;
  preferredTimeSlot?: string;
  urgency?: 'normal' | 'urgent';
  branchId?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  createdBy?: string;
}

export interface EuromasterAppointmentResult {
  externalReference: string;
  status: 'confirmed' | 'pending' | 'rejected' | 'requires_callback' | 'manual_pending';
  scheduledAt?: string;
  branchName?: string;
  branchAddress?: string;
  estimatedDurationMinutes?: number;
  estimatedCostEur?: number;
  confirmationNumber?: string;
  message?: string;
  mode: 'live' | 'manual';
}

export interface EuromasterStatusResult {
  externalReference: string;
  status: string;
  lastUpdatedAt?: string;
  completionNotes?: string;
  invoiceReference?: string;
  actualCostEur?: number;
  mode: 'live' | 'manual';
}

export interface EuromasterBranchResult {
  branchId: string;
  name: string;
  address: string;
  city: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
  phone?: string;
  services: string[];
  distanceKm?: number;
}

// ─── Scope requirements per operation ──────────────────────────────

export const EUROMASTER_REQUIRED_SCOPES = {
  createAppointment: [
    'vehicle_identity.read',
    'vehicle_plate.read',
    'service_request.write',
    'appointment.write',
  ],
  tireService: [
    'vehicle_identity.read',
    'vehicle_plate.read',
    'vehicle_tire_data.read',
    'service_request.write',
    'appointment.write',
  ],
  statusCheck: [
    'service_request.read',
    'appointment.read',
  ],
  branchSearch: [] as string[],
} as const;

export type EuromasterOperation = keyof typeof EUROMASTER_REQUIRED_SCOPES;
