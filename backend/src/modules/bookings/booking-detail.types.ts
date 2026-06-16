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
    rentalBlocked: boolean;
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
    legalTermsAttached: boolean;
    legalWithdrawalAttached: boolean;
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
    rentalBlocked: boolean;
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
  activity: ActivityItem[];
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
