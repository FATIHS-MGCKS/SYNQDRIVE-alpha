export interface InsurerInquiryPayload {
  inquiryId: string;
  correlationId: string;
  organizationName?: string;
  vehicleSummary: {
    make: string;
    model: string;
    year: number;
    vin?: string;
    licensePlate?: string;
    fuelType?: string;
    mileageKm?: number;
  };
  inquiryType: string;
  selectedInsuranceModels: string[];
  historicalDataSummary: Record<string, unknown>;
  liveDataScope: Record<string, unknown>;
  timeRange: { from: string; to: string; label?: string };
  subject: string;
  body: string;
  senderEmail?: string;
  senderName?: string;
}

export interface InsurerDeliveryResult {
  success: boolean;
  channel: string;
  externalReference?: string;
  message?: string;
  sentAt: Date;
}

export interface InsurerConnectionTestResult {
  success: boolean;
  latencyMs: number;
  message?: string;
  timestamp: Date;
}

export interface InsurerChannelAdapter {
  readonly channelType: string;
  sendInquiry(payload: InsurerInquiryPayload, config: Record<string, unknown>): Promise<InsurerDeliveryResult>;
  testConnection(config: Record<string, unknown>): Promise<InsurerConnectionTestResult>;
}
