import {
  EXTERNAL_ACCESS_DATA_CATEGORY,
  EXTERNAL_ACCESS_PATH,
  EXTERNAL_ACCESS_PURPOSE,
  EXTERNAL_ACCESS_SERVICE_IDENTITY,
} from './external-access-enforcement.constants';
import type { ExternalAccessMinimizationSpec } from './external-access-enforcement.types';

export interface ExternalAccessChannelSpec {
  dataCategories: string[];
  purpose: string;
  processingPath: string;
  serviceIdentity: string;
  minimization?: ExternalAccessMinimizationSpec;
}

export const EXTERNAL_ACCESS_CHANNEL_REGISTRY: Record<string, ExternalAccessChannelSpec> = {
  fleet_chat: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.TELEMETRY_DATA, EXTERNAL_ACCESS_DATA_CATEGORY.HEALTH_SIGNALS],
    purpose: EXTERNAL_ACCESS_PURPOSE.FLEET_ANALYTICS,
    processingPath: EXTERNAL_ACCESS_PATH.FLEET_CHAT_AI,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.FLEET_CHAT_AI,
    minimization: {
      allowedFields: ['plate', 'make', 'model', 'status', 'mileage', 'healthSummary'],
    },
  },
  document_ai_extraction: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.CUSTOMER_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.DOCUMENT_PROCESSING,
    processingPath: EXTERNAL_ACCESS_PATH.DOCUMENT_AI_EXTRACTION,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.DOCUMENT_AI,
    minimization: {
      deniedFields: ['iban', 'taxId', 'idNumber', 'licenseNumber', 'ssn'],
    },
  },
  vehicle_spec_ai: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.HEALTH_SIGNALS],
    purpose: EXTERNAL_ACCESS_PURPOSE.VEHICLE_HEALTH,
    processingPath: EXTERNAL_ACCESS_PATH.VEHICLE_SPEC_AI,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.VEHICLE_SPEC_AI,
  },
  generated_document_download: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.CUSTOMER_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.DOCUMENT_PROCESSING,
    processingPath: EXTERNAL_ACCESS_PATH.FILE_DOWNLOAD,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.FILE_EXPORT_API,
  },
  legal_document_download: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.OPERATIONAL_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.DOCUMENT_PROCESSING,
    processingPath: EXTERNAL_ACCESS_PATH.LEGAL_DOC_DOWNLOAD,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.LEGAL_DOC_EXPORT_API,
  },
  vehicle_file_summary: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.HEALTH_SIGNALS, EXTERNAL_ACCESS_DATA_CATEGORY.DTC_CODES],
    purpose: EXTERNAL_ACCESS_PURPOSE.VEHICLE_HEALTH,
    processingPath: EXTERNAL_ACCESS_PATH.FILE_DOWNLOAD,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.FILE_EXPORT_API,
  },
  reporting_export: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.TELEMETRY_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.FLEET_ANALYTICS,
    processingPath: EXTERNAL_ACCESS_PATH.REPORTING_EXPORT,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.REPORTING_API,
  },
  bulk_export: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.TELEMETRY_DATA, EXTERNAL_ACCESS_DATA_CATEGORY.TRIP_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.FLEET_ANALYTICS,
    processingPath: EXTERNAL_ACCESS_PATH.BULK_EXPORT,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.BULK_EXPORT_API,
  },
  webhook_egress: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.OPERATIONAL_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.TECHNICAL_OVERVIEW,
    processingPath: EXTERNAL_ACCESS_PATH.WEBHOOK_EGRESS,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.WEBHOOK_EGRESS,
  },
};

/** Voice MCP tool → authorization spec. Agent cannot choose scope — server maps tool to categories. */
export const VOICE_MCP_TOOL_AUTH_REGISTRY: Record<string, ExternalAccessChannelSpec> = {
  identify_customer: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.CUSTOMER_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.PARTNER_SERVICE,
    processingPath: EXTERNAL_ACCESS_PATH.VOICE_MCP_TOOL,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.VOICE_MCP_GATEWAY,
    minimization: { allowedFields: ['reference', 'matchCount', 'confidence'] },
  },
  get_customer_summary: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.CUSTOMER_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.PARTNER_SERVICE,
    processingPath: EXTERNAL_ACCESS_PATH.VOICE_MCP_TOOL,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.VOICE_MCP_GATEWAY,
    minimization: {
      allowedFields: ['reference', 'firstName', 'lastName', 'bookingCount', 'status'],
      deniedFields: ['email', 'phone', 'address', 'idNumber', 'licenseNumber'],
    },
  },
  find_booking: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.CUSTOMER_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.RENTAL_ANALYTICS,
    processingPath: EXTERNAL_ACCESS_PATH.VOICE_MCP_TOOL,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.VOICE_MCP_GATEWAY,
    minimization: { allowedFields: ['bookingRef', 'status', 'pickupDate', 'returnDate'] },
  },
  get_booking_status: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.CUSTOMER_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.RENTAL_ANALYTICS,
    processingPath: EXTERNAL_ACCESS_PATH.VOICE_MCP_TOOL,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.VOICE_MCP_GATEWAY,
    minimization: { allowedFields: ['bookingRef', 'status', 'vehicleLabel'] },
  },
  get_vehicle_status: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.GPS_LOCATION, EXTERNAL_ACCESS_DATA_CATEGORY.TELEMETRY_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.FLEET_ANALYTICS,
    processingPath: EXTERNAL_ACCESS_PATH.VOICE_MCP_TOOL,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.VOICE_MCP_GATEWAY,
    minimization: {
      allowedFields: ['plate', 'label', 'status', 'fuelLevel', 'batteryLevel'],
      deniedFields: ['latitude', 'longitude', 'lastPosition', 'vin'],
    },
  },
  get_invoice_status: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.CUSTOMER_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.PARTNER_SERVICE,
    processingPath: EXTERNAL_ACCESS_PATH.VOICE_MCP_TOOL,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.VOICE_MCP_GATEWAY,
    minimization: { allowedFields: ['invoiceRef', 'status', 'dueDate'] },
  },
  get_branch_information: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.OPERATIONAL_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.TECHNICAL_OVERVIEW,
    processingPath: EXTERNAL_ACCESS_PATH.VOICE_MCP_TOOL,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.VOICE_MCP_GATEWAY,
  },
  get_business_hours: {
    dataCategories: [EXTERNAL_ACCESS_DATA_CATEGORY.OPERATIONAL_DATA],
    purpose: EXTERNAL_ACCESS_PURPOSE.TECHNICAL_OVERVIEW,
    processingPath: EXTERNAL_ACCESS_PATH.VOICE_MCP_TOOL,
    serviceIdentity: EXTERNAL_ACCESS_SERVICE_IDENTITY.VOICE_MCP_GATEWAY,
  },
};

export function resolveChannelSpec(channelKey: string): ExternalAccessChannelSpec | null {
  return EXTERNAL_ACCESS_CHANNEL_REGISTRY[channelKey] ?? null;
}

export function resolveMcpToolSpec(toolName: string): ExternalAccessChannelSpec | null {
  return VOICE_MCP_TOOL_AUTH_REGISTRY[toolName] ?? null;
}
