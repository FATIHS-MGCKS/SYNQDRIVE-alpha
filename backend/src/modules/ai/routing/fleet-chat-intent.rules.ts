import type { FleetChatIntent } from './fleet-chat-intent.enums';
import type { FleetChatIntentScore } from './fleet-chat-intent.types';

export interface FleetChatIntentRule {
  readonly intent: FleetChatIntent;
  readonly terms: readonly string[];
  readonly weight: number;
}

const VEHICLE_SPECIFIC_INTENTS: readonly FleetChatIntent[] = [
  'VEHICLE_LOCATION',
  'VEHICLE_TELEMETRY_STATUS',
  'VEHICLE_HEALTH',
  'OVERDUE_RETURN_EXPLANATION',
  'VEHICLE_BOOKING_CONTEXT',
];

export const FLEET_CHAT_INTENT_RULES: readonly FleetChatIntentRule[] = [
  {
    intent: 'VEHICLE_LOCATION',
    weight: 1,
    terms: [
      'wo steht',
      'wo ist',
      'wo parkt',
      'wo steht es',
      'standort',
      'position',
      'gps',
      'where is',
      'where does it stand',
      'where does it park',
      'current location',
      'parked',
      'steht aktuell',
      'wo steht es',
    ],
  },
  {
    intent: 'VEHICLE_TELEMETRY_STATUS',
    weight: 1,
    terms: [
      'telemetrie',
      'telemetrie',
      'telemetry',
      'verbindung',
      'connectivity',
      'signal',
      'signalgruppe',
      'signal group',
      'online',
      'offline',
      'verbunden',
      'connected',
      'letzter signal',
      'last signal',
      'no signal',
      'kein signal',
    ],
  },
  {
    intent: 'VEHICLE_HEALTH',
    weight: 1,
    terms: [
      'gesundheit',
      'health',
      'batterie',
      'battery',
      'reifen',
      'tire',
      'tyre',
      'bremsen',
      'brake',
      'dtc',
      'fehlercode',
      'error code',
      'error codes',
      'wartung',
      'service info',
      'tüv',
      'tuv',
      'ölwechsel',
      'oil change',
      'schaden',
      'schäden',
      'damage',
      'damages',
      'kritische aufgabe',
      'critical task',
    ],
  },
  {
    intent: 'OVERDUE_RETURN_EXPLANATION',
    weight: 1.1,
    terms: [
      'überfällig',
      'überfällige rückgabe',
      'überfällige rückgabe',
      'ueberfaellig',
      'ueberfaellige rueckgabe',
      'verspätet',
      'verspaetet',
      'überfällige rücknahme',
      'overdue return',
      'overdue',
      'late return',
      'past due',
      'return deadline',
      'rückgabefrist',
      'rueckgabefrist',
      'warum ist',
      'why is',
      'überfällig und',
      'overdue and',
    ],
  },
  {
    intent: 'VEHICLE_BOOKING_CONTEXT',
    weight: 1,
    terms: [
      'buchungsstatus',
      'booking status',
      'buchungsnummer',
      'booking number',
      'handover',
      'übergabe',
      'uebergabe',
      'rücknahme',
      'ruecknahme',
      'pickup',
      'abholung',
      'return-zeit',
      'return time',
      'verlängerung',
      'verlaengerung',
      'extension',
      'offene prozessschritte',
      'process steps',
      'buchungskontext',
      'booking context',
      'miete',
      'rental',
    ],
  },
  {
    intent: 'SYNQDRIVE_KNOWLEDGE',
    weight: 1,
    terms: [
      'synqdrive',
      'wie funktioniert synqdrive',
      'how does synqdrive work',
      'was ist synqdrive',
      'what is synqdrive',
      'produkt hilfe',
      'product help',
      'glossar',
      'glossary',
      'dokumentation',
      'documentation',
      'was bedeutet',
      'what does it mean',
      'erkläre mir das produkt',
      'explain the product',
    ],
  },
  {
    intent: 'GENERAL_FLEET_QUESTION',
    weight: 0.9,
    terms: [
      'wie viele fahrzeuge',
      'how many vehicles',
      'fleet size',
      'fleet overview',
      'flottenübersicht',
      'fleet overview',
      'was ist los in der flotte',
      'what is going on in the fleet',
      'fleet summary',
    ],
  },
  {
    intent: 'UNSUPPORTED',
    weight: 1,
    terms: [
      'wetter',
      'weather',
      'recipe',
      'rezept',
      'stock market',
      'aktienkurs',
      'write code',
      'code schreiben',
      'send email',
      'email senden',
      'bitcoin',
      'crypto',
    ],
  },
];

export function scoreFleetChatIntents(message: string): readonly FleetChatIntentScore[] {
  const lower = message.toLowerCase();
  const scores: FleetChatIntentScore[] = [];

  for (const rule of FLEET_CHAT_INTENT_RULES) {
    const matchedTerms: string[] = [];
    for (const term of rule.terms) {
      if (lower.includes(term.toLowerCase())) {
        matchedTerms.push(term);
      }
    }
    if (matchedTerms.length === 0) {
      continue;
    }
    const score = Math.min(
      1,
      (matchedTerms.length / Math.max(1, rule.terms.length)) * rule.weight * 0.85 +
        matchedTerms.length * 0.08,
    );
    scores.push({
      intent: rule.intent,
      score,
      matchedTerms,
    });
  }

  return scores.sort((a, b) => b.score - a.score);
}

export function isVehicleSpecificIntent(intent: FleetChatIntent): boolean {
  return (VEHICLE_SPECIFIC_INTENTS as readonly string[]).includes(intent);
}

export const FLEET_CHAT_INTENT_TO_TOOL: Readonly<
  Partial<Record<FleetChatIntent, import('../registry/ai-domain-tool-registry.types').AiDomainToolName>>
> = {
  VEHICLE_LOCATION: 'get_vehicle_location',
  VEHICLE_TELEMETRY_STATUS: 'get_vehicle_telemetry_status',
  VEHICLE_HEALTH: 'get_vehicle_health_summary',
  OVERDUE_RETURN_EXPLANATION: 'explain_overdue_return',
  VEHICLE_BOOKING_CONTEXT: 'get_vehicle_booking_context',
};

export function resolveRequiredTools(
  intents: readonly FleetChatIntent[],
): readonly import('../registry/ai-domain-tool-registry.types').AiDomainToolName[] {
  const tools = new Set<import('../registry/ai-domain-tool-registry.types').AiDomainToolName>();
  for (const intent of intents) {
    const tool = FLEET_CHAT_INTENT_TO_TOOL[intent];
    if (tool) {
      tools.add(tool);
    }
  }
  return [...tools];
}
