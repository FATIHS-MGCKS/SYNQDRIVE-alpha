import type { WorkflowAiCommunicationPurpose } from './workflow-ai-communication.types';

export const WORKFLOW_AI_COMMUNICATION_DEFAULTS = {
  temperature: 0.2,
  maxTokens: 512,
  maxMessageChars: 1200,
  maxUntrustedCustomerChars: 400,
} as const;

export function isWorkflowAiCommunicationEnabled(): boolean {
  return process.env.WORKFLOW_AI_COMMUNICATION_ENABLED === 'true';
}

export const WORKFLOW_AI_EVENT_PURPOSE_ALLOWLIST: Record<string, WorkflowAiCommunicationPurpose[]> = {
  'vehicle.health.critical': ['health_notice', 'admin_alert', 'transactional'],
  'vehicle.health.warning': ['health_notice', 'transactional', 'support'],
  'vehicle.dtc.critical': ['health_notice', 'admin_alert'],
  'invoice.overdue': ['collections', 'transactional'],
  'booking.returned': ['transactional', 'operational', 'support'],
  'booking.completed': ['transactional', 'operational'],
  'customer.complaint.created': ['support', 'operational'],
  'manual.test': ['operational', 'support', 'transactional'],
};

export const WORKFLOW_AI_EVENT_PAYLOAD_ALLOWLIST: Record<string, string[]> = {
  'vehicle.health.critical': [
    'vehicleId',
    'healthState',
    'moduleAlerts',
    'alertTitle',
    'alertMessage',
    'dtcCodes',
    'bookingId',
    'customerId',
  ],
  'vehicle.health.warning': ['vehicleId', 'healthState', 'moduleAlerts', 'alertMessage', 'bookingId'],
  'vehicle.dtc.critical': ['vehicleId', 'dtcCodes', 'alertMessage', 'bookingId'],
  'invoice.overdue': ['invoiceId', 'amountDue', 'currency', 'dueDate', 'daysOverdue', 'bookingId', 'customerId'],
  'booking.returned': ['bookingId', 'vehicleId', 'customerId', 'returnedAt'],
  'customer.complaint.created': ['complaintId', 'summary', 'bookingId', 'customerId', 'vehicleId'],
};
