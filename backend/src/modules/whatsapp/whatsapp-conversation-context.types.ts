export type WhatsAppQuickActionId =
  | 'link_booking'
  | 'link_customer'
  | 'link_vehicle'
  | 'human_review'
  | 'assign_user'
  | 'create_task'
  | 'request_missing_documents'
  | 'send_pickup_instructions'
  | 'send_return_instructions'
  | 'send_handover_link'
  | 'send_return_link'
  | 'send_payment_deposit_reminder'
  | 'create_damage_followup_task'
  | 'close_conversation'
  | 'reopen_conversation';

export interface WhatsAppQuickActionDef {
  id: WhatsAppQuickActionId;
  label: string;
  enabled: boolean;
  reason?: string;
  requiresConfirm?: boolean;
}

export interface WhatsAppConversationContextDto {
  conversation: {
    id: string;
    status: string;
    contactPhone: string;
    contactName: string | null;
    customerId: string | null;
    bookingId: string | null;
    vehicleId: string | null;
    assignedTo: string | null;
    lastDetectedIntent: string | null;
    unreadCount: number;
  };
  customer: {
    id: string;
    displayName: string;
    phone: string | null;
    email: string | null;
    status: string | null;
  } | null;
  booking: {
    id: string;
    bookingNumber: string;
    status: string;
    startDate: string;
    endDate: string;
    pickupStationName: string | null;
    returnStationName: string | null;
  } | null;
  vehicle: {
    id: string;
    displayName: string;
    licensePlate: string | null;
    status: string | null;
  } | null;
  station: {
    id: string;
    name: string;
    address: string | null;
    handoverInstructions: string | null;
    returnInstructions: string | null;
  } | null;
  documents: {
    bundleStatus: string | null;
    missingCount: number;
    missingLabels: string[];
    warnings: string[];
  } | null;
  payment: {
    depositStatus: string | null;
    paymentStatus: string | null;
    depositAmountCents: number | null;
    openAmountCents: number | null;
    openInvoiceCount: number;
  } | null;
  damages: {
    openCount: number;
  } | null;
  tasks: {
    openCount: number;
    overdueCount: number;
    items: { id: string; title: string; status: string; priority: string; dueAt: string | null }[];
  } | null;
  handover: {
    pickupCompleted: boolean;
    pickupCompletedAt: string | null;
    returnCompleted: boolean;
    returnCompletedAt: string | null;
    operatorBookingUrl: string | null;
  } | null;
  whatsapp: {
    isConnected: boolean;
    isActive: boolean;
    providerConfigured: boolean;
    customerOptedOut: boolean;
  };
  quickActions: WhatsAppQuickActionDef[];
}
