import type { VoiceTab } from './voice-assistant.ops';

export type VoiceTestScenarioId =
  | 'booking_status'
  | 'pickup'
  | 'return_vehicle'
  | 'missing_document'
  | 'open_invoice'
  | 'breakdown'
  | 'damage'
  | 'unknown_question'
  | 'sensitive_change'
  | 'staff_handover';

export type VoiceTestVerdict = 'PASS' | 'PARTIAL' | 'FAIL';

export interface VoiceTestScenario {
  id: VoiceTestScenarioId;
  titleKey: string;
  goalKey: string;
  expectationKey: string;
  tools: string[];
  critical: boolean;
  fixTab?: VoiceTab;
}

export const VOICE_TEST_SCENARIOS: VoiceTestScenario[] = [
  {
    id: 'booking_status',
    titleKey: 'voice.test.scenario.bookingStatus.title',
    goalKey: 'voice.test.scenario.bookingStatus.goal',
    expectationKey: 'voice.test.scenario.bookingStatus.expectation',
    tools: ['booking_lookup', 'answer_general'],
    critical: true,
    fixTab: 'permissions',
  },
  {
    id: 'pickup',
    titleKey: 'voice.test.scenario.pickup.title',
    goalKey: 'voice.test.scenario.pickup.goal',
    expectationKey: 'voice.test.scenario.pickup.expectation',
    tools: ['booking_lookup', 'station_info'],
    critical: true,
    fixTab: 'config',
  },
  {
    id: 'return_vehicle',
    titleKey: 'voice.test.scenario.return.title',
    goalKey: 'voice.test.scenario.return.goal',
    expectationKey: 'voice.test.scenario.return.expectation',
    tools: ['booking_lookup', 'return_guidance'],
    critical: true,
    fixTab: 'config',
  },
  {
    id: 'missing_document',
    titleKey: 'voice.test.scenario.missingDocument.title',
    goalKey: 'voice.test.scenario.missingDocument.goal',
    expectationKey: 'voice.test.scenario.missingDocument.expectation',
    tools: ['document_status', 'answer_general'],
    critical: false,
    fixTab: 'knowledge',
  },
  {
    id: 'open_invoice',
    titleKey: 'voice.test.scenario.openInvoice.title',
    goalKey: 'voice.test.scenario.openInvoice.goal',
    expectationKey: 'voice.test.scenario.openInvoice.expectation',
    tools: ['invoice_lookup', 'escalation'],
    critical: true,
    fixTab: 'permissions',
  },
  {
    id: 'breakdown',
    titleKey: 'voice.test.scenario.breakdown.title',
    goalKey: 'voice.test.scenario.breakdown.goal',
    expectationKey: 'voice.test.scenario.breakdown.expectation',
    tools: ['emergency_escalation', 'damage_case'],
    critical: true,
    fixTab: 'escalation',
  },
  {
    id: 'damage',
    titleKey: 'voice.test.scenario.damage.title',
    goalKey: 'voice.test.scenario.damage.goal',
    expectationKey: 'voice.test.scenario.damage.expectation',
    tools: ['emergency_escalation', 'damage_case'],
    critical: true,
    fixTab: 'escalation',
  },
  {
    id: 'unknown_question',
    titleKey: 'voice.test.scenario.unknown.title',
    goalKey: 'voice.test.scenario.unknown.goal',
    expectationKey: 'voice.test.scenario.unknown.expectation',
    tools: ['answer_general', 'escalation'],
    critical: false,
    fixTab: 'knowledge',
  },
  {
    id: 'sensitive_change',
    titleKey: 'voice.test.scenario.sensitive.title',
    goalKey: 'voice.test.scenario.sensitive.goal',
    expectationKey: 'voice.test.scenario.sensitive.expectation',
    tools: ['permission_guard', 'escalation'],
    critical: true,
    fixTab: 'permissions',
  },
  {
    id: 'staff_handover',
    titleKey: 'voice.test.scenario.handover.title',
    goalKey: 'voice.test.scenario.handover.goal',
    expectationKey: 'voice.test.scenario.handover.expectation',
    tools: ['transfer', 'escalation'],
    critical: true,
    fixTab: 'escalation',
  },
];

export function verdictTone(verdict: VoiceTestVerdict | null): 'success' | 'watch' | 'critical' | 'neutral' {
  if (verdict === 'PASS') return 'success';
  if (verdict === 'PARTIAL') return 'watch';
  if (verdict === 'FAIL') return 'critical';
  return 'neutral';
}
