export type BookingDetailDocumentSlot = {
  documentType: string;
  status: 'missing' | 'required' | 'generated' | 'signed' | 'void';
  required: boolean;
  available: boolean;
  generatedAt: string | null;
  signedAt: string | null;
  documentId: string | null;
  missingReason: string | null;
};

export type BookingStationContext = {
  stationId: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  openingHours: unknown;
  handoverInstructions: string | null;
  returnInstructions: string | null;
  status: string;
  pickupEnabled: boolean;
  returnEnabled: boolean;
  latitude: number | null;
  longitude: number | null;
};

export type BookingDetailDto = {
  core: {
    bookingId: string;
    bookingNumber: string;
    organizationId: string;
    status: string;
    statusEnum: string;
    startDate: string;
    endDate: string;
    pickupStationId: string | null;
    returnStationId: string | null;
    pickupStationName: string | null;
    returnStationName: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    cancelledAt: string | null;
    completedAt: string | null;
    kmIncluded: number | null;
    kmDriven: number | null;
    insuranceOptions: string[];
    extras: unknown[];
    currency: string;
    isOneWayRental: boolean;
    pickupAddressOverride: string | null;
    returnAddressOverride: string | null;
  };
  stations: {
    pickup: BookingStationContext | null;
    return: BookingStationContext | null;
    actualPickup: BookingStationContext | null;
    actualReturn: BookingStationContext | null;
    isOneWayRental: boolean;
    hasPickupDeviation: boolean;
    hasReturnDeviation: boolean;
  };
  customer: {
    customerId: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    customerStatus: string | null;
    identityStatus: string | null;
    licenseStatus: string | null;
    riskLevel: string | null;
    openInvoiceCount: number;
    openFineCount: number;
    noShowCount: number;
  };
  vehicle: {
    vehicleId: string;
    displayName: string;
    licensePlate: string;
    vin: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
    vehicleStatus: string | null;
    rentalBlocked: boolean | null;
    blockingReasons: string[];
    odometerKm: number | null;
    fuelPercent: number | null;
    evSoc: number | null;
  };
  finance: {
    basePriceCents: number | null;
    extrasPriceCents: number | null;
    discountAmountCents: number | null;
    depositAmountCents: number | null;
    depositStatus: string | null;
    taxRate: number | null;
    taxAmountCents: number | null;
    grossAmountCents: number | null;
    paidAmountCents: number | null;
    openAmountCents: number | null;
    paymentStatus: string | null;
    invoiceStatus: string | null;
    finalInvoiceStatus: string | null;
    additionalChargesCents: number | null;
    refundAmountCents: number | null;
    retainedDepositAmountCents: number | null;
    computed: boolean;
  };
  documents: {
    bundleStatus: string | null;
    completenessStatus: string | null;
    legalTermsAttached: boolean;
    legalWithdrawalAttached: boolean;
    legalPrivacyAttached: boolean;
    legalMissing: string[];
    warnings: string[];
    slots: BookingDetailDocumentSlot[];
  };
  handover: {
    pickup: HandoverSideSummary | null;
    return: HandoverSideSummary | null;
  };
  tasks: {
    openCount: number;
    overdueCount: number;
    completedCount: number;
    nextDueAt: string | null;
    items: TaskSummaryItem[];
  };
  health: {
    rentalBlocked: boolean | null;
    blockingReasons: string[];
    overallState: string | null;
    criticalWarnings: string[];
    warningWarnings: string[];
  };
  usage: {
    drivingStressScore: number | null;
    stressLevel: 'low' | 'moderate' | 'high' | 'critical' | null;
    drivingEventsCount: number | null;
    abuseDetectionCount: number | null;
    misuseCaseCount: number;
    hasAnalysis: boolean;
  };
  eligibility: {
    canCreatePendingBooking: boolean;
    canConfirmBooking: boolean;
    canStartRental: boolean;
    blockingReasons: string[];
    warnings: string[];
    requiredActions: string[];
  } | null;
  rentalEligibility: {
    status: string;
    allowed: boolean;
    stage: string;
    blockingReasons: string[];
    warnings: string[];
    missingFields: string[];
    engineVersion: string;
    evaluatedAt: string;
    rentalRulesStatus: string | null;
  } | null;
  activity: ActivityItem[];
  payments: BookingPaymentCardSection | null;
  preparation: BookingPreparationSnapshotSection | null;
};

export type BookingPreparationArtifactSection = {
  artifactType: string;
  label: string;
  status: string;
  required: boolean;
  blocksPickup: boolean;
  blocksReturn: boolean;
  lastError: string | null;
  recoverable: boolean;
  recoveryAction: string | null;
};

export type BookingPreparationSnapshotSection = {
  overallStatus: string;
  isOperationallyReady: boolean;
  missingRequiredCount: number;
  failedCount: number;
  processingCount: number;
  blocksPickup: boolean;
  blocksReturn: boolean;
  pickupBlockReasons: string[];
  artifacts: BookingPreparationArtifactSection[];
  updatedAt: string;
};

export type BookingPaymentCardSection = {
  enabled: boolean;
  summary: {
    bookingPaymentStatus: string;
    paymentIntent: string | null;
  };
  primaryRequest: BookingPaymentCardRequestItem | null;
  requests: BookingPaymentCardRequestItem[];
  invoice: {
    id: string;
    invoiceNumber: string | null;
    status: string;
    totalCents: number;
    paidCents: number;
    outstandingCents: number;
  } | null;
};

export type BookingPaymentCardRequestItem = {
  id: string;
  status: string;
  purpose: string;
  amountCents: number;
  paidAmountCents: number;
  openAmountCents: number;
  refundedAmountCents: number;
  currency: string;
  depositAmountCents: number;
  recipientEmail: string | null;
  checkoutUrl: string | null;
  checkoutExpiresAt: string | null;
  lastSentAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  sendAttemptCount: number;
  lastEmailErrorMessage: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  paymentMethodLabel: string | null;
  refundStatus: 'NONE' | 'PARTIAL' | 'FULL';
  disputeStatus: 'NONE' | 'OPEN';
};

export type HandoverSideSummary = {
  protocolId: string;
  status: 'completed';
  completedAt: string;
  odometerKm: number;
  fuelPercent: number;
  fuelFull: boolean;
  damageCount: number;
  signatureComplete: boolean;
  performedByName: string | null;
};

export type TaskSummaryItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
  overdue: boolean;
};

export type ActivityItem = {
  id: string;
  action: string;
  description: string;
  createdAt: string;
};
