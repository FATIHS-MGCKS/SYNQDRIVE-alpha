import { getToken, clearAuth } from './auth';

const BASE_URL = '/api/v1';

/** A single step from the DIMO Agent orchestration pipeline. */
export interface AgentStep {
  step: string;
  status: 'done' | 'error' | 'skipped' | 'working';
  detail?: string;
}

// ── Rental Health V1 — canonical types ──────────────────────────────────────
// These mirror backend/src/modules/rental-health/rental-health.types.ts
// The UI renders exactly this shape; no free-form rewriting allowed.
export type RentalHealthState =
  | 'good'
  | 'warning'
  | 'critical'
  | 'unknown'
  | 'n_a';

export interface RentalHealthModule {
  state: RentalHealthState;
  reason: string;
  last_updated_at: string | null;
  data_stale: boolean;
}

export interface VehicleHealthResponse {
  vehicle_id: string;
  organization_id: string;
  overall_state: RentalHealthState;
  rental_blocked: boolean;
  blocking_reasons: string[];
  modules: {
    battery: RentalHealthModule;
    tires: RentalHealthModule;
    brakes: RentalHealthModule;
    error_codes: RentalHealthModule;
    service_compliance: RentalHealthModule;
    complaints: RentalHealthModule;
    vehicle_alerts: RentalHealthModule;
  };
  generated_at: string;
}

// ── HM Compatibility Matrix V1 (V4.6.77) ────────────────────────────────────
// Master-Admin-internal compatibility intelligence — matches
// backend/src/modules/high-mobility/compatibility/hm-compatibility.types.ts.
// The shape is UI-ready so the same response can later be re-used by the
// landing-page compatibility checker and onboarding assistant.
export type HmCompatibilityEligibilityMode =
  | 'AVAILABLE'
  | 'NOT_AVAILABLE'
  | 'SUPPORT_REQUEST'
  | 'VIN_DEPENDENT';
export type HmCompatibilityOnboardingMode =
  | 'PRECHECK_CONNECT'
  | 'DIRECT_CONNECT'
  | 'MANUAL_REVIEW';
export type HmCompatibilityAppStatus = 'SUPPORTED' | 'PARTIAL' | 'NOT_RECOMMENDED';
export type HmCompatibilityOverall = 'GOOD' | 'LIMITED' | 'WEAK';
export type HmCompatibilityConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type HmCompatibilityApp = 'HEALTH' | 'TELEMETRY';
export type HmSignalCoverage = 'CONFIRMED' | 'EXPECTED' | 'UNVERIFIED' | 'MISSING';

export interface HmCompatibilityBrandOption {
  brand: string;
  displayName: string;
  modelCount: number;
}

export interface HmCompatibilityModelOption {
  model: string;
  displayName: string;
  yearRange: string | null;
}

export interface HmSignalCoverageItem {
  app: HmCompatibilityApp;
  signalKey: string;
  signalLabel: string;
  signalGroup: string;
  required: boolean;
  coverage: HmSignalCoverage;
  confidence: HmCompatibilityConfidence;
  notes: string | null;
  displayOrder: number;
}

export interface HmAppCoverageSummary {
  status: HmCompatibilityAppStatus;
  coveredRequired: number;
  totalRequired: number;
  totalSignals: number;
  reason: string;
  signals: HmSignalCoverageItem[];
}

export interface HmCompatibilitySummary {
  brand: string;
  brandDisplayName: string;
  model: string;
  modelDisplayName: string;
  modelYearFrom: number | null;
  modelYearTo: number | null;
  supportFromText: string | null;
  overallStatus: HmCompatibilityOverall;
  overallNotes: string | null;
}

export interface HmCompatibilityOnboardingInfo {
  eligibilityMode: HmCompatibilityEligibilityMode;
  onboardingMode: HmCompatibilityOnboardingMode;
  oemPath: 'ELIGIBILITY_FIRST' | 'DIRECT_FLEET_CLEARANCE' | 'UNKNOWN';
  routingNote: string | null;
  guidance: string;
}

export interface HmCompatibilitySourceInfo {
  supportSource: string | null;
  confidence: HmCompatibilityConfidence;
  lastReviewedAt: string | null;
  notes: string | null;
}

export interface HmCompatibilityLookupEcho {
  brand: string;
  model: string;
  year: number | null;
  resolvedBrandNormalized: string | null;
  resolvedModelNormalized: string | null;
}

export interface HmCompatibilityCheckResponse {
  lookup: HmCompatibilityLookupEcho;
  found: boolean;
  summary: HmCompatibilitySummary | null;
  healthApp: HmAppCoverageSummary | null;
  telemetryApp: HmAppCoverageSummary | null;
  onboarding: HmCompatibilityOnboardingInfo | null;
  source: HmCompatibilitySourceInfo | null;
  notFoundReason: string | null;
  generatedAt: string;
}

/** Response from GET /vehicles/register/ai-specs (DIMO Agents flow). */
export interface EuromasterAccessInfo {
  enabled: boolean;
  assigned: boolean;
  liveApiEnabled: boolean;
  manualMode: boolean;
  dataAuthGranted: boolean;
  grantedScopes: string[];
  mode: string;
}

export interface AiSpecsResponse {
  success: boolean;
  degraded: boolean;
  configFailure?: boolean;
  upstreamStatus?: number | null;
  agentId?: string;
  specs: Record<string, string | number | null> | null;
  steps?: AgentStep[];
  message?: string;
}

export interface AiSpecsStreamResult {
  success: boolean;
  degraded?: boolean;
  agentId?: string;
  specs: Record<string, string | number | null>;
}

export type AiSpecsStreamEvent =
  | { event: 'step'; data: AgentStep }
  | { event: 'progress'; data: { type: string; content: string } }
  | { event: 'result'; data: AiSpecsStreamResult }
  | { event: 'error'; data: { message: string; configFailure?: boolean } };

/**
 * Connect to the SSE ai-specs-stream endpoint.
 * Returns an AbortController the caller can use to cancel.
 */
export function streamAiSpecs(
  params: { vin?: string; tokenId?: string; dimoVehicleId?: string; make?: string; model?: string; year?: string; powertrainType?: string; fuelType?: string },
  onEvent: (evt: AiSpecsStreamEvent) => void,
  onDone: () => void,
): AbortController {
  const qs = buildQuery(params);
  const url = `${BASE_URL}/vehicles/register/ai-specs-stream${qs}`;
  const controller = new AbortController();
  const token = getToken();

  fetch(url, {
    signal: controller.signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        onEvent({ event: 'error', data: { message: `HTTP ${res.status}` } });
        onDone();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          let eventName = 'message';
          let eventData = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) eventData = line.slice(5).trim();
          }
          if (!eventData) continue;
          try {
            const parsed = JSON.parse(eventData);
            onEvent({ event: eventName, data: parsed } as AiSpecsStreamEvent);
          } catch { /* skip malformed events */ }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name === 'AbortError') return;
      onEvent({ event: 'error', data: { message: err.message || 'Network error' } });
      onDone();
    });

  return controller;
}

// ── AI Tire Spec stream (mirrors streamAiSpecs for tire data) ──────────────

export interface AiTireSpecsStreamResult {
  success: boolean;
  degraded?: boolean;
  agentId?: string;
  specs: Record<string, unknown>;
}

export type AiTireSpecsStreamEvent =
  | { event: 'step'; data: AgentStep }
  | { event: 'progress'; data: { type: string; content: string } }
  | { event: 'result'; data: AiTireSpecsStreamResult }
  | { event: 'error'; data: { message: string; configFailure?: boolean } };

export function streamAiTireSpecs(
  params: { brand?: string; model?: string; year?: string; tireSize?: string; loadIndex?: string; speedIndex?: string },
  onEvent: (evt: AiTireSpecsStreamEvent) => void,
  onDone: () => void,
): AbortController {
  const qs = buildQuery(params);
  const url = `${BASE_URL}/vehicles/register/ai-tire-specs-stream${qs}`;
  const controller = new AbortController();
  const token = getToken();

  fetch(url, {
    signal: controller.signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        onEvent({ event: 'error', data: { message: `HTTP ${res.status}` } });
        onDone();
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          let eventName = 'message';
          let eventData = '';
          for (const line of part.split('\n')) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) eventData = line.slice(5).trim();
          }
          if (!eventData) continue;
          try {
            const parsed = JSON.parse(eventData);
            onEvent({ event: eventName, data: parsed } as AiTireSpecsStreamEvent);
          } catch { /* skip malformed events */ }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name === 'AbortError') return;
      onEvent({ event: 'error', data: { message: err.message || 'Network error' } });
      onDone();
    });

  return controller;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && !path.includes('/auth/')) {
    clearAuth();
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `API error ${res.status} (${path})`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v != null);
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

function get<T>(path: string) {
  return request<T>(path);
}

