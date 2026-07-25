import type {
  WorkflowRiskClass,
  WorkflowRiskRegistryEntry,
  WorkflowRiskSemanticCategory,
} from './workflow-risk-classification.types';

export const WORKFLOW_RISK_REGISTRY_VERSION = '2026-07-1';

function entry(
  partial: Omit<WorkflowRiskRegistryEntry, 'registryVersion'>,
): WorkflowRiskRegistryEntry {
  return { ...partial, registryVersion: WORKFLOW_RISK_REGISTRY_VERSION };
}

/** Canonical server-side risk registry — versioned, authoritative for classification. */
export const WORKFLOW_RISK_REGISTRY: Record<string, WorkflowRiskRegistryEntry> = {
  // ── Actions (enabled) ──

  'action:notification.in_app.send': entry({
    id: 'action:notification.in_app.send',
    kind: 'action',
    key: 'notification.in_app.send',
    label: 'Internal in-app notification',
    baseRiskClass: 'LOW',
    semanticCategories: ['internal_notification'],
    capabilityGate: 'ENABLED',
    generallyAvailable: true,
    description: 'Rein interne Benachrichtigung an Org-Benutzer',
  }),

  'action:notification.prepare': entry({
    id: 'action:notification.prepare',
    kind: 'action',
    key: 'notification.prepare',
    label: 'Notification prepare (deprecated)',
    baseRiskClass: 'LOW',
    semanticCategories: ['internal_notification'],
    capabilityGate: 'DEPRECATED',
    generallyAvailable: true,
    description: 'Legacy notification prepare — deprecated',
  }),

  'action:task.create': entry({
    id: 'action:task.create',
    kind: 'action',
    key: 'task.create',
    label: 'Task creation',
    baseRiskClass: 'LOW',
    semanticCategories: ['task_creation'],
    capabilityGate: 'ENABLED',
    generallyAvailable: true,
    description: 'Operative Task-Erstellung ohne direkten Kundenkontakt',
  }),

  'action:alert.create': entry({
    id: 'action:alert.create',
    kind: 'action',
    key: 'alert.create',
    label: 'Alert creation',
    baseRiskClass: 'MEDIUM',
    semanticCategories: ['operational'],
    capabilityGate: 'ENABLED',
    generallyAvailable: true,
    description: 'Interne Alert-Materialisierung',
  }),

  'action:approval.request': entry({
    id: 'action:approval.request',
    kind: 'action',
    key: 'approval.request',
    label: 'Approval request',
    baseRiskClass: 'MEDIUM',
    semanticCategories: ['approval_gate'],
    capabilityGate: 'ENABLED',
    generallyAvailable: true,
    description: 'Approval-Gate — erzeugt Freigabe, führt nicht selbst aus',
  }),

  'action:booking.flag': entry({
    id: 'action:booking.flag',
    kind: 'action',
    key: 'booking.flag',
    label: 'Booking internal flag',
    baseRiskClass: 'MEDIUM',
    semanticCategories: ['internal_flag_change'],
    capabilityGate: 'ENABLED',
    generallyAvailable: true,
    description: 'Änderung eines internen Buchungsflags',
  }),

  'action:email.send': entry({
    id: 'action:email.send',
    kind: 'action',
    key: 'email.send',
    label: 'Customer email',
    baseRiskClass: 'MEDIUM',
    semanticCategories: ['customer_email'],
    capabilityGate: 'ENABLED',
    generallyAvailable: true,
    description: 'Kunden-E-Mail über Workflow-Adapter',
  }),

  'action:whatsapp.template.send': entry({
    id: 'action:whatsapp.template.send',
    kind: 'action',
    key: 'whatsapp.template.send',
    label: 'Customer WhatsApp template',
    baseRiskClass: 'HIGH',
    semanticCategories: ['customer_whatsapp'],
    capabilityGate: 'ENABLED',
    generallyAvailable: true,
    description: 'Kunden-WhatsApp (genehmigtes Template)',
  }),

  'action:whatsapp.ai_message.send': entry({
    id: 'action:whatsapp.ai_message.send',
    kind: 'action',
    key: 'whatsapp.ai_message.send',
    label: 'AI-generated WhatsApp message',
    baseRiskClass: 'CRITICAL',
    semanticCategories: ['ai_generated_message', 'customer_whatsapp'],
    capabilityGate: 'ENABLED',
    generallyAvailable: false,
    description: 'KI-generierte Kunden-WhatsApp — mindestens HIGH, CRITICAL mit AI-Pipeline',
  }),

  'action:sms.send': entry({
    id: 'action:sms.send',
    kind: 'action',
    key: 'sms.send',
    label: 'Customer SMS',
    baseRiskClass: 'HIGH',
    semanticCategories: ['customer_sms'],
    capabilityGate: 'ENABLED',
    generallyAvailable: true,
    description: 'Kunden-SMS',
  }),

  'action:voice.call.start': entry({
    id: 'action:voice.call.start',
    kind: 'action',
    key: 'voice.call.start',
    label: 'AI outbound voice call',
    baseRiskClass: 'HIGH',
    semanticCategories: ['ai_voice_call'],
    capabilityGate: 'ENABLED',
    generallyAvailable: true,
    description: 'KI-Anruf über Voice Orchestrator',
  }),

  'action:vehicle.status.update': entry({
    id: 'action:vehicle.status.update',
    kind: 'action',
    key: 'vehicle.status.update',
    label: 'Vehicle status change',
    baseRiskClass: 'HIGH',
    semanticCategories: ['vehicle_status_change'],
    capabilityGate: 'ENABLED',
    generallyAvailable: true,
    description: 'Fahrzeugstatusänderung mit Rental-Health-Gates',
  }),

  'action:ai.suggest_action': entry({
    id: 'action:ai.suggest_action',
    kind: 'action',
    key: 'ai.suggest_action',
    label: 'AI action suggestion',
    baseRiskClass: 'CRITICAL',
    semanticCategories: ['ai_generated_message'],
    capabilityGate: 'ENABLED',
    generallyAvailable: false,
    description: 'KI-Vorschlag — niemals auto-ausführen',
  }),

  // ── Actions (disabled / future) ──

  'action:booking.cancel': entry({
    id: 'action:booking.cancel',
    kind: 'action',
    key: 'booking.cancel',
    label: 'Booking cancellation',
    baseRiskClass: 'CRITICAL',
    semanticCategories: ['booking_cancellation'],
    capabilityGate: 'DISABLED',
    generallyAvailable: false,
    description: 'Buchungsstornierung — nicht allgemein freigeschaltet',
  }),

  'action:booking.update': entry({
    id: 'action:booking.update',
    kind: 'action',
    key: 'booking.update',
    label: 'Booking modification',
    baseRiskClass: 'HIGH',
    semanticCategories: ['booking_modification'],
    capabilityGate: 'DISABLED',
    generallyAvailable: false,
    description: 'Buchungsänderung — zukünftiger Adapter',
  }),

  'action:invoice.charge': entry({
    id: 'action:invoice.charge',
    kind: 'action',
    key: 'invoice.charge',
    label: 'Payment charge',
    baseRiskClass: 'CRITICAL',
    semanticCategories: ['payment'],
    capabilityGate: 'DISABLED',
    generallyAvailable: false,
    description: 'Zahlung — nicht allgemein freigeschaltet',
  }),

  'action:customer.block': entry({
    id: 'action:customer.block',
    kind: 'action',
    key: 'customer.block',
    label: 'Customer block',
    baseRiskClass: 'CRITICAL',
    semanticCategories: ['customer_block'],
    capabilityGate: 'DISABLED',
    generallyAvailable: false,
    description: 'Kundensperre — nicht allgemein freigeschaltet',
  }),

  'action:kyc.decision': entry({
    id: 'action:kyc.decision',
    kind: 'action',
    key: 'kyc.decision',
    label: 'KYC decision',
    baseRiskClass: 'CRITICAL',
    semanticCategories: ['kyc_decision'],
    capabilityGate: 'DISABLED',
    generallyAvailable: false,
    description: 'KYC-Entscheidung — nicht allgemein freigeschaltet',
  }),

  'action:document.release': entry({
    id: 'action:document.release',
    kind: 'action',
    key: 'document.release',
    label: 'Document release',
    baseRiskClass: 'HIGH',
    semanticCategories: ['document_release'],
    capabilityGate: 'DISABLED',
    generallyAvailable: false,
    description: 'Dokumentenfreigabe — zukünftiger Adapter',
  }),

  // ── Triggers ──

  'trigger:manual.test': entry({
    id: 'trigger:manual.test',
    kind: 'trigger',
    key: 'manual.test',
    label: 'Manual test',
    baseRiskClass: 'LOW',
    semanticCategories: ['operational'],
    description: 'Manueller Test-Trigger',
  }),

  'trigger:booking.returned': entry({
    id: 'trigger:booking.returned',
    kind: 'trigger',
    key: 'booking.returned',
    label: 'Booking returned',
    baseRiskClass: 'LOW',
    semanticCategories: ['operational'],
    description: 'Buchung zurückgegeben',
  }),

  'trigger:booking.completed': entry({
    id: 'trigger:booking.completed',
    kind: 'trigger',
    key: 'booking.completed',
    label: 'Booking completed',
    baseRiskClass: 'LOW',
    semanticCategories: ['operational'],
    description: 'Buchung abgeschlossen',
  }),

  'trigger:vehicle.health.warning': entry({
    id: 'trigger:vehicle.health.warning',
    kind: 'trigger',
    key: 'vehicle.health.warning',
    label: 'Vehicle health warning',
    baseRiskClass: 'MEDIUM',
    semanticCategories: ['technical_security_alert'],
    description: 'Fahrzeug-Gesundheitswarnung',
  }),

  'trigger:vehicle.health.critical': entry({
    id: 'trigger:vehicle.health.critical',
    kind: 'trigger',
    key: 'vehicle.health.critical',
    label: 'Vehicle health critical',
    baseRiskClass: 'HIGH',
    semanticCategories: ['technical_security_alert'],
    description: 'Kritische technische Sicherheitsmeldung',
  }),

  'trigger:vehicle.dtc.critical': entry({
    id: 'trigger:vehicle.dtc.critical',
    kind: 'trigger',
    key: 'vehicle.dtc.critical',
    label: 'Critical DTC',
    baseRiskClass: 'HIGH',
    semanticCategories: ['technical_security_alert'],
    description: 'Kritischer DTC / Fehlercode',
  }),

  'trigger:invoice.overdue': entry({
    id: 'trigger:invoice.overdue',
    kind: 'trigger',
    key: 'invoice.overdue',
    label: 'Invoice overdue',
    baseRiskClass: 'MEDIUM',
    semanticCategories: ['payment'],
    description: 'Überfällige Rechnung',
  }),

  'trigger:customer.complaint.created': entry({
    id: 'trigger:customer.complaint.created',
    kind: 'trigger',
    key: 'customer.complaint.created',
    label: 'Customer complaint',
    baseRiskClass: 'MEDIUM',
    semanticCategories: ['operational'],
    description: 'Kundenbeschwerde erstellt',
  }),

  'trigger:task.automation.materialize': entry({
    id: 'trigger:task.automation.materialize',
    kind: 'trigger',
    key: 'task.automation.materialize',
    label: 'Task automation materialize',
    baseRiskClass: 'LOW',
    semanticCategories: ['task_creation'],
    description: 'Task-Automation Materialisierung',
  }),
};

