export type FakePaidConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface FakePaidCardAuditCandidate {
  organizationId: string;
  bookingId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  paymentId: string;
  amountCents: number;
  currency: string;
  paymentMethod: string;
  createdAt: string;
  reasons: string[];
  confidence: FakePaidConfidence;
}

export interface FakePaidCardAuditReport {
  mode: 'audit';
  readonly: true;
  generatedAt: string;
  organizationId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  summary: {
    paymentsScanned: number;
    candidatesTotal: number;
    high: number;
    medium: number;
    low: number;
  };
  candidates: FakePaidCardAuditCandidate[];
  humanSummary: string;
}

export interface FakePaidCardAuditOptions {
  organizationId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

/** Input for pure evaluation — kept free of Prisma types for unit tests. */
export interface FakePaidPaymentEvaluationInput {
  paymentId: string;
  organizationId: string;
  invoiceId: string;
  bookingId: string;
  invoiceNumber: string | null;
  amountCents: number;
  currency: string;
  paymentMethod: string;
  paymentReference: string | null;
  paymentNote: string | null;
  paymentCreatedAt: Date;
  bookingUpdatedAt: Date | null;
  hasManualPaymentActivityLog: boolean;
}

export interface FakePaidPaymentEvaluationResult {
  isCandidate: boolean;
  confidence: FakePaidConfidence | null;
  reasons: string[];
}
