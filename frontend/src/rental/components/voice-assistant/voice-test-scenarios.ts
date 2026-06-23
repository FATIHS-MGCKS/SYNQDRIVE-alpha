import type { VoiceTab } from './voice-assistant.ops';

export interface VoiceTestScenario {
  id: string;
  title: string;
  prompt: string;
  expectedBehavior: string[];
  escalateWhen: string[];
  permissions: string[];
  fixTab?: VoiceTab;
}

export const VOICE_TEST_SCENARIOS: VoiceTestScenario[] = [
  {
    id: 'book_vehicle',
    title: 'Customer wants to book a vehicle',
    prompt: 'I would like to rent a car for next weekend.',
    expectedBehavior: [
      'Answer general questions about availability and process.',
      'May suggest creating a booking draft if permission allows.',
      'Must not quote binding prices without tariff data.',
    ],
    escalateWhen: ['Customer insists on immediate confirmation with special terms.'],
    permissions: ['Answer general questions', 'Create booking draft (suggest only)'],
    fixTab: 'permissions',
  },
  {
    id: 'modify_booking',
    title: 'Customer wants to change a booking',
    prompt: 'I need to move my reservation to another date.',
    expectedBehavior: [
      'Search for the booking if lookup is enabled.',
      'Explain that changes require staff review unless autonomous modify is explicitly allowed.',
    ],
    escalateWhen: ['Modification affects pricing, vehicle class, or same-day change.'],
    permissions: ['Booking search', 'Modify booking (suggest only)'],
    fixTab: 'permissions',
  },
  {
    id: 'cancel_booking',
    title: 'Customer wants to cancel',
    prompt: 'Please cancel my booking and refund me.',
    expectedBehavior: [
      'Acknowledge the request and explain cancellation policy.',
      'Must not confirm cancellation autonomously.',
    ],
    escalateWhen: ['Always — cancellation requires human approval.'],
    permissions: ['Cancel booking (disabled by default)'],
    fixTab: 'permissions',
  },
  {
    id: 'breakdown',
    title: 'Customer reports breakdown',
    prompt: 'My rental car broke down on the highway.',
    expectedBehavior: [
      'Gather location and safety status.',
      'Open damage/breakdown case if permitted (suggest only).',
    ],
    escalateWhen: ['Immediately if caller is in danger or on a live roadway.'],
    permissions: ['Emergency escalation', 'Create damage case'],
    fixTab: 'escalation',
  },
  {
    id: 'accident_damage',
    title: 'Customer reports accident / damage',
    prompt: 'I had a small accident and there is damage to the bumper.',
    expectedBehavior: [
      'Ensure caller safety first.',
      'Collect facts without assigning fault or legal advice.',
    ],
    escalateWhen: ['Injuries, police involvement, or disputed liability.'],
    permissions: ['Emergency escalation', 'Create damage case'],
    fixTab: 'escalation',
  },
  {
    id: 'price_quote',
    title: 'Customer asks for price',
    prompt: 'How much would a week in a midsize car cost?',
    expectedBehavior: [
      'Explain that exact pricing depends on dates and vehicle class.',
      'May provide indicative guidance only in suggest mode — never binding quotes.',
    ],
    escalateWhen: ['Customer needs a formal quote or contract terms.'],
    permissions: ['Quote prices (suggest only)'],
    fixTab: 'config',
  },
  {
    id: 'human_handover',
    title: 'Customer wants a human',
    prompt: 'I want to speak to a real person please.',
    expectedBehavior: [
      'Acknowledge politely and initiate escalation flow.',
    ],
    escalateWhen: ['Immediately on explicit human request.'],
    permissions: ['Emergency escalation', 'Escalation on request'],
    fixTab: 'escalation',
  },
  {
    id: 'after_hours',
    title: 'Customer calls outside business hours',
    prompt: 'Hello, I am calling about my rental but I know it is late.',
    expectedBehavior: [
      'Play after-hours message if configured.',
      'Offer to take details or escalate per policy.',
    ],
    escalateWhen: ['Emergency or safety issue regardless of hours.'],
    permissions: ['Answer general questions'],
    fixTab: 'escalation',
  },
];