function post<T>(path: string, body: unknown) {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

function patch<T>(path: string, body: unknown) {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}

function put<T>(path: string, body: unknown) {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

function del<T>(path: string) {
  return request<T>(path, { method: 'DELETE' });
}

// V4.6.95 — `ASSIGNED_USER` / `USER` removed alongside the unused user-score
// feature. Canonical assignment statuses match the Prisma enum 1:1.
export type TripAssignmentStatus =
  | 'ASSIGNED_DRIVER'
  | 'ASSIGNED_BOOKING_CUSTOMER'
  | 'PRIVATE_UNASSIGNED'
  | 'UNKNOWN_ASSIGNMENT';

export type TripAssignmentSubjectType = 'DRIVER' | 'BOOKING_CUSTOMER';

export type EnergyEventKind = 'REFUEL' | 'RECHARGE';
export type EnergyEventConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface EnergyEvent {
  id: string;
  vehicleId: string;
  dimoSegmentId: string;
  kind: EnergyEventKind;
  detectionMechanism: 'refuel' | 'recharge' | string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  fuelDeltaLiters: number | null;
  fuelDeltaPercent: number | null;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  confidence: EnergyEventConfidence;
}

export type TripTimelineItem =
  | ({ itemType: 'trip' } & VehicleTripAnalytics)
  | ({ itemType: 'energy-event' } & EnergyEvent);

export interface VehicleTripAnalytics {
  id: string;
  vehicleId: string;
  tripStatus: 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  startTime: string;
  endTime?: string | null;
  distanceKm?: number | null;
  durationMinutes?: number | null;
  avgSpeedKmh?: number | null;
  maxSpeedKmh?: number | null;
  drivingScore?: number | null;
  drivingStyleScore?: number | null;
  safetyScore?: number | null;
  scoreSource?: 'trip_driving_impact' | 'vehicle_trip_compat' | 'derived';
  totalAccelerationEvents?: number;
  hardAccelerationEvents?: number;
  totalBrakingEvents?: number;
  hardBrakingEvents?: number;
  fullBrakingEvents?: number;
  corneringEvents?: number;
  abuseEvents?: number;
  speedingEvents?: number;
  speedingExposurePct?: number | null;
  speedingSectionCount?: number | null;
  speedingSectionsJson?: SpeedingSection[];
  behaviorReady?: boolean;
  detailsLimited?: boolean;
  assignmentStatus?: TripAssignmentStatus | null;
  assignmentSubjectType?: TripAssignmentSubjectType | null;
  assignmentSubjectId?: string | null;
  assignedBookingId?: string | null;
  isPrivateTrip?: boolean;
  scoreEligible?: boolean;
  [key: string]: unknown;
}

export interface VehicleTripStats {
  totalTrips: number;
  totalDistanceKm: number;
  avgDrivingScore: number;
  avgDrivingStyleScore: number;
  avgSafetyScore: number;
  totalAccelerationEvents: number;
  totalHardAccelerationEvents: number;
  totalBrakingEvents: number;
  totalHardBrakingEvents: number;
  totalAbuseEvents: number;
  totalSpeedingEvents: number;
  privateTripCount: number;
  assignedTripCount: number;
}

export interface DriverScoreSummary {
  subjectType: TripAssignmentSubjectType;
  subjectId: string;
  tripCount: number;
  scoredTripCount: number;
  drivingStyleScore: number | null;
  safetyScore: number | null;
  assignmentCoveragePct: number;
}

export interface CustomerApiRecord {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  bookingCount?: number;
  drivingStyleScore?: number | null;
  safetyScore?: number | null;
  scoreEligibleTripCount?: number;
  // V4.6.66 — booking-derived aggregates returned by /customers and /customers/:id.
  totalRevenueCents?: number;
  lastBookingDate?: string | null;
  [key: string]: unknown;
}

export interface RentalDrivingAnalysisItem {
  id: string;
  bookingId: string;
  vehicleId: string;
  driverId: string;
  periodStart: string;
  periodEnd: string;
  overallLevel: string;
  // V4.6.95 — riskLevel is lowercase ('low' | 'medium' | 'high') as
  // produced by RentalDrivingAnalysisService.
  riskLevel: string;
  // V4.6.95 — `drivingScore` is the legacy compat mirror. Prefer
  // `payload.drivingBehavior.drivingStyleScore` everywhere.
  drivingScore: number | null;
  drivingEventsCount?: number | null;
  abuseDetectionCount?: number | null;
  wearImpact?: string | null;
  driverStyleCategory?: string | null;
  payload: {
    overallAssessment?: { level?: string; title?: string; shortSummary?: string };
    drivingBehavior?: {
      drivingStyleScore?: number | null;
      safetyScore?: number | null;
      drivingScore?: number | null;
      safetyStyle?: string;
      accelerationBehavior?: { level?: string; summary?: string };
      brakingBehavior?: { level?: string; summary?: string };
    };
    eventSummary?: {
      drivingEventsCount?: number | null;
      abuseDetectionCount?: number | null;
      errorCodeOccurred?: boolean;
      eventHighlights?: string[];
    };
    riskAnalysis?: {
      level?: string;
      summary?: string;
      keyRisks?: string[];
    };
    wearImpactAssessment?: {
      overallWearImpact?: string;
      summary?: string;
      affectedAreas?: Array<{ area: string; impact: string; reason?: string }>;
    };
    // V4.6.95 — backend-supplied confidence metadata.
    analysisMeta?: {
      tripCount?: number;
      scoredTripCount?: number;
      safetyScoredTripCount?: number;
      totalDistanceKm?: number;
      assignmentCoveragePct?: number;
      hasEnoughData?: boolean;
      dataConfidence?: 'none' | 'low' | 'medium' | 'high';
    };
    [key: string]: unknown;
  } | null;
  vehicle?: { id?: string; make?: string; model?: string; licensePlate?: string } | null;
  driver?: { id?: string; firstName?: string; lastName?: string } | null;
  [key: string]: unknown;
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      post<{ token: string; user: any }>('/auth/login', { email, password }),
    me: () => get<any>('/auth/me'),
    seedAdmin: () => post<any>('/auth/seed-admin', {}),
  },
  admin: {
    dashboard: () => get<any>('/admin/dashboard'),
    orgStats: () => get<any>('/admin/stats/organizations'),
    revenueStats: () => get<any>('/admin/stats/revenue'),
    prune: () => post<{ message: string }>('/admin/prune', {}),
    monitoring: {
      summary: (params?: { from?: string; to?: string }) =>
        get<any>('/admin/monitoring/summary' + buildQuery(params)),
      pollLogs: (params?: { page?: number; limit?: number; vehicleId?: string; jobType?: string; status?: string; from?: string; to?: string }) => {
        const q = new URLSearchParams();
        if (params?.page != null) q.set('page', String(params.page));
        if (params?.limit != null) q.set('limit', String(params.limit));
        if (params?.vehicleId) q.set('vehicleId', params.vehicleId);
        if (params?.jobType) q.set('jobType', params.jobType);
        if (params?.status) q.set('status', params.status);
        if (params?.from) q.set('from', params.from);
        if (params?.to) q.set('to', params.to);
        const suffix = q.toString() ? '?' + q.toString() : '';
        return get<{ data: any[]; meta: { total: number; page: number; limit: number; totalPages: number } }>('/admin/monitoring/poll-logs' + suffix);
      },
      workers: (params?: { from?: string; to?: string }) =>
        get<any[]>('/admin/monitoring/workers' + buildQuery(params)),
      alerts: (params?: { from?: string; to?: string }) =>
        get<any[]>('/admin/monitoring/alerts' + buildQuery(params)),
      tokenHealth: () => get<any>('/admin/monitoring/token-health'),
    },
    changelogs: (module?: string) =>
      get<any[]>('/admin/changelogs' + (module ? `?module=${module}` : '')),
    createChangelog: (data: any) => post<any>('/admin/changelogs', data),
    activityLog: (params?: { page?: number; limit?: number; entity?: string; action?: string }) => {
      const q = new URLSearchParams();
      if (params?.page != null) q.set('page', String(params.page));
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.entity) q.set('entity', params.entity);
      if (params?.action) q.set('action', params.action);
      const suffix = q.toString() ? '?' + q.toString() : '';
      return get<{ data: any[]; meta: any }>('/admin/activity-log' + suffix);
    },
    vehicleLogbook: {
      list: () => get<any[]>('/admin/vehicle-logbook'),
      enable: (vehicleId: string, data: { durationHours?: number; enabledBy?: string; notes?: string }) =>
        post<any>(`/admin/vehicle-logbook/${vehicleId}/enable`, data),
      disable: (vehicleId: string) => post<any>(`/admin/vehicle-logbook/${vehicleId}/disable`, {}),
      detail: (vehicleId: string) => get<any>(`/admin/vehicle-logbook/${vehicleId}/detail`),
    },
  },
  organizations: {
    list: (params?: { page?: number; limit?: number }) =>
      get<{ data: any[]; meta: { total: number } }>('/admin/organizations' + (params ? `?page=${params.page ?? 1}&limit=${params.limit ?? 100}` : '?limit=100')),
    get: (id: string) => get<any>(`/admin/organizations/${id}`),
    create: (data: any) => post<any>('/admin/organizations', data),
    createAdmin: (orgId: string, adminData: { name: string; email: string; password: string }) =>
      post<any>(`/admin/organizations/${orgId}/admin`, adminData),
    update: (id: string, data: any) => patch<any>(`/admin/organizations/${id}`, data),
    delete: (id: string) => del<void>(`/admin/organizations/${id}`),
    stats: (id: string) => get<any>(`/admin/organizations/${id}/stats`),

    // ─── Tenant-scoped own-organization profile (Settings → Company Profile) ───
    // Distinct from the MASTER_ADMIN routes above: these are guarded by
    // OrgScopingGuard and only allow editing the caller's own org.
    getProfile: (orgId: string) =>
      get<{
        id: string;
        companyName: string;
        address: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
        country: string | null;
        taxId: string | null;
        phone: string | null;
        email: string | null;
        website: string | null;
        timezone: string | null;
        language: string | null;
        managerName: string | null;
        managerEmail: string | null;
        logoUrl: string | null;
        businessType: string;
      }>(`/organizations/${orgId}/profile`),
    updateProfile: (
      orgId: string,
      data: {
        companyName?: string;
        address?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
        country?: string | null;
        taxId?: string | null;
        phone?: string | null;
        email?: string | null;
        website?: string | null;
        timezone?: string | null;
        language?: string | null;
        managerName?: string | null;
        managerEmail?: string | null;
        logoUrl?: string | null;
      },
    ) => patch<any>(`/organizations/${orgId}/profile`, data),
    uploadLogo: async (orgId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('synqdrive_token');
      const res = await fetch(`/api/v1/organizations/${orgId}/profile/logo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) {
        let message = `Upload failed (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body?.message) message = body.message;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      return res.json() as Promise<{ url: string }>;
    },
  },
  users: {
    listAll: () => get<any[]>('/admin/users'),
    get: (id: string) => get<any>(`/admin/users/${id}`),
    create: (data: any) => post<any>('/admin/users', data),
    update: (id: string, data: any) => patch<any>(`/admin/users/${id}`, data),
    delete: (id: string) => del<void>(`/admin/users/${id}`),
    changePassword: (id: string, password: string) => post<{ message: string }>(`/admin/users/${id}/change-password`, { password }),
    listByOrg: (orgId: string) => get<any[]>(`/organizations/${orgId}/users`),
    getByOrg: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/users/${id}`),
    createByOrg: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/users`, data),
    updateByOrg: (orgId: string, id: string, data: any) => patch<any>(`/organizations/${orgId}/users/${id}`, data),
    deleteByOrg: (orgId: string, id: string) => del<void>(`/organizations/${orgId}/users/${id}`),
    changePasswordByOrg: (orgId: string, userId: string, password: string) =>
      post<{ message: string }>(`/organizations/${orgId}/users/${userId}/change-password`, { password }),
  },
  vehicles: {
    listAll: (params?: { page?: number; limit?: number }) =>
      get<{ data: any[] }>('/admin/vehicles' + (params ? `?page=${params.page ?? 1}&limit=${params.limit ?? 200}` : '?limit=200')),
    get: (id: string) => get<any>(`/admin/vehicles/${id}`),
    listByOrg: (orgId: string, params?: { page?: number; limit?: number }) =>
      get<{ data: any[]; meta?: { total: number } }>(`/organizations/${orgId}/vehicles` + (params ? `?page=${params.page ?? 1}&limit=${params.limit ?? 200}` : '?limit=200')),
    fleetMap: (orgId: string) =>
      get<FleetMapVehicleResponse[]>(`/organizations/${orgId}/fleet-map`),
    create: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/vehicles`, data),
    update: (orgId: string, id: string, data: any) => patch<any>(`/organizations/${orgId}/vehicles/${id}`, data),
    delete: (orgId: string, id: string) => del<void>(`/organizations/${orgId}/vehicles/${id}`),
    upsertTires: (orgId: string, vehicleId: string, data: {
      frontDimension?: string | null; rearDimension?: string | null;
      brandModelFront?: string | null; brandModelRear?: string | null;
      tireSeason?: string | null;
      loadIndexFront?: string | null; speedIndexFront?: string | null;
      loadIndexRear?: string | null; speedIndexRear?: string | null;
      dotCodeFront?: string | null; dotCodeRear?: string | null;
      tireCondition?: string | null;
      treadFL?: number | null; treadFR?: number | null;
      treadBL?: number | null; treadBR?: number | null;
    }) => put<any>(`/organizations/${orgId}/vehicles/${vehicleId}/tires`, data),
    telemetry: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/vehicles/${id}/telemetry`),
    liveGps: (orgId: string, id: string) => get<{
      latitude: number | null;
      longitude: number | null;
      speedKmh: number | null;
      lastSeenAt: string | null;
      source: 'dimo' | 'cache';
    }>(`/organizations/${orgId}/vehicles/${id}/live-gps`),
    fleetConnectivity: (orgId: string) => get<FleetConnectivityResponse>(`/organizations/${orgId}/fleet-connectivity`),
    listComplaints: (orgId: string, vehicleId: string) =>
      get<VehicleComplaint[]>(`/organizations/${orgId}/vehicles/${vehicleId}/complaints`),
    createComplaint: (orgId: string, vehicleId: string, body: { description: string; urgency?: string; region?: string | null }) =>
      post<VehicleComplaint>(`/organizations/${orgId}/vehicles/${vehicleId}/complaints`, body),
    registerFromDimo: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/vehicles/register-from-dimo`, data),
    deregister: (vehicleId: string) => post<{ success: boolean; deregisteredVehicle: any }>(`/admin/vehicles/${vehicleId}/deregister`, {}),
    getAiSpecs: (params?: { vin?: string; tokenId?: string; dimoVehicleId?: string; make?: string; model?: string; year?: string }) =>
      get<AiSpecsResponse>('/vehicles/register/ai-specs' + buildQuery(params ?? {})),
  },
  dimo: {
    vehicles: () => get<any[]>('/admin/dimo/vehicles'),
    nonRegistered: () => get<any[]>('/admin/dimo/non-registered'),
    sync: (body?: { dimoVehicles?: any[] }) => post<any>('/admin/dimo/sync', body ?? {}),
    stats: () => get<any>('/admin/dimo/stats'),
    refreshSnapshot: (id: string) => post<any>(`/admin/dimo/vehicles/${id}/refresh-snapshot`, {}),
    fleetConnectivity: () => get<AdminFleetConnectivityResponse>('/admin/dimo/fleet-connectivity'),
    queryGraphQL: (tokenId: number, query: string) =>
      post<any>('/admin/dimo/query', { tokenId, query }),
  },
  chat: {
    getAgent: (orgId: string) =>
      get<ChatAgentInfo>(`/organizations/${orgId}/chat/agent`),
    ensureAgent: (orgId: string) =>
      post<{ agentName: string; dimoAgentId: string }>(`/organizations/${orgId}/chat/agent`, {}),
    sendMessage: (orgId: string, content: string) =>
      post<ChatMessageResponse>(`/organizations/${orgId}/chat/message`, { content }),
    getHistory: (orgId: string, limit?: number, before?: string) => {
      const params: Record<string, string> = {};
      if (limit) params.limit = String(limit);
      if (before) params.before = before;
      return get<ChatMessageResponse[]>(`/organizations/${orgId}/chat/history` + buildQuery(params));
    },
    clearHistory: (orgId: string) =>
      del<{ cleared: boolean }>(`/organizations/${orgId}/chat/history`),
  },
  whatsapp: {
    getConfig: (orgId: string) =>
      get<WhatsAppConfig>(`/organizations/${orgId}/whatsapp/config`),
    updateConfig: (orgId: string, data: Partial<WhatsAppConfig>) =>
      put<WhatsAppConfig>(`/organizations/${orgId}/whatsapp/config`, data),
    connect: (orgId: string, data: { phoneNumber: string; businessName?: string; connectedByName?: string }) =>
      post<WhatsAppConfig>(`/organizations/${orgId}/whatsapp/connect`, data),
    disconnect: (orgId: string) =>
      post<WhatsAppConfig>(`/organizations/${orgId}/whatsapp/disconnect`, {}),
    getConversations: (orgId: string) =>
      get<WhatsAppConversation[]>(`/organizations/${orgId}/whatsapp/conversations`),
    getMessages: (orgId: string, conversationId: string) =>
      get<WhatsAppMsg[]>(`/organizations/${orgId}/whatsapp/conversations/${conversationId}/messages`),
    sendMessage: (orgId: string, conversationId: string, content: string, senderName?: string) =>
      post<WhatsAppMsg>(`/organizations/${orgId}/whatsapp/conversations/${conversationId}/messages`, { content, senderName }),
    getAiSuggestion: (orgId: string, conversationId: string) =>
      post<{ suggestion: string | null; reason: string | null }>(`/organizations/${orgId}/whatsapp/conversations/${conversationId}/ai-suggestion`, {}),
    sendAiReply: (orgId: string, conversationId: string, content: string) =>
      post<WhatsAppMsg>(`/organizations/${orgId}/whatsapp/conversations/${conversationId}/ai-reply`, { content }),
    simulateIncoming: (orgId: string, data: { contactPhone: string; contactName?: string; content: string }) =>
      post<{ conversationId: string; message: WhatsAppMsg }>(`/organizations/${orgId}/whatsapp/simulate-incoming`, data),
    getStats: (orgId: string) =>
      get<WhatsAppStats>(`/organizations/${orgId}/whatsapp/stats`),
  },
  bookings: {
    list: (orgId: string) => get<any[]>(`/organizations/${orgId}/bookings`),
    get: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/bookings/${id}`),
    create: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/bookings`, data),
    update: (orgId: string, id: string, data: any) => patch<any>(`/organizations/${orgId}/bookings/${id}`, data),
    cancel: (orgId: string, id: string) => del<void>(`/organizations/${orgId}/bookings/${id}`),
    // V4.6.81 — Mark a CONFIRMED booking whose scheduled pickup has
    // passed without a handover as NO_SHOW. Distinct from cancel so
    // downstream reporting can tell "called off" from "customer never
    // showed". Server-side guardrails enforce status + time window.
    markNoShow: (orgId: string, id: string, reason?: string | null) =>
      post<any>(`/organizations/${orgId}/bookings/${id}/no-show`, { reason: reason ?? null }),
    stats: (orgId: string) => get<any>(`/organizations/${orgId}/bookings/stats`),
    todayPickups: (orgId: string) => get<any[]>(`/organizations/${orgId}/bookings/today/pickups`),
    todayReturns: (orgId: string) => get<any[]>(`/organizations/${orgId}/bookings/today/returns`),
    // V4.6.75 — Handover-Protokoll (Übergabe beim Pickup, Rückgabe beim Return).
    // V4.6.81 — Pickup handover now accepts an optional `performedAt`
    // ISO-8601 string so operators can record a handover that physically
    // happened earlier (customer arrived late, dispatcher logs after
    // the fact). Omitted → server uses `now()`.
    listHandovers: (orgId: string, bookingId: string) =>
      get<any[]>(`/organizations/${orgId}/bookings/${bookingId}/handover`),
    createPickupHandover: (orgId: string, bookingId: string, data: any) =>
      post<any>(`/organizations/${orgId}/bookings/${bookingId}/handover/pickup`, data),
    createReturnHandover: (orgId: string, bookingId: string, data: any) =>
      post<any>(`/organizations/${orgId}/bookings/${bookingId}/handover/return`, data),
  },
  // V4.6.76 Rental Health V1 — canonical 5-state vehicle health with
  // rental_blocked gate. The backend aggregates Battery/Tires/Brakes/
  // DTC/Service-Info/Complaints/OEM-Alerts into one deterministic shape.
  rentalHealth: {
    getVehicle: (orgId: string, vehicleId: string) =>
      get<VehicleHealthResponse>(
        `/organizations/${orgId}/vehicles/${vehicleId}/rental-health`,
      ),
    getFleet: (orgId: string, vehicleIds?: string[]) => {
      const suffix =
        vehicleIds && vehicleIds.length > 0
          ? `?vehicleIds=${encodeURIComponent(vehicleIds.join(','))}`
          : '';
      return get<{ vehicles: VehicleHealthResponse[] }>(
        `/organizations/${orgId}/rental-health${suffix}`,
      );
    },
  },
  dashboardInsights: {
    get: (orgId: string) => get<{
      generatedAt: string;
      summary: { total: number; critical: number; warning: number; opportunity: number; info: number };
      insights: Array<{
        id: string;
        type: string;
        severity: string;
        priority: number;
        title: string;
        message: string;
        actionLabel?: string | null;
        actionType?: string | null;
        entityScope: string;
        entityIds?: string[] | null;
        timeContext?: Record<string, string> | null;
        metrics?: Record<string, any> | null;
        reasons?: string[] | null;
        isGrouped: boolean;
        groupCount: number;
        createdAt: string;
      }>;
    }>(`/organizations/${orgId}/dashboard-insights`),
  },
  servicePartners: {
    list: (orgId: string) => get<any[]>(`/organizations/${orgId}/service-partners`),
    assignments: (orgId: string) => get<any[]>(`/organizations/${orgId}/service-partners/assignments`),
    assign: (orgId: string, partnerId: string, mode?: string) =>
      post<any>(`/organizations/${orgId}/service-partners/assignments/${partnerId}`, { mode: mode ?? 'MANUAL_ONLY' }),
    updateAssignment: (orgId: string, partnerId: string, data: Record<string, unknown>) =>
      patch<any>(`/organizations/${orgId}/service-partners/assignments/${partnerId}`, data),
    removeAssignment: (orgId: string, partnerId: string) =>
      del<any>(`/organizations/${orgId}/service-partners/assignments/${partnerId}`),
    getDataAuth: (orgId: string, partnerId: string) =>
      get<any>(`/organizations/${orgId}/service-partners/data-auth/${partnerId}`),
    grantDataAuth: (orgId: string, partnerId: string, scopes: string[], grantedBy: string, notes?: string) =>
      post<any>(`/organizations/${orgId}/service-partners/data-auth/${partnerId}/grant`, { scopes, grantedBy, notes }),
    revokeDataAuth: (orgId: string, partnerId: string) =>
      post<any>(`/organizations/${orgId}/service-partners/data-auth/${partnerId}/revoke`, {}),
    cases: (orgId: string, filters?: { partnerId?: string; vehicleId?: string; status?: string }) => {
      const params = new URLSearchParams();
      if (filters?.partnerId) params.set('partnerId', filters.partnerId);
      if (filters?.vehicleId) params.set('vehicleId', filters.vehicleId);
      if (filters?.status) params.set('status', filters.status);
      const qs = params.toString();
      return get<any[]>(`/organizations/${orgId}/service-partners/cases${qs ? `?${qs}` : ''}`);
    },
    caseById: (orgId: string, caseId: string) =>
      get<any>(`/organizations/${orgId}/service-partners/cases/${caseId}`),
    createCase: (orgId: string, data: Record<string, unknown>) =>
      post<any>(`/organizations/${orgId}/service-partners/cases`, data),
    updateCaseStatus: (orgId: string, caseId: string, status: string, note?: string) =>
      patch<any>(`/organizations/${orgId}/service-partners/cases/${caseId}/status`, { status, note }),
    euromasterAppointment: (orgId: string, data: Record<string, unknown>) =>
      post<any>(`/organizations/${orgId}/service-partners/euromaster/appointment`, data),
    euromasterAccess: (orgId: string) =>
      get<EuromasterAccessInfo>(`/organizations/${orgId}/service-partners/euromaster/access`),
    euromasterTireService: (orgId: string, data: Record<string, unknown>) =>
      post<any>(`/organizations/${orgId}/service-partners/euromaster/tire-service`, data),
    euromasterBranches: (orgId: string, params?: { lat?: number; lng?: number; postalCode?: string; radius?: number }) => {
      const q = new URLSearchParams();
      if (params?.lat != null) q.set('lat', String(params.lat));
      if (params?.lng != null) q.set('lng', String(params.lng));
      if (params?.postalCode) q.set('postalCode', params.postalCode);
      if (params?.radius != null) q.set('radius', String(params.radius));
      const qs = q.toString();
      return get<any[]>(`/organizations/${orgId}/service-partners/euromaster/branches${qs ? `?${qs}` : ''}`);
    },
    euromasterSyncCase: (orgId: string, caseId: string) =>
      post<any>(`/organizations/${orgId}/service-partners/euromaster/cases/${caseId}/sync`, {}),
  },
  servicePartnersAdmin: {
    list: () => get<any[]>('/admin/service-partners'),
    stats: () => get<any>('/admin/service-partners/stats'),
    detail: (provider: string) => get<any>(`/admin/service-partners/detail/${provider}`),
    updatePartner: (provider: string, data: Record<string, unknown>) =>
      patch<any>(`/admin/service-partners/${provider}`, data),
    assignments: () => get<any[]>('/admin/service-partners/assignments'),
    adminAssign: (orgId: string, partnerId: string, mode?: string) =>
      post<any>(`/admin/service-partners/assignments/${orgId}/${partnerId}`, { mode }),
    updateAssignment: (orgId: string, partnerId: string, data: { status?: string; mode?: string; enabledFeatures?: string[] }) =>
      patch<any>(`/admin/service-partners/assignments/${orgId}/${partnerId}`, data),
    dataAuthorizations: () => get<any[]>('/admin/service-partners/data-authorizations'),
    grantAuth: (orgId: string, partnerId: string, scopes: string[], grantedBy: string, notes?: string) =>
      post<any>(`/admin/service-partners/data-authorizations/${orgId}/${partnerId}/grant`, { scopes, grantedBy, notes }),
    revokeAuth: (orgId: string, partnerId: string) =>
      del<any>(`/admin/service-partners/data-authorizations/${orgId}/${partnerId}`),
    authSummary: (partnerId: string) => get<any[]>(`/admin/service-partners/auth-summary/${partnerId}`),
    cases: (limit?: number) => get<any[]>(`/admin/service-partners/cases${limit ? `?limit=${limit}` : ''}`),
    seed: () => post<any>('/admin/service-partners/seed', {}),
  },
  rentalDrivingAnalyses: {
    // V4.6.95 — `bookingId` filter added so the booking detail card in
    // BookingsView can fetch the single canonical analysis row for a booking.
    list: (
      orgId: string,
      params?: {
        page?: number;
        limit?: number;
        vehicleId?: string;
        driverId?: string;
        bookingId?: string;
        from?: string;
        to?: string;
      },
    ) => {
      const q = new URLSearchParams();
      if (params?.page != null) q.set('page', String(params.page));
      if (params?.limit != null) q.set('limit', String(params.limit));
      if (params?.vehicleId) q.set('vehicleId', params.vehicleId);
      if (params?.driverId) q.set('driverId', params.driverId);
      if (params?.bookingId) q.set('bookingId', params.bookingId);
      if (params?.from) q.set('from', params.from);
      if (params?.to) q.set('to', params.to);
      const suffix = q.toString() ? '?' + q.toString() : '';
      return get<{ data: RentalDrivingAnalysisItem[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(
        `/organizations/${orgId}/rental-driving-analyses${suffix}`,
      );
    },
    get: (orgId: string, id: string) => get<RentalDrivingAnalysisItem>(`/organizations/${orgId}/rental-driving-analyses/${id}`),
  },
  customers: {
    list: (orgId: string) => get<{ data: CustomerApiRecord[]; meta: { total: number; page: number; limit: number; totalPages: number } }>(`/organizations/${orgId}/customers`),
    get: (orgId: string, id: string) => get<CustomerApiRecord>(`/organizations/${orgId}/customers/${id}`),
    create: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/customers`, data),
    update: (orgId: string, id: string, data: any) => patch<any>(`/organizations/${orgId}/customers/${id}`, data),
    delete: (orgId: string, id: string) => del<void>(`/organizations/${orgId}/customers/${id}`),
    stats: (orgId: string) => get<any>(`/organizations/${orgId}/customers/stats`),
    // V4.6.65 — KYC document upload during customer registration.
    // documentType is one of 'id-front' | 'id-back' | 'license-front' | 'license-back'.
    uploadDocument: async (
      orgId: string,
      documentType: 'id-front' | 'id-back' | 'license-front' | 'license-back',
      file: File,
    ) => {
      const form = new FormData();
      form.append('file', file);
      form.append('documentType', documentType);
      const token = localStorage.getItem('synqdrive_token');
      const res = await fetch(
        `/api/v1/organizations/${orgId}/customers/documents`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: form,
        },
      );
      if (!res.ok) {
        let message = `Upload failed (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body?.message) message = body.message;
        } catch {
          /* ignore */
        }
        throw new Error(message);
      }
      return res.json() as Promise<{ url: string; documentType: string | null }>;
    },
  },
  stations: {
    list: (orgId: string) => get<Station[]>(`/organizations/${orgId}/stations`),
    get: (orgId: string, id: string) => get<Station>(`/organizations/${orgId}/stations/${id}`),
    create: (orgId: string, data: StationUpsertPayload) =>
      post<Station>(`/organizations/${orgId}/stations`, data),
    update: (orgId: string, id: string, data: Partial<StationUpsertPayload>) =>
      patch<Station>(`/organizations/${orgId}/stations/${id}`, data),
    delete: (orgId: string, id: string) =>
      del<{ id: string; unassignedVehicles: number }>(`/organizations/${orgId}/stations/${id}`),
    stats: (orgId: string) => get<StationsStats>(`/organizations/${orgId}/stations/stats`),
    searchPlaces: (orgId: string, q: string) =>
      get<StationPlaceSuggestion[]>(`/organizations/${orgId}/stations/search-places?q=${encodeURIComponent(q)}`),
    placeDetails: (orgId: string, placeId: string) =>
      get<StationPlaceDetails | null>(`/organizations/${orgId}/stations/place-details/${placeId}`),
    /**
     * Replace this station's vehicle list with `vehicleIds` (SET semantics).
     * Vehicles previously assigned to this station that are not in the list
     * will be detached; vehicles in the list that are currently elsewhere
     * (including at another station) are moved here.
     */
    setVehicles: (orgId: string, stationId: string, vehicleIds: string[]) =>
      put<StationVehicleAssignmentResult>(
        `/organizations/${orgId}/stations/${stationId}/vehicles`,
        { vehicleIds },
      ),
    /**
     * V4.7.07 — Geocode all stations in this org that are missing
     * latitude / longitude. Idempotent. Returns a per-station summary
     * (geocoded / failed / skipped) so the UI can show progress.
     */
    backfillCoordinates: (orgId: string) =>
      post<StationGeocodingBackfillResult>(
        `/organizations/${orgId}/stations/backfill-coordinates`,
        {},
      ),
  },
  vendors: {
    list: (orgId: string) => get<Vendor[]>(`/organizations/${orgId}/vendors`),
    get: (orgId: string, id: string) => get<Vendor>(`/organizations/${orgId}/vendors/${id}`),
    create: (orgId: string, data: any) => post<Vendor>(`/organizations/${orgId}/vendors`, data),
    update: (orgId: string, id: string, data: any) => patch<Vendor>(`/organizations/${orgId}/vendors/${id}`, data),
    delete: (orgId: string, id: string) => del<void>(`/organizations/${orgId}/vendors/${id}`),
    stats: (orgId: string) => get<any>(`/organizations/${orgId}/vendors/stats`),
    searchPlaces: (orgId: string, q: string) => get<PlaceSuggestion[]>(`/organizations/${orgId}/vendors/search-places?q=${encodeURIComponent(q)}`),
    placeDetails: (orgId: string, placeId: string) => get<PlaceDetails>(`/organizations/${orgId}/vendors/place-details/${placeId}`),
    linkVehicle: (orgId: string, vendorId: string, vehicleId: string, notes?: string) =>
      post<any>(`/organizations/${orgId}/vendors/${vendorId}/vehicles`, { vehicleId, notes }),
    unlinkVehicle: (orgId: string, vendorId: string, vehicleId: string) =>
      del<void>(`/organizations/${orgId}/vendors/${vendorId}/vehicles/${vehicleId}`),
  },
  dataAuthorizations: {
    list: (orgId: string, params?: { status?: string; moduleOrigin?: string; scope?: string }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.moduleOrigin) q.set('moduleOrigin', params.moduleOrigin);
      if (params?.scope) q.set('scope', params.scope);
      const qs = q.toString();
      return get<any[]>(`/organizations/${orgId}/data-authorizations${qs ? `?${qs}` : ''}`);
    },
    stats: (orgId: string) => get<any>(`/organizations/${orgId}/data-authorizations/stats`),
    get: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/data-authorizations/${id}`),
    create: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/data-authorizations`, data),
    grant: (orgId: string, id: string) => patch<any>(`/organizations/${orgId}/data-authorizations/${id}/grant`, {}),
    revoke: (orgId: string, id: string) => patch<any>(`/organizations/${orgId}/data-authorizations/${id}/revoke`, {}),
  },
  workflows: {
    list: (orgId: string, params?: { status?: string; category?: string }) => {
      const q = new URLSearchParams();
      if (params?.status) q.set('status', params.status);
      if (params?.category) q.set('category', params.category);
      const qs = q.toString();
      return get<any[]>(`/organizations/${orgId}/workflows${qs ? `?${qs}` : ''}`);
    },
    stats: (orgId: string) => get<any>(`/organizations/${orgId}/workflows/stats`),
    get: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/workflows/${id}`),
    create: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/workflows`, data),
    update: (orgId: string, id: string, data: any) => patch<any>(`/organizations/${orgId}/workflows/${id}`, data),
    toggle: (orgId: string, id: string) => patch<any>(`/organizations/${orgId}/workflows/${id}/toggle`, {}),
    duplicate: (orgId: string, id: string) => post<any>(`/organizations/${orgId}/workflows/${id}/duplicate`, {}),
    remove: (orgId: string, id: string) => del<any>(`/organizations/${orgId}/workflows/${id}`),
  },
  billing: {
    subscriptions: () => get<any[]>('/admin/billing/subscriptions'),
    revenueStats: () => get<any>('/admin/billing/revenue-stats'),
    orgSubscriptions: () => get<any[]>('/billing/subscriptions'),
    orgInvoices: () => get<any[]>('/billing/invoices'),
  },
  support: {
    stats: () => get<any>('/admin/support/stats'),
    newest: (limit?: number) => get<any[]>(`/admin/support/newest${limit ? `?limit=${limit}` : ''}`),
    open: (limit?: number) => get<any[]>(`/admin/support/open${limit ? `?limit=${limit}` : ''}`),
    tickets: (params?: Record<string, string>) => {
      const q = params ? '?' + new URLSearchParams(params).toString() : '';
      return get<any>(`/admin/support/tickets${q}`);
    },
    getTicket: (id: string) => get<any>(`/admin/support/tickets/${id}`),
    createTicket: (data: any) => post<any>('/admin/support/tickets', data),
    updateTicket: (id: string, data: any) => patch<any>(`/admin/support/tickets/${id}`, data),
    updateStatus: (id: string, status: string) => patch<any>(`/admin/support/tickets/${id}/status`, { status }),
    addMessage: (id: string, data: { content: string; imageUrl?: string }) =>
      post<any>(`/admin/support/tickets/${id}/messages`, data),
    byOrg: (orgId: string) => get<any[]>(`/organizations/${orgId}/support/tickets`),
    getByOrg: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/support/tickets/${id}`),
    createByOrg: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/support/tickets`, data),
    addMessageByOrg: (orgId: string, id: string, data: { content: string; imageUrl?: string }) =>
      post<any>(`/organizations/${orgId}/support/tickets/${id}/messages`, data),
    uploadImage: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('synqdrive_token');
      const res = await fetch(`/api/v1/support/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json() as Promise<{ url: string }>;
    },
  },
  fines: {
    list: (orgId: string) => get<any[]>(`/organizations/${orgId}/fines`),
    stats: (orgId: string) => get<any>(`/organizations/${orgId}/fines/stats`),
    get: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/fines/${id}`),
    create: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/fines`, data),
    update: (orgId: string, id: string, data: any) => patch<any>(`/organizations/${orgId}/fines/${id}`, data),
    byCustomer: (orgId: string, customerId: string) => get<any[]>(`/organizations/${orgId}/customers/${customerId}/fines`),
    uploadImage: async (orgId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('synqdrive_token');
      const res = await fetch(`/api/v1/organizations/${orgId}/fines/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json() as Promise<{ url: string }>;
    },
  },
  tasks: {
    list: (orgId: string) => get<any[]>(`/organizations/${orgId}/tasks`),
    get: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/tasks/${id}`),
    create: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/tasks`, data),
    update: (orgId: string, id: string, data: any) => patch<any>(`/organizations/${orgId}/tasks/${id}`, data),
  },
  invoices: {
    list: (orgId: string, params?: { type?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.type) q.set('type', params.type);
      if (params?.status) q.set('status', params.status);
      const qs = q.toString();
      return get<any[]>(`/organizations/${orgId}/invoices${qs ? `?${qs}` : ''}`);
    },
    stats: (orgId: string) => get<any>(`/organizations/${orgId}/invoices/stats`),
    get: (orgId: string, id: string) => get<any>(`/organizations/${orgId}/invoices/${id}`),
    create: (orgId: string, data: any) => post<any>(`/organizations/${orgId}/invoices`, data),
    update: (orgId: string, id: string, data: any) => patch<any>(`/organizations/${orgId}/invoices/${id}`, data),
    markPaid: (orgId: string, id: string) => patch<any>(`/organizations/${orgId}/invoices/${id}/pay`, {}),
    byCustomer: (orgId: string, customerId: string) => get<any[]>(`/organizations/${orgId}/customers/${customerId}/invoices`),
    uploadFile: async (orgId: string, file: File) => {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('synqdrive_token');
      const res = await fetch(`/api/v1/organizations/${orgId}/invoices/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json() as Promise<{ url: string }>;
    },
  },
  activityLog: {
    listAll: () => get<any[]>('/admin/activity-log'),
    listByOrg: (orgId: string) => get<any[]>(`/organizations/${orgId}/activity-log`),
  },
  products: {
    list: () => get<any[]>('/admin/products'),
    stats: () => get<any>('/admin/products/stats'),
    listByOrg: (orgId: string) => get<any[]>(`/admin/products/org/${orgId}`),
    assign: (data: any) => post<any>('/admin/products/assign', data),
  },
  integrations: {
    listAll: () => get<any[]>('/admin/integrations'),
    stats: () => get<any>('/admin/integrations/stats'),
    listByOrg: (orgId: string) => get<any[]>(`/organizations/${orgId}/integrations`),
  },
  prospects: {
    list: () => get<any[]>('/admin/prospects'),
    get: (id: string) => get<any>(`/admin/prospects/${id}`),
    create: (data: any) => post<any>('/admin/prospects', data),
    update: (id: string, data: any) => patch<any>(`/admin/prospects/${id}`, data),
    delete: (id: string) => del<void>(`/admin/prospects/${id}`),
    convert: (id: string) => post<any>(`/admin/prospects/${id}/convert`, {}),
  },
  vehicleIntelligence: {
    all: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/intelligence`),
    battery: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/battery`),
    tires: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/tires`),
    tireWearAnalysis: (vehicleId: string) => get<TireWearAnalysis | null>(`/vehicles/${vehicleId}/tires/wear-analysis`),
    tireHealthSummary: (vehicleId: string) => get<TireHealthSummaryResponse | null>(`/vehicles/${vehicleId}/tires/summary`),
    tireHealthDetail: (vehicleId: string) => get<TireHealthDetailResponse | null>(`/vehicles/${vehicleId}/tires/detail`),
    tireRotationHistory: (vehicleId: string) => get<any[]>(`/vehicles/${vehicleId}/tires/rotation-history`),
    rotateTires: (vehicleId: string, data: { template: string; odometerKm?: number; notes?: string }) =>
      post<any>(`/vehicles/${vehicleId}/tires/rotate`, data),
    changeTires: (vehicleId: string, data: any) => post<any>(`/vehicles/${vehicleId}/tires/change`, data),
    activateStoredTireSet: (vehicleId: string, data: { storedSetupId?: string; odometerKm?: number; notes?: string }) =>
      post<any>(`/vehicles/${vehicleId}/tires/activate-stored-set`, data),
    addTireHealthMeasurement: (vehicleId: string, data: any) =>
      post<any>(`/vehicles/${vehicleId}/tires/measurement`, data),
    recalculateTireHealth: (vehicleId: string) => post<any>(`/vehicles/${vehicleId}/tires/recalculate`, {}),
    applyAiTireSpec: (vehicleId: string, payload: { jobId?: string; aiTireSpec?: Record<string, unknown> }) =>
      post<{ success: boolean; setupId?: string; appliedFields?: string[]; message?: string }>(`/vehicles/${vehicleId}/tires/ai-spec/apply`, payload),
    startAiTireSpecJob: (params: { brand: string; model: string; year: number; tireSize: string; loadIndex: string; speedIndex: string; vehicleId?: string }) =>
      post<{ jobId: string; status: string }>('/vehicles/register/ai-tire-specs', params),
    getAiTireSpecJobStatus: (jobId: string) =>
      get<{ jobId: string; status: string; createdAt: string; startedAt: string | null; completedAt: string | null; errorMessage: string | null; confidenceScore: number | null; result: Record<string, unknown> | null; resultReady: boolean; input: Record<string, string | number> }>(`/vehicles/register/ai-tire-specs/${jobId}/status`),
    tireCalibrationMeasurement: (vehicleId: string, tireSetupId: string, data: any) =>
      post<any>(`/vehicles/${vehicleId}/tires/${tireSetupId}/calibration-measurement`, data),
    brakes: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/brakes`),
    /** @deprecated Legacy heuristic endpoint only. */
    brakeStatus: (vehicleId: string) => get<BrakeStatus>(`/vehicles/${vehicleId}/brake-status`),
    brakeHealthSummary: (vehicleId: string) => get<BrakeHealthSummary>(`/vehicles/${vehicleId}/brake-health/summary`),
    brakeHealthDetail: (vehicleId: string) => get<BrakeHealthDetail>(`/vehicles/${vehicleId}/brake-health/detail`),
    brakeHealthInitialize: (
      vehicleId: string,
      data: {
        serviceDate: string;
        odometerKm?: number;
        frontPadMm?: number;
        rearPadMm?: number;
        frontRotorWidthMm?: number;
        rearRotorWidthMm?: number;
        kind?: BrakeServiceKindInput;
        scope?: BrakeServiceScopeInput[];
        workshopName?: string;
        notes?: string;
      },
    ) => post<BrakeServiceLifecycleResult>(`/vehicles/${vehicleId}/brake-health/initialize`, data),
    recordBrakeService: (
      vehicleId: string,
      data: {
        serviceDate: string;
        odometerKm?: number;
        workshopName?: string;
        notes?: string;
        source?: 'manual' | 'ai_document' | 'api';
        kind?: BrakeServiceKindInput;
        scope?: BrakeServiceScopeInput[];
        measured?: {
          frontPadMm?: number;
          rearPadMm?: number;
          frontDiscMm?: number;
          rearDiscMm?: number;
        };
        initializeIfPossible?: boolean;
      },
    ) => post<BrakeServiceLifecycleResult>(`/vehicles/${vehicleId}/brake-health/service`, data),
    brakeHealthRecalculate: (vehicleId: string) => post<any>(`/vehicles/${vehicleId}/brake-health/recalculate`, {}),
    createBrakeSpec: (vehicleId: string, data: any) => post<any>(`/vehicles/${vehicleId}/brakes`, data),
    tripProfile: (vehicleId: string) => get<TripProfile>(`/vehicles/${vehicleId}/trip-profile`),
    serviceEvents: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/service-events`),
    dtc: (vehicleId: string) => get<any[]>(`/vehicles/${vehicleId}/dtc`),
    dtcActive: (vehicleId: string) => get<any[]>(`/vehicles/${vehicleId}/dtc/active`),
    dtcStats: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/dtc/stats`),
    dtcSummary: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/dtc/summary`),
    dtcDetail: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/dtc/detail`),
    trips: (vehicleId: string, params?: { from?: string; to?: string; driver?: string }) =>
      get<VehicleTripAnalytics[]>(`/vehicles/${vehicleId}/trips` + buildQuery(params)),
    tripStats: (vehicleId: string) => get<VehicleTripStats>(`/vehicles/${vehicleId}/trips/stats`),
    tripDetail: (vehicleId: string, tripId: string) => get<VehicleTripAnalytics>(`/vehicles/${vehicleId}/trips/${tripId}`),
    energyEvents: (
      vehicleId: string,
      params?: { from?: string; to?: string },
    ) =>
      get<EnergyEvent[]>(
        `/vehicles/${vehicleId}/energy-events` + buildQuery(params),
      ),
    detectEnergyEvents: (
      vehicleId: string,
      payload?: { from?: string; to?: string },
    ) =>
      post<{
        fetched: number;
        created: number;
        updated: number;
        skipped: number;
        events: EnergyEvent[];
      }>(`/vehicles/${vehicleId}/energy-events/detect`, payload ?? {}),
    tripsTimeline: (
      vehicleId: string,
      params?: { from?: string; to?: string; driver?: string },
    ) =>
      get<TripTimelineItem[]>(
        `/vehicles/${vehicleId}/trips-timeline` + buildQuery(params),
      ),
    driverScore: (
      vehicleId: string,
      params: { subjectType: TripAssignmentSubjectType; subjectId: string; from?: string; to?: string },
    ) => get<DriverScoreSummary>(`/vehicles/${vehicleId}/trips/driver-score` + buildQuery({
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      from: params.from,
      to: params.to,
    })),
    tripRoute: (vehicleId: string, tripId: string) => get<any[]>(`/vehicles/${vehicleId}/trips/${tripId}/route`),
    /** @deprecated Use reconcileTrips instead */
    syncTrips: (vehicleId: string, _params?: { from?: string; to?: string }) =>
      post<any>(`/vehicles/${vehicleId}/trips/reconcile`, {}),
    reconcileTrips: (vehicleId: string) =>
      post<{ found: number; applied: number; message: string }>(`/vehicles/${vehicleId}/trips/reconcile`, {}),
    enrichTrip: (vehicleId: string, tripId: string) =>
      post<TripEnrichment>(`/vehicles/${vehicleId}/trips/${tripId}/enrich`, {}),
    tripBehaviorEvents: (vehicleId: string, tripId: string, category?: string) =>
      get<{ status: 'ready' | 'pending'; behaviorReady: boolean; events: TripBehaviorEvent[] }>(
        `/vehicles/${vehicleId}/trips/${tripId}/behavior-events` + (category ? `?category=${category}` : ''),
      ),
    enrichTripBehavior: (vehicleId: string, tripId: string) =>
      post<any>(`/vehicles/${vehicleId}/trips/${tripId}/behavior-enrich`, {}),
    damages: (vehicleId: string) => get<any[]>(`/vehicles/${vehicleId}/damages`),
    damagesActive: (vehicleId: string) => get<any[]>(`/vehicles/${vehicleId}/damages/active`),
    damageStats: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/damages/stats`),
    createDamage: (vehicleId: string, data: any) => post<any>(`/vehicles/${vehicleId}/damages`, data),
    repairDamage: (vehicleId: string, damageId: string) => patch<any>(`/vehicles/${vehicleId}/damages/${damageId}/repair`, {}),
    addDamageImage: (vehicleId: string, damageId: string, data: any) => post<any>(`/vehicles/${vehicleId}/damages/${damageId}/images`, data),
    batteryHealth: (vehicleId: string) => get<any[]>(`/vehicles/${vehicleId}/battery-health`),
    batteryHealthLatest: (vehicleId: string) => get<any>(`/vehicles/${vehicleId}/battery-health/latest`),
    batteryHealthTrend: (vehicleId: string, days?: number) =>
      get<any[]>(`/vehicles/${vehicleId}/battery-health/trend` + (days ? `?days=${days}` : '')),
    batteryHealthSummary: (vehicleId: string) => get<BatteryHealthSummary>(`/vehicles/${vehicleId}/battery-health-summary`),
    batteryHealthDetail: (vehicleId: string) => get<BatteryHealthDetail>(`/vehicles/${vehicleId}/battery-health-detail`),
    createServiceEvent: (vehicleId: string, data: any) => post<any>(`/vehicles/${vehicleId}/service-events`, data),
    createTireSetup: (vehicleId: string, data: any) => post<any>(`/vehicles/${vehicleId}/tires`, data),
    addTireMeasurement: (vehicleId: string, tireSetupId: string, data: any) =>
      post<any>(`/vehicles/${vehicleId}/tires/${tireSetupId}/measurements`, data),
    healthSummary: (vehicleId: string) => get<HealthSummaryResponse>(`/vehicles/${vehicleId}/health-summary`),
    oilChangeStatus: (vehicleId: string) => get<OilChangeStatus>(`/vehicles/${vehicleId}/oil-change-status`),
    createOilChangeEvent: (vehicleId: string, data: any) => post<any>(`/vehicles/${vehicleId}/service-events`, { ...data, eventType: 'OIL_CHANGE' }),
    hvBatteryStatus: (vehicleId: string) => get<HvBatteryStatus>(`/vehicles/${vehicleId}/hv-battery-status`),
    serviceInfoStatus: (vehicleId: string) => get<ServiceInfoStatus>(`/vehicles/${vehicleId}/service-info-status`),
    // Phase 3: AI Health Care with HM indicators
    aiHealthCare: (vehicleId: string) => get<AiHealthCareResponse>(`/vehicles/${vehicleId}/health/ai-health-care`),
    // Phase 3: HM vehicle activation
    hmStatus: (vehicleId: string) => get<HmVehicleStatusDto>(`/vehicles/${vehicleId}/high-mobility-status`),
    hmCheckEligibility: (vehicleId: string) => post<any>(`/vehicles/${vehicleId}/high-mobility/check-eligibility`, {}),
    hmActivateHealth: (vehicleId: string) => post<{ success: boolean; message: string }>(`/vehicles/${vehicleId}/high-mobility/activate-health`, {}),
    hmRefreshStatus: (vehicleId: string) => post<HmVehicleStatusDto>(`/vehicles/${vehicleId}/high-mobility/refresh-status`, {}),
    hmDeactivate: (vehicleId: string) => post<{ success: boolean; message: string }>(`/vehicles/${vehicleId}/high-mobility/deactivate`, {}),
    /** VW Group + Porsche only: skips eligibility, submits direct fleet clearance. */
    hmRequestDirectClearance: (vehicleId: string) =>
      post<{ success: boolean; message: string; status?: HmVehicleStatusDto }>(
        `/vehicles/${vehicleId}/hm-health-app/request-direct-clearance`,
        {},
      ),
    // Phase 3: HM Vehicle Health signals
    hmVehicleHealth: (vehicleId: string) => get<HmVehicleHealthPayload>(`/vehicles/${vehicleId}/hm-vehicle-health`),
    hmRefreshService: (vehicleId: string) => post<{ ok: boolean }>(`/vehicles/${vehicleId}/hm-vehicle-health/refresh-service`, {}),
    hmRefreshTirePressure: (vehicleId: string) => post<{ ok: boolean }>(`/vehicles/${vehicleId}/hm-vehicle-health/refresh-tire-pressure`, {}),
    hmRefreshAiHealthCare: (vehicleId: string) => post<{ ok: boolean }>(`/vehicles/${vehicleId}/hm-vehicle-health/refresh-ai-health-care`, {}),
    documentExtractions: (vehicleId: string) => get<any[]>(`/vehicles/${vehicleId}/document-extractions`),
    createDocumentExtraction: (vehicleId: string, data: any) => post<any>(`/vehicles/${vehicleId}/document-extractions`, data),
    confirmDocumentExtraction: (vehicleId: string, extractionId: string, data: any) => post<any>(`/vehicles/${vehicleId}/document-extractions/${extractionId}/confirm`, data),
  },
  partsAccessories: {
    providers: () => get<PartsProviderSummary[]>('/parts-accessories/providers'),
    disclosure: (providerKey: string, category?: string) =>
      get<{ disclosure: PartsDisclosureTemplate | null; disclosedFields: PartsDisclosedFieldSet | null }>(
        `/parts-accessories/providers/${providerKey}/disclosure` + (category ? `?category=${category}` : ''),
      ),
    confirmDisclosure: (data: { vehicleId: string; providerKey: string; category: string }) =>
      post<{ correlationId: string; authorizationLogId: string }>('/parts-accessories/disclosures/confirm', data),
    search: (data: PartsSearchParams) =>
      post<PartsSearchResponse>('/parts-accessories/search', data),
    productDetail: (providerKey: string, externalId: string, vehicleId?: string) =>
      get<PartsProductDetail | null>(`/parts-accessories/products/${providerKey}/${externalId}` + (vehicleId ? `?vehicleId=${vehicleId}` : '')),
    vehicleFitment: (vehicleId: string) =>
      get<PartsVehicleFitment>(`/parts-accessories/vehicles/fitment/${vehicleId}`),
    authorizationLogs: (params?: { providerKey?: string; from?: string; to?: string; page?: number; pageSize?: number }) => {
      const q: Record<string, string | undefined> = params
        ? { providerKey: params.providerKey, from: params.from, to: params.to, page: params.page?.toString(), pageSize: params.pageSize?.toString() }
        : undefined as any;
      return get<{ rows: PartsAuthorizationLogEntry[]; total: number; page: number; pageSize: number }>(
        '/parts-accessories/authorization-logs' + buildQuery(q),
      );
    },
    admin: {
      providers: () => get<any[]>('/admin/parts-accessories/providers'),
      createProvider: (data: any) => post<any>('/admin/parts-accessories/providers', data),
      updateProvider: (id: string, data: any) => patch<any>(`/admin/parts-accessories/providers/${id}`, data),
      testProvider: (id: string) => post<PartsConnectionTestResult>(`/admin/parts-accessories/providers/${id}/test`, {}),
      disclosures: (params?: { providerKey?: string; isActive?: string }) =>
        get<PartsDisclosureTemplate[]>('/admin/parts-accessories/disclosures' + buildQuery(params)),
      createDisclosure: (data: any) => post<PartsDisclosureTemplate>('/admin/parts-accessories/disclosures', data),
      updateDisclosure: (id: string, data: any) => patch<PartsDisclosureTemplate>(`/admin/parts-accessories/disclosures/${id}`, data),
      authorizationLogs: (params?: Record<string, string>) =>
        get<{ rows: PartsAuthorizationLogEntry[]; total: number; page: number; pageSize: number }>(
          '/admin/parts-accessories/authorization-logs' + buildQuery(params),
        ),
      health: () => get<PartsHealthOverview>('/admin/parts-accessories/health'),
    },
  },

  insurances: {
    overview: () => get<InsuranceFleetOverview>('/insurances/overview'),
    vehicleInsurance: (vehicleId: string) => get<InsuranceVehicleDetail>(`/insurances/vehicles/${vehicleId}`),
    partners: () => get<InsurancePartnerSummary[]>('/insurances/partners'),
    submitInquiry: (data: InsuranceInquirySubmission) =>
      post<InsuranceInquiryResult>('/insurances/inquiries', data),
    inquiries: (params?: Record<string, string>) =>
      get<{ rows: InsuranceInquiryRow[]; total: number; page: number; pageSize: number }>(
        '/insurances/inquiries' + buildQuery(params),
      ),
    inquiry: (id: string) => get<InsuranceInquiryRow>(`/insurances/inquiries/${id}`),
    liveSharing: (params?: Record<string, string>) =>
      get<InsuranceLiveSharingEntry[]>('/insurances/live-sharing' + buildQuery(params)),
    updateLiveSharing: (id: string, data: any) => patch<any>(`/insurances/live-sharing/${id}`, data),
    missingDocs: () => get<InsuranceMissingDocVehicle[]>('/insurances/documents-missing'),
    disclosure: (insurerKey?: string, inquiryType?: string) => {
      const q: Record<string, string | undefined> = { insurerKey, inquiryType };
      return get<InsuranceDisclosureTemplate | null>('/insurances/disclosure' + buildQuery(q));
    },
    admin: {
      partners: () => get<any[]>('/admin/insurances/partners'),
      createPartner: (data: any) => post<any>('/admin/insurances/partners', data),
      updatePartner: (id: string, data: any) => patch<any>(`/admin/insurances/partners/${id}`, data),
      testPartner: (id: string) => post<InsuranceConnectionTestResult>(`/admin/insurances/partners/${id}/test`, {}),
      contacts: (partnerId?: string) =>
        get<InsurancePartnerContactEntry[]>('/admin/insurances/partner-contacts' + buildQuery({ partnerId })),
      createContact: (data: any) => post<InsurancePartnerContactEntry>('/admin/insurances/partner-contacts', data),
      updateContact: (id: string, data: any) => patch<any>(`/admin/insurances/partner-contacts/${id}`, data),
      disclosureTemplates: (params?: Record<string, string>) =>
        get<InsuranceDisclosureTemplate[]>('/admin/insurances/disclosure-templates' + buildQuery(params)),
      createDisclosureTemplate: (data: any) =>
        post<InsuranceDisclosureTemplate>('/admin/insurances/disclosure-templates', data),
      updateDisclosureTemplate: (id: string, data: any) =>
        patch<InsuranceDisclosureTemplate>(`/admin/insurances/disclosure-templates/${id}`, data),
      inquiryTemplates: (params?: Record<string, string>) =>
        get<InsuranceInquiryTemplateEntry[]>('/admin/insurances/inquiry-templates' + buildQuery(params)),
      createInquiryTemplate: (data: any) =>
        post<InsuranceInquiryTemplateEntry>('/admin/insurances/inquiry-templates', data),
      updateInquiryTemplate: (id: string, data: any) =>
        patch<InsuranceInquiryTemplateEntry>(`/admin/insurances/inquiry-templates/${id}`, data),
      inquiries: (params?: Record<string, string>) =>
        get<{ rows: InsuranceInquiryRow[]; total: number; page: number; pageSize: number }>(
          '/admin/insurances/inquiries' + buildQuery(params),
        ),
      authorizationLogs: (params?: Record<string, string>) =>
        get<{ rows: InsuranceAuthorizationLogEntry[]; total: number; page: number; pageSize: number }>(
          '/admin/insurances/authorization-logs' + buildQuery(params),
        ),
      health: () => get<InsuranceHealthOverview>('/admin/insurances/health'),
    },
  },

  voiceAssistant: {
    get: (orgId: string) => get<VoiceAssistantData>(`/organizations/${orgId}/voice-assistant`),
    update: (orgId: string, data: Partial<VoiceAssistantData>) =>
      patch<VoiceAssistantData>(`/organizations/${orgId}/voice-assistant`, data),
    activate: (orgId: string) =>
      post<VoiceAssistantData>(`/organizations/${orgId}/voice-assistant/activate`, {}),
    deactivate: (orgId: string) =>
      post<VoiceAssistantData>(`/organizations/${orgId}/voice-assistant/deactivate`, {}),
    readiness: (orgId: string) =>
      get<VoiceAssistantReadiness>(`/organizations/${orgId}/voice-assistant/readiness`),
    voices: (orgId: string) =>
      get<VoiceOption[]>(`/organizations/${orgId}/voice-assistant/voices`),
    testSession: (orgId: string) =>
      post<{ signedUrl: string | null; agentId: string | null; message?: string }>(
        `/organizations/${orgId}/voice-assistant/test-session`, {},
      ),
    conversations: (orgId: string, limit?: number) =>
      get<VoiceConversationEntry[]>(
        `/organizations/${orgId}/voice-assistant/conversations${limit ? `?limit=${limit}` : ''}`,
      ),
    syncConversations: (orgId: string) =>
      post<{ synced: number }>(`/organizations/${orgId}/voice-assistant/conversations/sync`, {}),

    admin: {
      overview: () => get<VoiceAssistantAdminOverview>('/admin/voice-assistant/overview'),
      orgDetail: (orgId: string) =>
        get<VoiceAssistantAdminOrgDetail>(`/admin/voice-assistant/organizations/${orgId}`),
    },
  },

  highMobility: {
    // Eligibility
    checkEligibility: (vin: string, brand: string) =>
      post<HmEligibilityResultDto>('/admin/high-mobility/eligibility/check', { vin, brand }),
    getEligibility: (vin: string) =>
      get<HmEligibilityResultDto | null>(`/admin/high-mobility/eligibility/${vin}`),

    // Vehicle management
    listVehicles: (params?: {
      packageType?: HmPackageType;
      clearanceStatus?: HmClearanceStatus;
      sourceMode?: HmSourceMode;
      brand?: string;
      eligibilityStatus?: HmEligibilityStatus;
    }) => get<HmVehicleListDto>('/admin/high-mobility/vehicles' + buildQuery(params)),
    getVehicle: (id: string) => get<HmVehicleDto>(`/admin/high-mobility/vehicles/${id}`),
    createVehicle: (data: {
      vin: string;
      brand: string;
      packageType: HmPackageType;
      sourceMode?: HmSourceMode;
      organizationId?: string;
    }) => post<HmVehicleDto>('/admin/high-mobility/vehicles', data),
    refreshStatus: (id: string) =>
      post<HmVehicleDto>(`/admin/high-mobility/vehicles/${id}/refresh-status`, {}),
    removeVehicle: (id: string) =>
      del<void>(`/admin/high-mobility/vehicles/${id}`),
    fetchHealth: (id: string) =>
      post<any>(`/admin/high-mobility/vehicles/${id}/fetch-health`, {}),
    linkToVehicle: (hmVehicleId: string, synqdriveVehicleId: string) =>
      post<{ success: boolean; message: string }>(
        `/admin/high-mobility/vehicles/${hmVehicleId}/link-to-vehicle`,
        { synqdriveVehicleId },
      ),

    // Status history
    statusHistory: (vehicleId: string) =>
      get<HmStatusHistoryDto[]>(`/admin/high-mobility/status-history/${vehicleId}`),

    // Register flow (Phase 1)
    checkAvailability: (vin: string) =>
      get<HmAvailabilityDto>(`/vehicles/register/high-mobility-availability?vin=${encodeURIComponent(vin)}`),
    activateHealth: (vehicleId: string, hmVehicleId: string) =>
      post<{ success: boolean; message: string }>(
        `/vehicles/${vehicleId}/activate-high-mobility-health`,
        { hmVehicleId },
      ),

    // Phase 2: HM_ONLY registration
    createHmOnlyVehicle: (hmVehicleId: string, data: {
      organizationId: string;
      vehicleName?: string;
      licensePlate?: string;
      notes?: string;
      mileageKm?: number;
      fuelType?: string;
    }) => post<{ success: boolean; synqdriveVehicleId: string; vin: string; message: string }>(
      `/admin/high-mobility/vehicles/${hmVehicleId}/create-hm-only-vehicle`,
      data,
    ),
    getHmOnlyCandidates: (vin?: string) =>
      get<any[]>(`/admin/high-mobility/candidates/hm-only${vin ? `?vin=${encodeURIComponent(vin)}` : ''}`),

    // Phase 2: Full Telemetry link
    linkFullTelemetry: (hmVehicleId: string, synqdriveVehicleId: string) =>
      post<{ success: boolean; message: string }>(
        `/admin/high-mobility/vehicles/${hmVehicleId}/link-full-telemetry`,
        { synqdriveVehicleId },
      ),

    // Phase 2: Streaming readiness
    getStreamingReadiness: (hmVehicleId: string) =>
      get<HmStreamingReadinessDto>(`/admin/high-mobility/vehicles/${hmVehicleId}/streaming-readiness`),

    // Phase 2: MQTT consumer status + test
    getConsumerStatus: () =>
      get<HmMqttConsumerStatusDto>('/admin/high-mobility/stream/consumer-status'),
    testMqttConnection: () =>
      post<{ success: boolean; message: string }>('/admin/high-mobility/stream/test-connection', {}),

    // Phase 2: Stream logs
    getStreamLogs: (params?: {
      limit?: number;
      offset?: number;
      hmVehicleId?: string;
      vin?: string;
      ingestStatus?: string;
    }) => get<{ data: HmStreamSyncLogDto[]; total: number }>(
      '/admin/high-mobility/stream/logs' + buildQuery(params),
    ),
    getStreamLogById: (id: string) =>
      get<any>(`/admin/high-mobility/stream/logs/${id}`),

    // Phase 2: HM_ONLY via register endpoint
    registerHmOnly: (data: {
      hmVehicleId: string;
      organizationId: string;
      vehicleName?: string;
      licensePlate?: string;
      notes?: string;
    }) => post<{ success: boolean; synqdriveVehicleId: string; vin: string; message: string }>(
      '/vehicles/register/hm-only',
      data,
    ),

    // HM Telemetry-APP candidates (APPROVED FULL_TELEMETRY vehicles awaiting registration)
    listTelemetryAppCandidates: () =>
      get<HmVehicleDto[]>('/admin/high-mobility/telemetry-app/candidates'),

    // HM Telemetry-APP vehicle management
    listTelemetryAppVehicles: (params?: { clearanceStatus?: HmClearanceStatus }) =>
      get<HmVehicleListDto>('/admin/high-mobility/telemetry-app/vehicles' + buildQuery(params)),
    createTelemetryAppVehicle: (data: { vin: string; brand: string; organizationId?: string }) =>
      post<HmVehicleDto>('/admin/high-mobility/telemetry-app/vehicles', data),
    refreshTelemetryAppVehicleStatus: (id: string) =>
      post<HmVehicleDto>(`/admin/high-mobility/telemetry-app/vehicles/${id}/refresh-status`, {}),
    getTelemetryAppStreamingReadiness: (id: string) =>
      get<HmStreamingReadinessDto>(`/admin/high-mobility/telemetry-app/vehicles/${id}/streaming-readiness`),

    // HM app-container consumer status
    getHealthAppConsumerStatus: () =>
      get<HmMqttConsumerStatusDto>('/admin/high-mobility/health-app/stream/consumer-status'),
    getTelemetryAppConsumerStatus: () =>
      get<HmMqttConsumerStatusDto>('/admin/high-mobility/telemetry-app/stream/consumer-status'),
    testHealthAppMqttConnection: () =>
      post<{ success: boolean; message: string }>('/admin/high-mobility/health-app/stream/test-connection', {}),
    testTelemetryAppMqttConnection: () =>
      post<{ success: boolean; message: string }>('/admin/high-mobility/telemetry-app/stream/test-connection', {}),

    // System readiness
    getReadiness: () =>
      get<{
        healthApp: { oauthReady: boolean; mqttReady: boolean; mqttConnectionState: string };
        telemetryApp: { oauthReady: boolean; mqttReady: boolean; mqttConnectionState: string };
      }>('/admin/high-mobility/readiness'),

    // Per-app MQTT diagnostic endpoints (via /integrations/ prefix)
    getHealthAppMqttStatus: () =>
      get<{
        appContainer: string; mqttEnabled: boolean; oauthEnabled: boolean;
        connectionState: HmMqttConnectionState; consumerDbState: any;
        config: { host: string | null; port: number | null; topic: string | null; clientId: string | null; consumerGroup: string | null };
      }>('/integrations/hm-health-app/mqtt/status'),
    getTelemetryAppMqttStatus: () =>
      get<{
        appContainer: string; mqttEnabled: boolean; oauthEnabled: boolean;
        connectionState: HmMqttConnectionState; consumerDbState: any;
        config: { host: string | null; port: number | null; topic: string | null; clientId: string | null; consumerGroup: string | null };
      }>('/integrations/hm-telemetry-app/mqtt/status'),
    getHealthAppStreamLogs: (params?: { limit?: number; offset?: number; vin?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      if (params?.vin) q.set('vin', params.vin);
      if (params?.status) q.set('status', params.status);
      return get<{ data: HmStreamSyncLogDto[]; total: number }>(`/integrations/hm-health-app/stream/logs?${q}`);
    },
    getTelemetryAppStreamLogs: (params?: { limit?: number; offset?: number; vin?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      if (params?.vin) q.set('vin', params.vin);
      if (params?.status) q.set('status', params.status);
      return get<{ data: HmStreamSyncLogDto[]; total: number }>(`/integrations/hm-telemetry-app/stream/logs?${q}`);
    },
    getHmDualReadiness: () =>
      get<{
        healthApp: { appContainer: string; oauthReady: boolean; mqttReady: boolean; certConfigured: boolean };
        telemetryApp: { appContainer: string; oauthReady: boolean; mqttReady: boolean; certConfigured: boolean };
      }>('/integrations/hm/readiness'),
  },
  // V4.6.77 High Mobility Compatibility Matrix — Master-Admin internal
  // compatibility intelligence (brand/model/model-year → app suitability +
  // signal coverage + onboarding mode). Powers HighMobilityCompatibilityView
  // and is designed to be reusable later by the landing-page compatibility
  // checker and onboarding assistant.
  hmCompatibility: {
    listBrands: () =>
      get<{ brands: HmCompatibilityBrandOption[] }>(
        '/admin/high-mobility/compatibility/brands',
      ),
    listModels: (brand: string) =>
      get<{ models: HmCompatibilityModelOption[] }>(
        `/admin/high-mobility/compatibility/models?brand=${encodeURIComponent(brand)}`,
      ),
    check: (brand: string, model: string, year?: number | null) => {
      const params = new URLSearchParams();
      params.set('brand', brand);
      params.set('model', model);
      if (year != null && Number.isFinite(year)) {
        params.set('year', String(year));
      }
      return get<HmCompatibilityCheckResponse>(
        `/admin/high-mobility/compatibility/check?${params.toString()}`,
      );
    },
  },
};

/** Tire wear analysis response (V2 — includes explainability). */
export interface TireWearAnalysis {
  frontLeftMm: number;
  frontRightMm: number;
  rearLeftMm: number;
  rearRightMm: number;
  frontPercent: number;
  rearPercent: number;
  overallPercent: number;
  estimatedRemainingKm: number;
  referenceNewTreadFront?: number;
  referenceNewTreadRear?: number;
  operationalReplacementMm?: number;
  factors: {
    axleFactorFront: number;
    axleFactorRear: number;
    usageFactor: number;
    behaviorFactor: number;
    temperatureFactor: number;
    pressureFactorFront?: number;
    pressureFactorRear?: number;
    loadFactor?: number;
    seasonMismatchFactor?: number;
    interactionPenaltyFront?: number;
    interactionPenaltyRear?: number;
    regenBrakingFactorFront: number;
    regenBrakingFactorRear: number;
    kFactorFront: number;
    kFactorRear: number;
    isStaggered: boolean;
    drivingImpactAvailable: boolean;
    tireArchetype?: string;
    tireSpecMatched?: boolean;
  };
  explainability?: {
    currentTreadSource: string;
    referenceNewTreadSource: string;
    replacementThresholdSource: string;
    tireSpecConfidence: number;
    tireArchetype: string;
    topWearDrivers: string[];
    pressureImpact: string;
    behaviorImpact: string;
    temperatureImpact: string;
    loadImpact: string;
    seasonMismatchImpact: string;
    possibleCauseHints: string[];
  };
  effectiveWearRateKmPerMm: { front: number; rear: number };
}

export interface TireAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  position?: string;
  value?: number;
}

export type TireActionState =
  | 'OBSERVE'
  | 'CHECK_SOON'
  | 'PLAN_SERVICE'
  | 'REPLACE';

export type TirePressureFreshness =
  | 'fresh'
  | 'aging'
  | 'stale'
  | 'no_data';

export interface TirePressureContext {
  source: 'DIMO' | 'HM' | 'MIXED' | 'NONE';
  dimoFreshness: TirePressureFreshness;
  hmFreshness: TirePressureFreshness;
  overallStatus: 'OK' | 'ISSUE' | 'STALE' | 'UNKNOWN';
  warningHints: string[];
}

export interface TireHealthSummaryResponse {
  overallPercent: number;
  overallRemainingKm: number;
  healthStatus: string;
  confidenceScore: number;
  confidenceLabel: string;
  worstTirePosition: string | null;
  worstTirePercent: number | null;
  activeSetupName: string | null;
  activeSetupId: string | null;
  tireSeason: string | null;
  installedAt: string | null;
  totalKmOnSet: number;
  wearRateMmPer1000km: number | null;
  alerts: TireAlert[];
  tireCondition?: string;
  tireArchetype?: string | null;
  tireSpecMatched?: boolean;
  tireSpecConfidence?: number | null;
  dataCompletenessConfidence?: number | null;
  modelConfidence?: number | null;
  referenceNewTreadSource?: string | null;
  replacementThresholdSource?: string | null;
  currentTreadSource?: string | null;
  operationalReplacementMm?: number | null;
  topWearDrivers?: string[];
  actionState?: TireActionState;
  actionReasons?: string[];
  measurementState?: 'measured' | 'estimated' | 'mixed';
  dataQualityWarnings?: string[];
  pressureContext?: TirePressureContext;
  latestMeasurementAt?: string | null;
}

export interface TireWheelEstimate {
  position: string;
  treadMm: number;
  wearPercent: number;
  remainingKm: number;
  healthStatus: string;
  initialTreadMm: number;
  lastMeasuredMm: number | null;
  lastMeasuredAt: string | null;
  confidenceScore: number;
  confidenceLabel: string;
  brand: string | null;
  tireModel: string | null;
  size: string | null;
  totalKm: number;
  cityKm: number;
  highwayKm: number;
  ruralKm: number;
}

export interface TireHealthDetailResponse {
  summary: TireHealthSummaryResponse;
  wheels: TireWheelEstimate[];
  usageSplit: { city: number; highway: number; rural: number };
  factors: {
    axleFactorFront: number;
    axleFactorRear: number;
    usageFactor: number;
    behaviorFactor: number;
    temperatureFactor: number;
    pressureFactorFront?: number;
    pressureFactorRear?: number;
    loadFactor?: number;
    seasonMismatchFactor?: number;
    interactionPenaltyFront?: number;
    interactionPenaltyRear?: number;
    regenBrakingFactorFront: number;
    regenBrakingFactorRear: number;
    kFactorFront: number;
    kFactorRear: number;
    isStaggered: boolean;
    staggeredLifeAdjustmentFront: number;
    staggeredLifeAdjustmentRear: number;
    regressionActive: boolean;
    regressionConfidence: number;
    calibrationCount: number;
    driveType: string | null;
    drivingImpactAvailable: boolean;
    tireArchetype?: string;
    tireSpecMatched?: boolean;
  };
  explainability?: {
    currentTreadSource: string;
    referenceNewTreadSource: string;
    replacementThresholdSource: string;
    tireSpecConfidence: number;
    tireArchetype: string;
    topWearDrivers: string[];
    pressureImpact: string;
    behaviorImpact: string;
    temperatureImpact: string;
    loadImpact: string;
    seasonMismatchImpact: string;
    possibleCauseHints: string[];
  };
  effectiveWearRate: { front: number; rear: number };
  rotationHistory: any[];
  measurements: any[];
  alerts: TireAlert[];
}

export type SohPublicationState = 'INITIAL_CALIBRATION' | 'STABILIZING' | 'STABLE';

export interface BatteryCalibrationProgress {
  measurementPath: 'rest_and_crank' | 'rest_only';
  daysSinceFirstMeasurement: number;
  minimumDaysForStabilizing: number;
  daysRemainingForStabilizing: number;
  qualifiedEventCount: number;
  minimumQualifiedEventsForStabilizing: number;
  restObservationCount: number;
  minimumRestObservationsForStabilizing: number;
  crankObservationCount: number;
  minimumCrankObservationsForStabilizing: number;
  blockers: Array<'days' | 'qualified_events' | 'rest_observations' | 'crank_observations'>;
  lastMeasurementAgeMs: number | null;
}

export type BatteryRuntimeStatus =
  | 'ready'
  | 'calibrating'
  | 'stabilizing'
  | 'no_recent_data'
  | 'estimate_unavailable'
  | 'unsupported';

export type BatteryRuntimeCondition =
  | 'good'
  | 'watch'
  | 'attention'
  | 'calibrating'
  | 'unknown';

export interface BatteryFreshness {
  observedAt: string | null;
  ageMs: number | null;
  isFresh: boolean;
}

export interface CanonicalLvBatterySection {
  status: BatteryRuntimeStatus;
  condition: BatteryRuntimeCondition;
  healthPercent: number | null;
  estimatedHealthPercent: number | null;
  method: string | null;
  confidence: string | null;
  freshness: BatteryFreshness;
  evidenceType: string | null;
  publicationState: SohPublicationState;
  telemetry: {
    voltageV: number | null;
    restingVoltage: number | null;
    crankingVoltage: number | null;
    chargingVoltage: number | null;
    temperatureC: number | null;
  };
  calibrationProgress: BatteryCalibrationProgress;
}

export interface CanonicalHvBatterySection {
  status: BatteryRuntimeStatus;
  condition: BatteryRuntimeCondition;
  healthPercent: number | null;
  method: string | null;
  confidence: string | null;
  freshness: BatteryFreshness;
  evidenceType: string | null;
  publicationState: SohPublicationState;
  telemetry: {
    socPercent: number | null;
    rangeKm: number | null;
    chargingPowerKw: number | null;
    isCharging: boolean | null;
    chargingCableConnected: boolean | null;
    temperatureC: number | null;
    currentVoltageV: number | null;
    grossCapacityKwh: number | null;
    currentEnergyKwh: number | null;
    addedEnergyKwh: number | null;
    providerSohPercent: number | null;
  };
  snapshotCount: number;
  interpretation: { label: string; color: string; description: string } | null;
}

export interface BatteryCurrentTelemetrySection {
  observedAt: string | null;
  socPercent: number | null;
  rangeKm: number | null;
  chargingState: 'charging' | 'not_charging' | null;
  chargingPowerKw: number | null;
  lvVoltageV: number | null;
  genericEnergyPercent: number | null;
}

export interface BatteryHealthSummary {
  vehicleId: string;
  generatedAt: string;
  support: {
    lv: boolean;
    hv: boolean;
  };
  lv: CanonicalLvBatterySection;
  hv: CanonicalHvBatterySection;
  currentTelemetry: BatteryCurrentTelemetrySection;
  watchpoints: string[];
  recommendations: string[];

  // Compatibility fields for existing runtime consumers.
  currentState: {
    sohPercent: number | null;
    publishedSohPct: number | null;
    estimatedSohPct: number | null;
    publicationState: SohPublicationState;
    maturityConfidence: string;
    voltageV: number | null;
    temperatureC: number | null;
    lastChecked: string | null;
    restingVoltage: number | null;
    crankingVoltage: number | null;
    chargingVoltage: number | null;
    calibrationProgress: BatteryCalibrationProgress;
  };
  condition: 'good' | 'watch' | 'attention' | 'calibrating';
  trendDirection: 'stable' | 'declining' | 'improving' | 'unknown';
  specs: { batteryType: string | null; batteryAmpere: number | null; batteryVolt: number | null; sourceType: string } | null;
  trend7: Array<{ date: string; soh: number | null; voltage: number | null }>;
  trend30: Array<{ date: string; soh: number | null; voltage: number | null }>;
  history: Array<{
    id: string;
    type: 'measurement' | 'service';
    date: string;
    soh?: number | null;
    voltage?: number | null;
    temperature?: number | null;
    notes?: string | null;
    workshopName?: string | null;
    odometerKm?: number | null;
  }>;
}

export interface BatteryEvidenceItem {
  id: string;
  observedAt: string;
  sourceType: string | null;
  valueType: string;
  value: number | null;
  unit: string | null;
  provider: string | null;
  confidence: string | null;
  quality: string | null;
  documentExtractionId: string | null;
  serviceEventId: string | null;
}

export interface BatteryHealthDetail extends BatteryHealthSummary {
  detail: {
    lv: {
      evidence: BatteryEvidenceItem[];
    };
    hv: {
      evidence: BatteryEvidenceItem[];
      chargingSessions: Array<any>;
      recentTrend: Array<any>;
    };
  };
}

export interface HvBatteryStatus {
  isEv: boolean;
  nominalCapacityKwh: number | null;
  providerNominalCapacityKwh?: number | null;
  currentSocPercent: number | null;
  estimatedRangeKm: number | null;
  sohPercent: number | null;
  rawSohPercent: number | null;
  providerReportedSohPercent?: number | null;
  publishedSohPercent: number | null;
  sohMethod: string;
  sohSourceType?: string | null;
  publicationState: SohPublicationState;
  publicationMethod: string;
  maturityConfidence: string;
  validEstimateCount: number;
  sohInterpretation: { label: string; color: string; description: string };
  estimatedCurrentCapacityKwh: number | null;
  snapshotCount: number;
  chargingSessions: Array<any>;
  recentTrend: Array<any>;
  lastRecordedAt: string | null;
  telemetry?: {
    temperatureC: number | null;
    chargingPowerKw: number | null;
    isCharging: boolean | null;
    chargingCableConnected: boolean | null;
    currentVoltageV: number | null;
    currentEnergyKwh: number | null;
    addedEnergyKwh: number | null;
  };
  providerSohObservedAt?: string | null;
  canonical?: CanonicalHvBatterySection | null;
  currentTelemetry?: BatteryCurrentTelemetrySection | null;
}

export interface ServiceInfoStatus {
  hasServiceBaseline: boolean;
  serviceRemainingPercent: number | null;
  serviceRemainingKm: number | null;
  serviceRemainingMonths: number | null;
  /** Day-level precision from HM OEM signal (or derived from months). Signed — negative means overdue. */
  serviceRemainingDays: number | null;
  /** True when remainingDays < 0 OR remainingKm < 0 (either channel signals overdue). */
  serviceOverdue: boolean;
  /** Absolute days overdue. null when not overdue by time. */
  serviceOverdueDays: number | null;
  /** Absolute km overdue. null when not overdue by distance. */
  serviceOverdueKm: number | null;
  /** True when 0..7 remaining days OR 0..500 remaining km (imminent but not yet overdue). */
  serviceDueImminently: boolean;
  intervalKm: number | null;
  intervalMonths: number | null;
  lastServiceDate: string | null;
  lastServiceOdometer: number | null;
  lastServiceWorkshop: string | null;
  tuvValidTill: string | null;
  tuvRemainingMonths: number | null;
  /** Signed days until TÜV expires. Negative = lapsed. */
  tuvRemainingDays: number | null;
  tuvOverdue: boolean;
  tuvLastDate: string | null;
  bokraftValidTill: string | null;
  bokraftRemainingMonths: number | null;
  /** Signed days until BOKraft expires. Negative = lapsed. */
  bokraftRemainingDays: number | null;
  bokraftOverdue: boolean;
  bokraftLastDate: string | null;
  serviceHistory: Array<{ id: string; eventType: string; date: string; odometerKm: number | null; workshopName: string | null; notes: string | null }>;
  tuvHistory: Array<{ id: string; eventType: string; date: string; odometerKm: number | null; workshopName: string | null; notes: string | null }>;
  bokraftHistory: Array<{ id: string; eventType: string; date: string; odometerKm: number | null; workshopName: string | null; notes: string | null }>;
  /** Phase 3: set to true when HM Health is active and overrides km/months values */
  hmServiceSource?: boolean;
  /** Phase 3: ISO timestamp of last successful HM service signal fetch */
  hmLastUpdatedAt?: string | null;
  /** True when OEM streams `maintenance.distance_to_next_service` for this vehicle. */
  hmDistanceFromOem?: boolean;
  /** True when OEM streams `maintenance.time_to_next_service` for this vehicle. */
  hmTimeFromOem?: boolean;
}

export interface OilChangeStatus {
  hasBaseline: boolean;
  remainingPercent: number | null;
  intervalKm: number | null;
  intervalMonths: number | null;
  lastChangeDate: string | null;
  lastChangeOdometerKm: number | null;
  lastChangeWorkshop: string | null;
  kmSinceChange: number | null;
  monthsSinceChange: number | null;
  currentOdometerKm: number | null;
  history: Array<{
    id: string;
    date: string;
    odometerKm: number | null;
    workshopName: string | null;
    notes: string | null;
  }>;
}

/** @deprecated Legacy heuristic payload. Prefer BrakeHealthSummary/Detail. */
export interface BrakeStatus {
  hasSpecs: boolean;
  isEv: boolean;
  regenBrakingNote: string | null;
  condition: 'good' | 'watch' | 'attention';
  padWearPercent: number | null;
  brakeForceFrontPercent: number | null;
  kmSinceService: number | null;
  daysSinceService: number | null;
  lastServiceDate: string | null;
  lastServiceWorkshop: string | null;
  lastTelemetryAt: string | null;
  drivingImpact: {
    totalHarshBrakes90d: number;
    harshBrakesPer100km: number | null;
    totalKm90d: number;
    brakingBehavior: string;
  };
  specs: {
    id: string;
    frontRotorDiameter: number | null;
    frontRotorWidth: number | null;
    frontPadThickness: number | null;
    rearRotorDiameter: number | null;
    rearRotorWidth: number | null;
    rearPadThickness: number | null;
    sourceType: string | null;
  } | null;
  history: Array<{ id: string; date: string; odometerKm: number | null; workshopName: string | null; notes: string | null; costCents: number | null }>;
  watchpoints: string[];
  recommendations: string[];
  dataConfidence: 'low' | 'medium' | 'high';
}

// ── Brake Health V2 DTOs ─────────────────────────────────────────────────────

export interface BrakeAxleEstimate {
  anchorMm: number | null;
  estimatedMm: number | null;
  healthPct: number | null;
  remainingKm: number | null;
  wearRateMmPerKm: number | null;
  kFactor: number;
}

export interface BrakeAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  value?: number;
}

export type BrakeStateClass = 'MEASURED' | 'ESTIMATED' | 'WARNING_ONLY' | 'NO_BASELINE';
export type BrakeServiceKindInput =
  | 'inspection_only'
  | 'pads_service'
  | 'discs_service'
  | 'brake_fluid_service'
  | 'full_brake_service';
export type BrakeServiceScopeInput =
  | 'front_pads'
  | 'rear_pads'
  | 'front_discs'
  | 'rear_discs';

export interface BrakeModeledComponents {
  frontPads: boolean;
  rearPads: boolean;
  frontDiscs: boolean;
  rearDiscs: boolean;
  hasAnyPads: boolean;
  hasAnyDiscs: boolean;
  hasAnyModeled: boolean;
}

export interface BrakeModelCoverage {
  distanceSinceAnchorKm: number | null;
  modeledDistanceKm: number | null;
  modeledTripCount: number;
  coverageRatio: number | null;
  hasGap: boolean;
  source:
    | 'trip_impacts'
    | 'trip_impacts_plus_rolling_gap'
    | 'rolling_gap_only'
    | 'none';
}

export interface BrakeServiceLifecycleResult {
  serviceEventId: string;
  lifecycleApplied: boolean;
  initialized: boolean;
  status: 'initialized' | 'history_only';
  message: string;
}

export interface BrakeHealthSummary {
  isInitialized: boolean;
  stateClass: BrakeStateClass;
  status?: string;
  message?: string;
  actions?: { canAddBrakeService: boolean; canUseAiUpload: boolean };
  pads?: { healthPercent: number; estimatedLifetimeKm: number | null };
  discs?: { healthPercent: number; estimatedLifetimeKm: number | null };
  limitingComponent?:
    | 'FRONT_PADS'
    | 'REAR_PADS'
    | 'FRONT_DISCS'
    | 'REAR_DISCS'
    | 'PADS_SET'
    | 'DISCS_SET'
    | null;
  remainingKm?: number | null;
  modeledComponents: BrakeModeledComponents;
  modelCoverage: BrakeModelCoverage;
  lastChangeAt?: string | null;
  lastRecalculatedAt?: string | null;
  confidence?: { score: number; label: string };
  baselineWarnings: string[];
  provenanceWarnings: string[];
  hasAlert?: boolean;
  legacyHeuristic?: { available: boolean; note: string };
}

export interface BrakeHealthDetail {
  summary: BrakeHealthSummary;
  frontPads: BrakeAxleEstimate | null;
  rearPads: BrakeAxleEstimate | null;
  frontDiscs: BrakeAxleEstimate | null;
  rearDiscs: BrakeAxleEstimate | null;
  specs: any;
  history: Array<{
    id: string;
    date: string;
    odometerKm: number | null;
    workshopName: string | null;
    notes: string | null;
    costCents: number | null;
    serviceKind?: string | null;
    source?: string | null;
    scope?: string[] | null;
    lifecycleApplied?: boolean | null;
    lifecycleNote?: string | null;
  }>;
  alerts: BrakeAlert[];
  factors: Record<string, number>;
  drivingImpactAvailable: boolean;
  distanceSinceAnchorKm: number | null;
  brakeBiasInfo: { front: number; rear: number; source: string } | null;
}

export type SpeedingSeverity = 'low' | 'moderate' | 'high' | 'severe';

export interface SpeedingSection {
  sectionIndex: number;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
  approxDistanceMeters: number;
  representativeSpeedLimitKmh: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  maxOverSpeedKmh: number;
  avgOverSpeedKmh: number;
  pointCount: number;
  mapboxLimitPointCount: number;
  fallbackLimitPointCount: number;
  primaryLimitSource: 'mapbox' | 'fallback' | 'mixed';
  severity: SpeedingSeverity;
  coordinates: [number, number][];
}

export interface TripEnrichment {
  citySharePercent: number;
  highwaySharePercent: number;
  countrySharePercent: number;
  cityKm: number;
  highwayKm: number;
  countryKm: number;
  outsideTemperatureStartC: number | null;
  fuelUsedLiters: number | null;
  avgConsumptionLPer100Km: number | null;
  fuelConfidence: string | null;
  energyUsedKwh: number | null;
  avgConsumptionKwhPer100Km: number | null;
  energyConfidence: string | null;
  engineTempStartC: number | null;
  engineTempEndC: number | null;
  avgRpm: number | null;
  avgThrottlePosition: number | null;
  avgEngineLoad: number | null;
  /** @deprecated Legacy point-based percentage */
  speedingPercent: number | null;
  maxOverSpeedKmh: number | null;
  /** @deprecated Now equals speedingSectionCount */
  speedingSegments: number | null;
  speedingSectionCount: number | null;
  speedingDistanceMeters: number | null;
  speedingDurationSeconds: number | null;
  speedingExposurePercent: number | null;
  avgOverSpeedKmh: number | null;
  speedingSections: SpeedingSection[] | null;
  mapMatchConfidence: number;
  matchedGeometry: [number, number][];
  enrichedAt: string;
}

export interface TripBehaviorEvent {
  id: string;
  organizationId: string | null;
  vehicleId: string;
  tripId: string;
  eventCategory: 'ACCELERATION' | 'BRAKING' | 'ABUSE';
  eventType: string;
  classification: 'LIGHT' | 'MODERATE' | 'HARD' | 'EXTREME' | 'WARNING' | 'SEVERE' | 'CRITICAL';
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  startSpeedKmh: number | null;
  endSpeedKmh: number | null;
  peakValue: number | null;
  peakValueUnit: string | null;
  peakG: number | null;
  maxThrottlePos: number | null;
  maxEngineRpm: number | null;
  maxCoolantTemp: number | null;
  latitude: number | null;
  longitude: number | null;
  source?: 'BEHAVIOR_EVENT' | 'DRIVING_EVENT';
  metadataJson: any;
}

export interface TripProfile {
  totalTrips: number;
  totalDistanceKm?: number;
  avgCity: number | null;
  avgHighway: number | null;
  avgCountry: number | null;
  avgTemp: number | null;
}

export interface JammingIncidentDto {
  detectedAt: string | null;
  where: string | null;
  lastKnownAddress: string | null;
}

export interface FleetMapVehicleResponse {
  id: string;
  licensePlate: string | null;
  displayName: string;
  make: string | null;
  model: string;
  year: number | null;
  status: string;
  fuelType: string;
  healthStatus: string;
  cleaningStatus: string;
  stationId: string | null;
  stationName: string | null;
  latitude: number | null;
  longitude: number | null;
  lastSeenAt: string | null;
  signalAgeMs: number;
  isFresh: boolean;
  onlineStatus: string;
  displayState: string;
  displayIgnition: string;
  isLiveTracking: boolean;
  heading: number | null;
  imageUrl: string | null;
  // V4.6.84 — canonical fleet-status context. All fields nullable so
  // legacy consumers that do not read them keep working unchanged.
  odometerKm: number | null;
  fuelPercent: number | null;
  evSoc: number | null;
  isElectric: boolean;
  reservedBookingId: string | null;
  reservedCustomerName: string | null;
  reservedPickupAt: string | null;
  // V4.6.94 — Booking endDate exposed so the Reserved fleet-status card
  // can render the planned rental duration without an extra round-trip.
  reservedReturnAt: string | null;
  reservedPickupStationName: string | null;
  reservedIsOverdue: boolean;
  activeBookingId: string | null;
  activeCustomerName: string | null;
  // V4.6.94 — Booking startDate (NOT pickup-protocol timestamp). Lets
  // the Active Rented card render a "time-progress" bar.
  activeStartAt: string | null;
  activeReturnAt: string | null;
  activeReturnStationName: string | null;
  activeKmIncluded: number | null;
  activeKmDriven: number | null;
  activeIsOverdue: boolean;
  maintenanceReason: string | null;
  maintenanceReasonCode: FleetMaintenanceReasonCode | null;
  maintenanceUrgency: 'planned' | 'urgent' | null;
}

export type FleetMaintenanceReasonCode = 'SCHEDULED_SERVICE' | 'OPERATIONAL_BLOCK';

export interface FleetConnectivityVehicle {
  vehicleId: string;
  vin: string;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number | null;
  station: string | null;
  connectionType: string;
  sourceType: string | null;
  provider: string;
  deviceSerial: string | null;
  syntheticTokenId: number | null;
  dimoTokenId: number | null;
  connectionStatus: 'online' | 'standby' | 'offline' | 'not_connected';
  statusNote: string;
  online: boolean;
  lastSeenAt: string | null;
  lastSyncedAt: string | null;
  freshnessLabel: string;
  pairedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  odometerKm: number | null;
  hasTelemetry: boolean;
  obdIsPluggedIn: boolean | null;
  jammingDetectedCount: number;
  jammingIncidents: JammingIncidentDto[];
}

export interface FleetConnectivityResponse {
  summary: {
    total: number;
    online: number;
    standby: number;
    offline: number;
    notConnected: number;
  };
  vehicles: FleetConnectivityVehicle[];
}

export interface AdminFleetConnectivityVehicle {
  vehicleId: string;
  vin: string;
  licensePlate: string | null;
  make: string;
  model: string;
  year: number | null;
  organizationId: string | null;
  organizationName: string | null;
  connectionType: string;
  sourceType: string | null;
  provider: string;
  deviceSerial: string | null;
  syntheticTokenId: number | null;
  dimoTokenId: number | null;
  dimoConnectionStatus: string | null;
  connectionStatus: 'online' | 'standby' | 'offline' | 'not_connected';
  statusNote: string;
  online: boolean;
  lastSeenAt: string | null;
  lastSyncedAt: string | null;
  freshnessLabel: string;
  pairedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  odometerKm: number | null;
  hasTelemetry: boolean;
  obdIsPluggedIn: boolean | null;
  jammingDetectedCount: number;
  jammingIncidents: JammingIncidentDto[];
  availableSignals: string[];
  signalCoverage: number;
  diagnostics: {
    pollSuccess24h: number;
    pollFailure24h: number;
    lastPollSuccessAt: string | null;
    lastPollFailureAt: string | null;
    lastPollError: string | null;
    lastPollDurationMs: number | null;
  };
}

export interface VehicleComplaint {
  id: string;
  organizationId: string;
  vehicleId: string;
  createdByUserId: string | null;
  description: string;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  region: string | null;
  status: 'ACTIVE' | 'RESOLVED';
  source: 'FIELD_AGENT' | 'MANUAL';
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminFleetConnectivityResponse {
  summary: {
    total: number;
    online: number;
    standby: number;
    offline: number;
    notConnected: number;
    withTelemetry: number;
    avgSignalCoverage: number;
  };
  pollHealth: {
    success24h: number;
    failure24h: number;
    timeout24h: number;
    successRate: number | null;
    lastFailureAt: string | null;
    lastFailureError: string | null;
    lastFailureJobType: string | null;
  };
  vehicles: AdminFleetConnectivityVehicle[];
}

/** AI Health Care Summary response (agent contract). */
export interface HealthSummaryResponse {
  overallStatus: { level: 'good' | 'watch' | 'attention'; title: string; shortSummary: string };
  positives: string[];
  watchpoints: string[];
  futureOutlook: { summary: string; items: string[] };
  preventiveRecommendations: string[];
  maintenanceFocus: Array<{ area: string; priority: 'low' | 'medium' | 'high'; reason: string }>;
  dataConfidence: { level: 'low' | 'medium' | 'high'; reason: string };
}

// ── Phase 3: High Mobility Vehicle Activation types ──────

export type HmActivationState =
  | 'NOT_CONFIGURED'
  | 'ELIGIBLE'
  | 'CLEARANCE_PENDING'
  | 'APPROVED'
  | 'LINKED_ACTIVE'
  | 'REJECTED'
  | 'REVOKED'
  | 'ERROR';

/**
 * OEM onboarding path.
 * ELIGIBILITY_FIRST      — BMW, Mercedes, Toyota, Renault, Ford, etc.
 * DIRECT_FLEET_CLEARANCE — VW Group (Audi, VW, Skoda, SEAT, CUPRA) + Porsche
 * UNKNOWN                — unrecognized brand; safe fallback tries direct clearance
 */
export type HmOemPath = 'ELIGIBILITY_FIRST' | 'DIRECT_FLEET_CLEARANCE' | 'UNKNOWN';

export interface HmVehicleStatusDto {
  state: HmActivationState;
  hmVehicleId: string | null;
  vin: string;
  brand: string | null;
  clearanceStatus: string | null;
  eligibilityStatus: string | null;
  isLinked: boolean;
  linkedAt: string | null;
  lastCheckedAt: string | null;
  canActivate: boolean;
  canDeactivate: boolean;
  canCheckEligibility: boolean;
  canRefresh: boolean;
  /** OEM onboarding path — determines whether eligibility must be checked first. */
  oemPath: HmOemPath;
  /** True when brand uses direct fleet clearance and no HM record exists yet. */
  canRequestDirectClearance: boolean;
  /** Human-readable explanation for why eligibility is skipped (VW Group / Porsche). */
  routingNote: string | null;
}

export interface HmTirePressureSignals {
  frontLeft: number | null;
  frontRight: number | null;
  rearLeft: number | null;
  rearRight: number | null;
  unit: string;
  statusFrontLeft: string | null;
  statusFrontRight: string | null;
  statusRearLeft: string | null;
  statusRearRight: string | null;
  overallStatus: 'OK' | 'ISSUE' | 'UNKNOWN';
  lastUpdatedAt: string | null;
  hmVehicleId: string;
}

export interface HmServiceSignals {
  distanceToNextServiceKm: number | null;
  timeToNextServiceDays: number | null;
  lastUpdatedAt: string | null;
  hmVehicleId: string;
}

export interface HmAiHealthCareSignals {
  oilLevel: { value: unknown; unit: string | null; status: string | null } | null;
  limpModeActive: boolean | null;
  brakeLiningPreWarning: boolean | null;
  tirePressureWarning: boolean | null;
  dashboardLights: unknown | null;
  lastUpdatedAt: string | null;
  hmVehicleId: string;
}

export interface HmVehicleHealthPayload {
  hmActive: boolean;
  service: HmServiceSignals | null;
  tirePressure: HmTirePressureSignals | null;
  aiHealth: HmAiHealthCareSignals | null;
}

export interface HmIndicators {
  oilLevel: { value: unknown; status: 'LOW' | 'OK' | 'HIGH' | 'UNKNOWN'; unit: string | null } | null;
  limpMode: { active: boolean } | null;
  brakeLiningPreWarning: { active: boolean } | null;
  tirePressureWarning: { active: boolean } | null;
}

export type HmFreshnessStatus = 'fresh' | 'aging' | 'stale' | 'no_data';

export type AiHealthStatusLevel =
  | 'EXCELLENT'
  | 'GOOD'
  | 'ATTENTION_NEEDED'
  | 'CRITICAL'
  | 'NO_RECENT_DATA';

export interface OilLevelDisplay {
  mode: 'normalized_bar' | 'status_only' | 'no_data';
  value: number | null;
  label: string;
}

export interface AiHealthIndicators {
  limpMode: boolean | null;
  brakeWarning: boolean | null;
  tirePressureWarning: boolean | null;
  /**
   * Dashboard battery warning light (from OEM dashboard_lights.battery_low_warning
   * where available). null when the OEM does not stream this signal.
   */
  batteryWarningLight: boolean | null;
}

export interface AiHealthCareResponse extends HealthSummaryResponse {
  // ── New canonical fields ────────────────────────────────────────────────
  aiStatus: AiHealthStatusLevel;
  summaryText: string;
  reasons: string[];
  oilLevelDisplay: OilLevelDisplay;
  indicators: AiHealthIndicators;
  // ── Legacy HM fields ───────────────────────────────────────────────────
  hmIndicators: HmIndicators;
  lastHmUpdate: string | null;
  hmHealthActive: boolean;
  hmFreshnessStatus?: HmFreshnessStatus;
  hmLastErrorAt?: string | null;
  hmLastErrorMessage?: string | null;
}

// ── Vendor / Service Partner types ──────────────────────

export type VendorCategory =
  | 'WORKSHOP' | 'SERVICE_PARTNER' | 'PAINT_SHOP' | 'BODY_REPAIR'
  | 'AUTO_GLASS' | 'TIRE_DEALER' | 'PARTS_DEALER' | 'DETAILING'
  | 'TUV_STATION' | 'ONLINE_SUPPLIER' | 'OTHER';

export type VendorSourceType = 'LOCAL_BUSINESS' | 'ONLINE_VENDOR';

export interface VendorLinkedVehicle {
  id: string;
  make: string;
  model: string;
  licensePlate: string | null;
  year: number | null;
  vin?: string;
  vendorVehicleId?: string;
  notes?: string | null;
}

export interface Vendor {
  id: string;
  organizationId: string;
  name: string;
  category: VendorCategory;
  sourceType: VendorSourceType;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  serviceAreas: string[];
  contactName: string | null;
  contactRole: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactNotes: string | null;
  isActive: boolean;
  linkedVehicles: VendorLinkedVehicle[];
  linkedVehicleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceSuggestion {
  placeId: string;
  name: string;
  address: string;
  description: string;
}

export interface PlaceDetails {
  name: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string | null;
  types: string[];
}

// ── Stations & Branches ─────────────────────────────────────────────────────
// Mirrors backend StationDto / StationsService.
export type StationStatus = 'ACTIVE' | 'INACTIVE';

export interface Station {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  /**
   * Geofence radius (m). When non-null and combined with `latitude` /
   * `longitude`, a vehicle is considered "at home" if its current GPS
   * fix is within this many meters of the station's coordinates. See
   * `frontend/src/lib/geospatial.ts > isVehicleAtHomeStation`.
   */
  radiusMeters: number | null;
  phone: string | null;
  email: string | null;
  managerName: string | null;
  openingHours: string | null;
  notes: string | null;
  googlePlaceId: string | null;
  status: StationStatus;
  statusLabel: string;
  vehicleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StationUpsertPayload {
  name: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number | null;
  phone?: string | null;
  email?: string | null;
  managerName?: string | null;
  openingHours?: string | null;
  notes?: string | null;
  googlePlaceId?: string | null;
  status?: StationStatus;
}

export interface StationsStats {
  totalStations: number;
  activeStations: number;
  inactiveStations: number;
  totalVehicles: number;
  unassignedVehicles: number;
  stations: Array<{
    id: string;
    name: string;
    city: string | null;
    status: StationStatus;
    statusLabel: string;
    vehicleCount: number;
  }>;
}

export interface StationVehicleAssignmentResult {
  stationId: string;
  totalAssigned: number;
  newlyAttached: number;
  detached: number;
  movedFromOtherStations: number;
}

// V4.7.07 — One-shot Mapbox geocoding backfill summary returned by
// `api.stations.backfillCoordinates(orgId)`. Mirrors backend
// `StationGeocodingBackfillResult` in `stations.service.ts`.
export interface StationGeocodingBackfillResult {
  totalChecked: number;
  totalGeocoded: number;
  totalFailed: number;
  totalSkipped: number;
  results: Array<{
    stationId: string;
    stationName: string;
    status: 'geocoded' | 'failed' | 'skipped';
    latitude: number | null;
    longitude: number | null;
    reason?: string;
  }>;
}

export interface StationPlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
}

export interface StationPlaceDetails {
  name: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  googleMapsUrl: string | null;
}

export interface ChatMessageResponse {
  id?: string;
  role: string;
  content: string;
  createdAt: string;
}

export interface ChatAgentInfo {
  agent: { agentName: string; dimoAgentId: string; createdAt: string } | null;
  messageCount: number;
}

export interface WhatsAppConfig {
  id: string;
  organizationId: string;
  isConnected: boolean;
  isActive: boolean;
  phoneNumber: string | null;
  businessName: string | null;
  aiMode: 'OFF' | 'SUGGEST_ONLY' | 'AUTO_SIMPLE' | 'FULL';
  aiCanCreateTasks: boolean;
  aiCanCreateSupport: boolean;
  aiCanUseBookings: boolean;
  aiCanContactVendors: boolean;
  aiEscalationEnabled: boolean;
  connectedAt: string | null;
  connectedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppConversation {
  id: string;
  contactPhone: string;
  contactName: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  status: string;
  assignedTo: string | null;
  createdAt: string;
}

export interface WhatsAppMsg {
  id: string;
  direction: string;
  senderType: string;
  senderName: string | null;
  content: string;
  aiGenerated: boolean;
  aiSuggested: boolean;
  status: string;
  createdAt: string;
}

export interface WhatsAppStats {
  totalConversations: number;
  openConversations: number;
  totalMessages: number;
  aiMessages: number;
  unreadTotal: number;
  isConnected: boolean;
  isActive: boolean;
  aiMode: string;
}

// ─── Parts & Accessories Types ───────────────────────────────

export interface PartsProviderSummary {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  integrationType: string;
  supportedCategories: string[];
  healthStatus: string;
  capabilities: PartsProviderCapabilities | null;
}

export interface PartsProviderCapabilities {
  supportsEmbeddedSearch: boolean;
  supportsEmbeddedProductDetails: boolean;
  supportsEmbeddedCart: boolean;
  supportsEmbeddedCheckout: boolean;
  supportsRedirectCheckout: boolean;
  supportsVehicleFitment: boolean;
  supportsTireSearch: boolean;
  supportsPartsSearch: boolean;
  supportsAccessoriesSearch: boolean;
}

export interface PartsDisclosureTemplate {
  id: string;
  providerKey: string | null;
  category: string | null;
  version: number;
  title: string;
  body: string;
  isActive: boolean;
  effectiveFrom: string;
  createdAt: string;
}

export interface PartsDisclosedFieldSet {
  fields: string[];
  descriptions: Record<string, string>;
}

export interface PartsSearchParams {
  vehicleId: string;
  providerKey: string;
  category: 'TIRES' | 'PARTS' | 'ACCESSORIES';
  correlationId: string;
  query?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  filters?: Record<string, string | string[]>;
}

export interface PartsProductResult {
  id: string;
  externalId: string;
  providerKey: string;
  category: string;
  title: string;
  subtitle?: string;
  brand?: string;
  imageUrl?: string;
  priceNet?: number;
  priceGross?: number;
  currency: string;
  availabilityStatus: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
  shippingInfo?: string;
  deliveryDays?: number;
  fitmentStatus: 'exact_fit' | 'likely_fit' | 'universal' | 'unknown';
  fitmentConfidence: number;
  fitmentNotes?: string;
  sellerName?: string;
  marketplaceName?: string;
  productUrl?: string;
  rating?: number;
  reviewCount?: number;
}

export interface PartsSearchResponse {
  results: PartsProductResult[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  searchDurationMs: number;
}

export interface PartsProductDetail extends PartsProductResult {
  description?: string;
  specifications?: Record<string, string>;
  images?: string[];
  checkoutUrl?: string;
  providerTermsNote?: string;
}

export interface PartsVehicleFitment {
  vehicleId: string;
  make: string;
  model: string;
  year: number;
  fuelType?: string;
  bodyType?: string;
  vin?: string;
  tireFrontSpec?: string;
  tireRearSpec?: string;
  driveType?: string;
  curbWeightKg?: number;
}

export interface PartsAuthorizationLogEntry {
  id: string;
  organizationId: string;
  userId: string;
  vehicleId: string;
  providerKey: string;
  providerDisplayName: string;
  category: string;
  noticeVersion: number;
  confirmedAt: string;
  correlationId: string;
  executionStatus: string;
  executionFailureReason: string | null;
  createdAt: string;
}

export interface PartsConnectionTestResult {
  success: boolean;
  latencyMs: number;
  message?: string;
  timestamp: string;
}

export interface PartsHealthOverview {
  totalProviders: number;
  activeProviders: number;
  healthyProviders: number;
  degradedProviders: number;
  downProviders: number;
  totalAuthorizations: number;
  recentErrors24h: number;
  providers: {
    id: string;
    key: string;
    displayName: string;
    isEnabled: boolean;
    healthStatus: string;
    lastTestedAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
  }[];
}

// ═══════════════════════════════════════════════════════════════
// Insurance Module Types
// ═══════════════════════════════════════════════════════════════

export interface InsuranceFleetOverview {
  vehicles: InsuranceFleetVehicle[];
  summary: {
    total: number;
    insured: number;
    expiringSoon: number;
    expired: number;
    missing: number;
    pendingInquiry: number;
  };
}

export interface InsuranceFleetVehicle {
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    vin: string | null;
    licensePlate: string | null;
    fuelType: string | null;
    imageUrl: string | null;
    mileageKm: number | null;
  };
  insurance: {
    id: string;
    insurerName: string | null;
    policyNumber: string | null;
    insuranceType: string | null;
    validFrom: string | null;
    validUntil: string | null;
    status: string;
    linkedDocumentIds: string[];
  } | null;
  status: string;
  hasPendingInquiry: boolean;
}

export interface InsuranceVehicleDetail {
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    vin: string | null;
    licensePlate: string | null;
    fuelType: string | null;
    imageUrl: string | null;
    mileageKm: number | null;
  };
  records: {
    id: string;
    insurerName: string | null;
    policyNumber: string | null;
    insuranceType: string | null;
    validFrom: string | null;
    validUntil: string | null;
    status: string;
  }[];
  inquiries: InsuranceInquiryRow[];
  liveSharingPermissions: InsuranceLiveSharingEntry[];
}

export interface InsurancePartnerSummary {
  id: string;
  key: string;
  displayName: string;
  description: string | null;
  supportedInquiryTypes: string[];
  supportedInsuranceModels: string[];
  acceptedHistoricalData: string[];
  acceptedLiveData: string[];
  communicationChannel: string;
  healthStatus: string;
  slaInfo: string | null;
  supportsDynamicInsurance: boolean;
  supportsUsageBased: boolean;
  supportsKilometerBased: boolean;
  supportsDrivingScoreBased: boolean;
  primaryContact: string | null;
}

export interface InsuranceInquirySubmission {
  vehicleId: string;
  inquiryType: string;
  selectedInsurerIds: string[];
  selectedHistoricalData: Record<string, unknown>;
  selectedLiveData: Record<string, unknown>;
  selectedTimeRange: { from: string; to: string; label?: string };
  selectedInsuranceModels: string[];
}

export interface InsuranceInquiryResult {
  inquiryId: string;
  correlationId: string;
  recipients: {
    insurerId: string;
    insurerName: string;
    success: boolean;
    message?: string;
  }[];
}

export interface InsuranceInquiryRow {
  id: string;
  organizationId: string;
  userId: string;
  vehicleId: string;
  inquiryType: string;
  selectedInsuranceModels: string[];
  status: string;
  correlationId: string;
  createdAt: string;
  recipients: {
    id: string;
    insurerId: string;
    channelType: string;
    deliveryStatus: string;
    sentAt: string | null;
    responseStatus: string;
    failureReason: string | null;
    insurer: { displayName: string; key: string };
  }[];
}

export interface InsuranceLiveSharingEntry {
  id: string;
  organizationId: string;
  vehicleId: string;
  insurerId: string;
  enabledDataCategories: Record<string, unknown>;
  reportingFrequency: string | null;
  status: string;
  validFrom: string;
  validUntil: string | null;
  revokedAt: string | null;
  createdAt: string;
  insurer: { displayName: string; key: string };
}

export interface InsuranceMissingDocVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string | null;
}

export interface InsuranceDisclosureTemplate {
  id: string;
  insurerKey: string | null;
  inquiryType: string | null;
  version: number;
  title: string;
  body: string;
  isActive: boolean;
  effectiveFrom: string;
  createdAt: string;
}

export interface InsurancePartnerContactEntry {
  id: string;
  insurancePartnerId: string;
  fullName: string;
  roleTitle: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export interface InsuranceInquiryTemplateEntry {
  id: string;
  insurerKey: string | null;
  inquiryType: string | null;
  version: number;
  subjectTemplate: string;
  bodyTemplate: string;
  isActive: boolean;
  effectiveFrom: string;
}

export interface InsuranceConnectionTestResult {
  success: boolean;
  latencyMs: number;
  message?: string;
  timestamp: string;
}

export interface InsuranceAuthorizationLogEntry {
  id: string;
  organizationId: string;
  userId: string;
  vehicleId: string;
  insurerId: string;
  inquiryId: string | null;
  disclosedHistoricalData: Record<string, unknown>;
  authorizedLiveData: Record<string, unknown>;
  purpose: string;
  noticeVersion: number;
  confirmedAt: string;
  correlationId: string;
  transmissionChannel: string | null;
  transmissionResult: string | null;
  createdAt: string;
  insurer: { displayName: string; key: string };
}

export interface InsuranceHealthOverview {
  totalPartners: number;
  activePartners: number;
  healthyPartners: number;
  degradedPartners: number;
  downPartners: number;
  totalInquiries: number;
  recentFailures24h: number;
  activeLiveSharingPermissions: number;
  partners: {
    id: string;
    key: string;
    displayName: string;
    isEnabled: boolean;
    healthStatus: string;
    communicationChannel: string;
    lastTestedAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
    supportsDynamicInsurance: boolean;
  }[];
}

// ─── Voice Assistant ─────────────────────────────────

export interface VoiceAssistantData {
  id: string;
  organizationId: string;
  name: string;
  role: string | null;
  personality: string | null;
  language: string;
  voiceId: string | null;
  voiceName: string | null;
  greetingMessage: string | null;
  systemPrompt: string | null;
  companyContext: string | null;
  businessRules: string | null;
  forbiddenActions: string | null;
  knowledgeSnippets: string | null;
  elevenLabsAgentId: string | null;
  phoneNumberId: string | null;
  phoneNumber: string | null;
  telephonyEnabled: boolean;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  permAnswerQuestions: boolean;
  permManageBookings: boolean;
  permWorkshopHandling: boolean;
  permBreakdownSupport: boolean;
  permContactCustomers: boolean;
  permContactVendors: boolean;
  permCreateActions: boolean;
  escalationPhone: string | null;
  escalationUserId: string | null;
  escalationDepartment: string | null;
  escalateOnLowConf: boolean;
  escalateOnSensitive: boolean;
  escalateOnRequest: boolean;
  fallbackMessage: string | null;
  businessHoursStart: string | null;
  businessHoursEnd: string | null;
  businessHoursTimezone: string | null;
  afterHoursMessage: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE';
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  escalatedCalls: number;
  totalTalkMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceAssistantReadiness {
  ready: boolean;
  checks: { key: string; label: string; ok: boolean }[];
}

export interface VoiceOption {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

export interface VoiceConversationEntry {
  id: string;
  organizationId: string;
  voiceAssistantId: string;
  elevenLabsConvId: string | null;
  callerNumber: string | null;
  direction: string;
  durationSeconds: number | null;
  outcome: 'RESOLVED' | 'ESCALATED' | 'FAILED' | 'ABANDONED';
  transcript: string | null;
  summary: string | null;
  escalationReason: string | null;
  actionsPerformed: string[];
  errorMessage: string | null;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
}

export interface VoiceAssistantAdminOverview {
  assistants: {
    organizationId: string;
    organizationName: string;
    name: string;
    status: string;
    voiceName: string | null;
    language: string;
    telephonyEnabled: boolean;
    phoneNumber: string | null;
    totalCalls: number;
    answeredCalls: number;
    totalTalkMinutes: number;
    elevenLabsAgentId: string | null;
    updatedAt: string;
  }[];
  summary: {
    totalOrgs: number;
    totalCalls: number;
    totalMinutes: number;
  };
}

export interface VoiceAssistantAdminOrgDetail {
  exists: boolean;
  assistant?: VoiceAssistantData;
  readiness?: VoiceAssistantReadiness;
  recentConversations?: VoiceConversationEntry[];
}

// ── High Mobility types ──────────────────────────────────────────────────────

export type HmPackageType = 'HEALTH' | 'FULL_TELEMETRY';
export type HmSourceMode  = 'DIMO_PLUS_HM' | 'HM_ONLY';
export type HmEligibilityStatus = 'UNKNOWN' | 'PENDING' | 'ELIGIBLE' | 'INELIGIBLE' | 'ERROR';
export type HmDeliveryMode = 'PULL' | 'PUSH' | 'BOTH';
export type HmClearanceStatus =
  | 'DRAFT' | 'CLEARANCE_PENDING' | 'APPROVED' | 'REJECTED'
  | 'ERROR' | 'REVOKING' | 'REVOKED' | 'CANCELED';

// Phase 2 types
export type HmRegistrationState = 'NOT_REGISTERED' | 'REGISTRATION_PENDING' | 'REGISTERED' | 'REGISTRATION_FAILED';
export type HmStreamingState = 'NOT_CONFIGURED' | 'CONFIGURED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
export type HmIngestStatus = 'RECEIVED' | 'PARSED' | 'STORED' | 'FAILED' | 'DEDUPLICATED';
export type HmMqttConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR' | 'DISABLED';

export interface HmVehicleDto {
  id: string;
  organizationId: string | null;
  synqdriveVehicleId: string | null;
  vin: string;
  brand: string;
  packageType: HmPackageType;
  sourceMode: HmSourceMode;
  eligibilityStatus: HmEligibilityStatus;
  eligibilityDeliveryMode: HmDeliveryMode | null;
  eligibilityCheckedAt: string | null;
  clearanceStatus: HmClearanceStatus;
  clearanceRequestedAt: string | null;
  clearanceApprovedAt: string | null;
  clearanceLastCheckedAt: string | null;
  hmVehicleReference: string | null;
  isLinked: boolean;
  linkedAt: string | null;
  isActive: boolean;
  // Phase 2
  registrationState: HmRegistrationState;
  registeredAt: string | null;
  streamingState: HmStreamingState;
  providerMode: string | null;
  createdAt: string;
  updatedAt: string;
}

// Phase 2: Streaming readiness
export interface HmStreamingReadinessDto {
  hmVehicleId: string;
  vin: string;
  packageType: HmPackageType;
  sourceMode: HmSourceMode;
  clearanceStatus: HmClearanceStatus;
  streamingState: HmStreamingState;
  mqttEnabled: boolean;
  mqttConfigured: boolean;
  ready: boolean;
  checks: { key: string; label: string; ok: boolean; note?: string }[];
}

// Phase 2: MQTT consumer status
export interface HmMqttConsumerStatusDto {
  environment: string;
  applicationId: string;
  consumerGroup: string;
  connectionState: HmMqttConnectionState;
  lastConnectedAt: string | null;
  lastMessageAt: string | null;
  lastErrorAt: string | null;
  lastErrorMessage: string | null;
  mqttEnabled: boolean;
  certConfigured: boolean;
  updatedAt: string;
}

// Phase 2: Stream sync log
export interface HmStreamSyncLogDto {
  id: string;
  highMobilityVehicleId: string | null;
  vin: string | null;
  messageId: string;
  topic: string;
  messageTimestamp: string | null;
  ingestStatus: HmIngestStatus;
  isDuplicate: boolean;
  normalizedSummaryJson: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface HmVehicleListDto {
  health: HmVehicleDto[];
  fullTelemetry: HmVehicleDto[];
  total: number;
}

export interface HmEligibilityResultDto {
  vin: string;
  brand: string;
  eligibilityStatus: HmEligibilityStatus;
  deliveryMode: HmDeliveryMode | null;
  capabilities: Record<string, unknown> | null;
  checkedAt: string;
  rawResponse: Record<string, unknown> | null;
}

export interface HmAvailabilityDto {
  vin: string;
  available: boolean;
  packageType: HmPackageType | null;
  clearanceStatus: HmClearanceStatus | null;
  hmVehicleId: string | null;
  isLinked: boolean;
  linkedVehicleId: string | null;
}

export interface HmStatusHistoryDto {
  id: string;
  highMobilityVehicleId: string;
  eventType: string;
  oldStatus: string | null;
  newStatus: string | null;
  payloadJson: Record<string, unknown> | null;
  createdAt: string;
}
