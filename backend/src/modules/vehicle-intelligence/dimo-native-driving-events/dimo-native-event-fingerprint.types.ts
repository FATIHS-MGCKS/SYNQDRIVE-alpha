/** Inputs for deterministic native DIMO event identity (P24). */
export type DimoNativeEventFingerprintInput = {
  organizationId: string;
  vehicleId: string;
  provider: string;
  providerEventName: string;
  observedAt: Date;
  durationNs: number;
  providerSourceId: string;
  counterValue: number | null;
};

/** Normalized provider metadata included in the fingerprint. */
export type DimoNativeEventCoreMetadata = {
  counterValue: number | null;
};

export type NativeEventTripWindow = {
  id: string;
  startTime: Date;
  endTime: Date;
};

export type NativeEventTripAssignmentResult = {
  tripId: string | null;
  tripAssignment: 'ASSIGNED' | 'UNASSIGNED';
  withinTripBoundary: boolean;
};
