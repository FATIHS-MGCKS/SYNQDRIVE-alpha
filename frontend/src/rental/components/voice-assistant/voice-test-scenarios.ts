import type { TranslationKey } from '../../../i18n/translations/en';
import type { VoiceTab } from './voice-assistant.ops';

export interface VoiceTestScenarioDefinition {
  id: string;
  titleKey: TranslationKey;
  promptKey: TranslationKey;
  expectedBehaviorKeys: TranslationKey[];
  escalateWhenKeys: TranslationKey[];
  permissionKeys: TranslationKey[];
  fixTab?: VoiceTab;
}

export interface VoiceTestScenario {
  id: string;
  title: string;
  prompt: string;
  expectedBehavior: string[];
  escalateWhen: string[];
  permissions: string[];
  fixTab?: VoiceTab;
}

export const VOICE_TEST_SCENARIO_DEFINITIONS: VoiceTestScenarioDefinition[] = [
  {
    id: 'book_vehicle',
    titleKey: 'voice.test.scenario.bookVehicle.title',
    promptKey: 'voice.test.scenario.bookVehicle.prompt',
    expectedBehaviorKeys: [
      'voice.test.scenario.bookVehicle.expected.0',
      'voice.test.scenario.bookVehicle.expected.1',
      'voice.test.scenario.bookVehicle.expected.2',
    ],
    escalateWhenKeys: ['voice.test.scenario.bookVehicle.escalate.0'],
    permissionKeys: [
      'voice.test.scenario.bookVehicle.permission.0',
      'voice.test.scenario.bookVehicle.permission.1',
    ],
    fixTab: 'permissions',
  },
  {
    id: 'modify_booking',
    titleKey: 'voice.test.scenario.modifyBooking.title',
    promptKey: 'voice.test.scenario.modifyBooking.prompt',
    expectedBehaviorKeys: [
      'voice.test.scenario.modifyBooking.expected.0',
      'voice.test.scenario.modifyBooking.expected.1',
    ],
    escalateWhenKeys: ['voice.test.scenario.modifyBooking.escalate.0'],
    permissionKeys: [
      'voice.test.scenario.modifyBooking.permission.0',
      'voice.test.scenario.modifyBooking.permission.1',
    ],
    fixTab: 'permissions',
  },
  {
    id: 'cancel_booking',
    titleKey: 'voice.test.scenario.cancelBooking.title',
    promptKey: 'voice.test.scenario.cancelBooking.prompt',
    expectedBehaviorKeys: [
      'voice.test.scenario.cancelBooking.expected.0',
      'voice.test.scenario.cancelBooking.expected.1',
    ],
    escalateWhenKeys: ['voice.test.scenario.cancelBooking.escalate.0'],
    permissionKeys: ['voice.test.scenario.cancelBooking.permission.0'],
    fixTab: 'permissions',
  },
  {
    id: 'breakdown',
    titleKey: 'voice.test.scenario.breakdown.title',
    promptKey: 'voice.test.scenario.breakdown.prompt',
    expectedBehaviorKeys: [
      'voice.test.scenario.breakdown.expected.0',
      'voice.test.scenario.breakdown.expected.1',
    ],
    escalateWhenKeys: ['voice.test.scenario.breakdown.escalate.0'],
    permissionKeys: [
      'voice.test.scenario.breakdown.permission.0',
      'voice.test.scenario.breakdown.permission.1',
    ],
    fixTab: 'escalation',
  },
  {
    id: 'accident_damage',
    titleKey: 'voice.test.scenario.accidentDamage.title',
    promptKey: 'voice.test.scenario.accidentDamage.prompt',
    expectedBehaviorKeys: [
      'voice.test.scenario.accidentDamage.expected.0',
      'voice.test.scenario.accidentDamage.expected.1',
    ],
    escalateWhenKeys: ['voice.test.scenario.accidentDamage.escalate.0'],
    permissionKeys: [
      'voice.test.scenario.accidentDamage.permission.0',
      'voice.test.scenario.accidentDamage.permission.1',
    ],
    fixTab: 'escalation',
  },
  {
    id: 'price_quote',
    titleKey: 'voice.test.scenario.priceQuote.title',
    promptKey: 'voice.test.scenario.priceQuote.prompt',
    expectedBehaviorKeys: [
      'voice.test.scenario.priceQuote.expected.0',
      'voice.test.scenario.priceQuote.expected.1',
    ],
    escalateWhenKeys: ['voice.test.scenario.priceQuote.escalate.0'],
    permissionKeys: ['voice.test.scenario.priceQuote.permission.0'],
    fixTab: 'config',
  },
  {
    id: 'human_handover',
    titleKey: 'voice.test.scenario.humanHandover.title',
    promptKey: 'voice.test.scenario.humanHandover.prompt',
    expectedBehaviorKeys: ['voice.test.scenario.humanHandover.expected.0'],
    escalateWhenKeys: ['voice.test.scenario.humanHandover.escalate.0'],
    permissionKeys: [
      'voice.test.scenario.humanHandover.permission.0',
      'voice.test.scenario.humanHandover.permission.1',
    ],
    fixTab: 'escalation',
  },
  {
    id: 'after_hours',
    titleKey: 'voice.test.scenario.afterHours.title',
    promptKey: 'voice.test.scenario.afterHours.prompt',
    expectedBehaviorKeys: [
      'voice.test.scenario.afterHours.expected.0',
      'voice.test.scenario.afterHours.expected.1',
    ],
    escalateWhenKeys: ['voice.test.scenario.afterHours.escalate.0'],
    permissionKeys: ['voice.test.scenario.afterHours.permission.0'],
    fixTab: 'escalation',
  },
];