export function getWorkflowRiskRegistryEntry(
  kind: 'action' | 'trigger',
  key: string,
): WorkflowRiskRegistryEntry | undefined {
  return WORKFLOW_RISK_REGISTRY[`${kind}:${key}`];
}

export function getActionRiskClass(actionType: string): WorkflowRiskClass {
  return getWorkflowRiskRegistryEntry('action', actionType)?.baseRiskClass ?? 'MEDIUM';
}

export function getTriggerRiskClass(triggerType: string): WorkflowRiskClass {
  return getWorkflowRiskRegistryEntry('trigger', triggerType)?.baseRiskClass ?? 'MEDIUM';
}

export function listWorkflowRiskRegistryEntries(): WorkflowRiskRegistryEntry[] {
  return Object.values(WORKFLOW_RISK_REGISTRY);
}

export function listCriticalActionsNotGenerallyAvailable(): WorkflowRiskRegistryEntry[] {
  return listWorkflowRiskRegistryEntries().filter(
    (e) =>
      e.kind === 'action'
      && e.baseRiskClass === 'CRITICAL'
      && e.generallyAvailable === false,
  );
}

export function collectSemanticCategories(actionTypes: string[]): WorkflowRiskSemanticCategory[] {
  const set = new Set<WorkflowRiskSemanticCategory>();
  for (const type of actionTypes) {
    const entry = getWorkflowRiskRegistryEntry('action', type);
    for (const cat of entry?.semanticCategories ?? []) {
      set.add(cat);
    }
  }
  return [...set];
}
