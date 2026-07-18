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

export type VoiceTestScenarioDefinition = {
  id: VoiceTestScenarioId;
  titleKey: string;
  goalKey: string;
  expectationKey: string;
  tools: string[];
  critical: boolean;
};

export const VOICE_TEST_SCENARIO_DEFINITIONS: VoiceTestScenarioDefinition[] = [
  {
    id: 'booking_status',
    titleKey: 'voice.test.scenario.bookingStatus.title',
    goalKey: 'voice.test.scenario.bookingStatus.goal',
    expectationKey: 'voice.test.scenario.bookingStatus.expectation',
    tools: ['booking_lookup', 'answer_general'],
    critical: true,
  },
  {
    id: 'pickup',
    titleKey: 'voice.test.scenario.pickup.title',
    goalKey: 'voice.test.scenario.pickup.goal',
    expectationKey: 'voice.test.scenario.pickup.expectation',
    tools: ['booking_lookup', 'station_info'],
    critical: true,
  },
  {
    id: 'return_vehicle',
    titleKey: 'voice.test.scenario.return.title',
    goalKey: 'voice.test.scenario.return.goal',
    expectationKey: 'voice.test.scenario.return.expectation',
    tools: ['booking_lookup', 'return_guidance'],
    critical: true,
  },
  {
    id: 'missing_document',
    titleKey: 'voice.test.scenario.missingDocument.title',
    goalKey: 'voice.test.scenario.missingDocument.goal',
    expectationKey: 'voice.test.scenario.missingDocument.expectation',
    tools: ['document_status', 'answer_general'],
    critical: false,
  },
  {
    id: 'open_invoice',
    titleKey: 'voice.test.scenario.openInvoice.title',
    goalKey: 'voice.test.scenario.openInvoice.goal',
    expectationKey: 'voice.test.scenario.openInvoice.expectation',
    tools: ['invoice_lookup', 'escalation'],
    critical: true,
  },
  {
    id: 'breakdown',
    titleKey: 'voice.test.scenario.breakdown.title',
    goalKey: 'voice.test.scenario.breakdown.goal',
    expectationKey: 'voice.test.scenario.breakdown.expectation',
    tools: ['emergency_escalation', 'damage_case'],
    critical: true,
  },
  {
    id: 'damage',
    titleKey: 'voice.test.scenario.damage.title',
    goalKey: 'voice.test.scenario.damage.goal',
    expectationKey: 'voice.test.scenario.damage.expectation',
    tools: ['emergency_escalation', 'damage_case'],
    critical: true,
  },
  {
    id: 'unknown_question',
    titleKey: 'voice.test.scenario.unknown.title',
    goalKey: 'voice.test.scenario.unknown.goal',
    expectationKey: 'voice.test.scenario.unknown.expectation',
    tools: ['answer_general', 'escalation'],
    critical: false,
  },
  {
    id: 'sensitive_change',
    titleKey: 'voice.test.scenario.sensitive.title',
    goalKey: 'voice.test.scenario.sensitive.goal',
    expectationKey: 'voice.test.scenario.sensitive.expectation',
    tools: ['permission_guard', 'escalation'],
    critical: true,
  },
  {
    id: 'staff_handover',
    titleKey: 'voice.test.scenario.handover.title',
    goalKey: 'voice.test.scenario.handover.goal',
    expectationKey: 'voice.test.scenario.handover.expectation',
    tools: ['transfer', 'escalation'],
    critical: true,
  },
];

export const VOICE_REQUIRED_TEST_SCENARIO_IDS = VOICE_TEST_SCENARIO_DEFINITIONS.map((s) => s.id);

export function findScenarioDefinition(id: string): VoiceTestScenarioDefinition | undefined {
  return VOICE_TEST_SCENARIO_DEFINITIONS.find((scenario) => scenario.id === id);
}
