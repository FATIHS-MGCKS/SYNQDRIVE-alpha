import type { VoiceToolCapabilityKey } from '@modules/voice-assistant/voice-assistant-permissions';
import type { VoiceMcpToolName } from './voice-mcp-gateway.constants';
import { VOICE_MCP_READ_ONLY_TOOLS, VOICE_MCP_WRITE_TOOLS } from './voice-mcp-gateway.constants';

export type VoiceMcpToolDefinition = {
  name: VoiceMcpToolName;
  description: string;
  capabilityKey: VoiceToolCapabilityKey;
  inputSchema: Record<string, unknown>;
};

export const VOICE_MCP_TOOL_REGISTRY: VoiceMcpToolDefinition[] = [
  {
    name: 'identify_customer',
    capabilityKey: 'customerLookup',
    description: 'Identify a customer by phone, email, or name within the current organization.',
    inputSchema: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Caller phone number in E.164 or local format.' },
        email: { type: 'string', description: 'Customer email address.' },
        name: { type: 'string', description: 'Customer full or partial name.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_customer_summary',
    capabilityKey: 'customerLookup',
    description: 'Return a privacy-minimized customer summary by customer reference or search terms.',
    inputSchema: {
      type: 'object',
      properties: {
        customerRef: { type: 'string', description: 'Short customer reference from identify_customer.' },
        phone: { type: 'string' },
        email: { type: 'string' },
        name: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'find_booking',
    capabilityKey: 'bookingSearch',
    description: 'Find bookings by customer, license plate, booking reference, or free-text search.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Booking reference, customer name, phone, or license plate.' },
        customerRef: { type: 'string' },
        licensePlate: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_booking_status',
    capabilityKey: 'bookingSearch',
    description: 'Return booking status and key rental dates for a booking reference.',
    inputSchema: {
      type: 'object',
      properties: {
        bookingRef: { type: 'string', description: 'Short booking reference from find_booking.' },
        search: { type: 'string', description: 'Optional search fallback when bookingRef is unknown.' },
      },
      required: ['bookingRef'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_vehicle_status',
    capabilityKey: 'bookingSearch',
    description: 'Return operational vehicle status by license plate or vehicle label.',
    inputSchema: {
      type: 'object',
      properties: {
        licensePlate: { type: 'string' },
        search: { type: 'string', description: 'Vehicle name, make, model, or license plate.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_invoice_status',
    capabilityKey: 'customerLookup',
    description: 'Return invoice payment status by invoice number or customer-linked search.',
    inputSchema: {
      type: 'object',
      properties: {
        invoiceNumber: { type: 'string' },
        search: { type: 'string' },
        customerRef: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_branch_information',
    capabilityKey: 'answerGeneralQuestions',
    description: 'Return branch or station contact and service information.',
    inputSchema: {
      type: 'object',
      properties: {
        stationName: { type: 'string' },
        city: { type: 'string' },
        branchCode: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_business_hours',
    capabilityKey: 'answerGeneralQuestions',
    description: 'Return business hours for a branch/station or the voice assistant default schedule.',
    inputSchema: {
      type: 'object',
      properties: {
        stationName: { type: 'string' },
        city: { type: 'string' },
        branchCode: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_callback_request',
    capabilityKey: 'createTask',
    description: 'Record a callback request for staff follow-up after customer confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        preferredPhone: { type: 'string' },
        preferredWindow: { type: 'string' },
        notes: { type: 'string' },
        customerRef: { type: 'string' },
        confirmationToken: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_support_case',
    capabilityKey: 'createTask',
    description: 'Open an internal support case after customer confirmation and staff approval.',
    inputSchema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        description: { type: 'string' },
        reporterEmail: { type: 'string' },
        reporterName: { type: 'string' },
        bookingRef: { type: 'string' },
        customerRef: { type: 'string' },
        confirmationToken: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_task',
    capabilityKey: 'createTask',
    description: 'Create an internal follow-up task after customer confirmation and staff approval.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string' },
        bookingRef: { type: 'string' },
        customerRef: { type: 'string' },
        confirmationToken: { type: 'string' },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_customer_note',
    capabilityKey: 'modifyRecords',
    description: 'Add a sanitized customer timeline note after customer confirmation and staff approval.',
    inputSchema: {
      type: 'object',
      properties: {
        customerRef: { type: 'string' },
        title: { type: 'string' },
        note: { type: 'string' },
        confirmationToken: { type: 'string' },
      },
      required: ['customerRef', 'note'],
      additionalProperties: false,
    },
  },
  {
    name: 'request_booking_change',
    capabilityKey: 'modifyBooking',
    description: 'Record a booking change request for staff review — never mutates the booking directly.',
    inputSchema: {
      type: 'object',
      properties: {
        bookingRef: { type: 'string' },
        search: { type: 'string' },
        changeDetails: { type: 'string' },
        requestedChanges: { type: 'string' },
        confirmationToken: { type: 'string' },
      },
      required: ['changeDetails'],
      additionalProperties: false,
    },
  },
  {
    name: 'request_document_resend',
    capabilityKey: 'contactCustomer',
    description: 'Resend booking documents to the customer email after customer confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        bookingRef: { type: 'string' },
        search: { type: 'string' },
        toEmail: { type: 'string' },
        subject: { type: 'string' },
        confirmationToken: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
];

export const VOICE_MCP_READ_TOOL_REGISTRY = VOICE_MCP_TOOL_REGISTRY.filter((tool) =>
  (VOICE_MCP_READ_ONLY_TOOLS as readonly string[]).includes(tool.name),
);

export const VOICE_MCP_WRITE_TOOL_REGISTRY = VOICE_MCP_TOOL_REGISTRY.filter((tool) =>
  (VOICE_MCP_WRITE_TOOLS as readonly string[]).includes(tool.name),
);

const TOOL_BY_NAME = new Map(VOICE_MCP_TOOL_REGISTRY.map((tool) => [tool.name, tool]));

export function getVoiceMcpToolDefinition(name: string): VoiceMcpToolDefinition | null {
  return TOOL_BY_NAME.get(name as VoiceMcpToolName) ?? null;
}
