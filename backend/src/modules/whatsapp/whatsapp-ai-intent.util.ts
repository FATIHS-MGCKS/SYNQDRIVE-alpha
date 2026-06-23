import { WhatsAppAiIntent } from '@prisma/client';

interface IntentRule {
  intent: WhatsAppAiIntent;
  patterns: RegExp[];
  weight: number;
}

const INTENT_RULES: IntentRule[] = [
  { intent: WhatsAppAiIntent.OPT_OUT, patterns: [/\bstop\b/i, /abmelden/i, /unsubscribe/i], weight: 1 },
  { intent: WhatsAppAiIntent.ACCIDENT, patterns: [/unfall/i, /accident/i, /crash/i, /kollision/i, /zusammenstoß/i], weight: 1 },
  {
    intent: WhatsAppAiIntent.DAMAGE,
    patterns: [/schaden/i, /damage/i, /kratzer/i, /delle/i, /beschädigt/i],
    weight: 0.9,
  },
  {
    intent: WhatsAppAiIntent.PAYMENT,
    patterns: [/zahlung/i, /payment/i, /rechnung/i, /invoice/i, /bezahlen/i, /überweis/i],
    weight: 0.95,
  },
  { intent: WhatsAppAiIntent.DEPOSIT, patterns: [/kaution/i, /deposit/i], weight: 0.9 },
  {
    intent: WhatsAppAiIntent.BOOKING_CHANGE,
    patterns: [/ändern/i, /verlänger/i, /extend/i, /stornier/i, /cancel/i, /umbuch/i, /verschieb/i],
    weight: 0.95,
  },
  { intent: WhatsAppAiIntent.COMPLAINT, patterns: [/beschwerde/i, /complaint/i, /unzufrieden/i], weight: 0.9 },
  { intent: WhatsAppAiIntent.SUPPORT, patterns: [/hilfe/i, /\bhelp\b/i, /support/i], weight: 0.5 },
  { intent: WhatsAppAiIntent.DOCUMENTS, patterns: [/dokument/i, /document/i, /vertrag/i, /contract/i, /führerschein/i], weight: 0.85 },
  { intent: WhatsAppAiIntent.PICKUP_INFO, patterns: [/abhol/i, /pickup/i, /übernahme/i], weight: 0.85 },
  { intent: WhatsAppAiIntent.RETURN_INFO, patterns: [/rückgabe/i, /\breturn\b/i, /abgabe/i], weight: 0.85 },
  {
    intent: WhatsAppAiIntent.LOCATION,
    patterns: [/wo steht/i, /standort/i, /\blocation\b/i, /wo ist/i, /parkplatz/i, /parken/i],
    weight: 0.9,
  },
  {
    intent: WhatsAppAiIntent.VEHICLE_WARNING,
    patterns: [/warn/i, /lampe/i, /leuchtet/i, /check engine/i, /störung/i, /fehlerleuchte/i],
    weight: 0.95,
  },
  {
    intent: WhatsAppAiIntent.VEHICLE_STATUS,
    patterns: [/tank/i, /fuel/i, /\bkm\b/i, /kilometer/i, /batterie/i, /\bsoc\b/i, /fahrzeug/i, /\bauto\b/i],
    weight: 0.7,
  },
  {
    intent: WhatsAppAiIntent.BOOKING_STATUS,
    patterns: [/buchung/i, /booking/i, /reservierung/i, /\bstatus\b/i],
    weight: 0.75,
  },
];

const REFUND_PATTERNS = [/erstattung/i, /\brefund\b/i, /geld zurück/i];
const LEGAL_PATTERNS = [/anwalt/i, /\blegal\b/i, /rechtlich/i, /dsgvo/i, /\bgdpr\b/i];
const INSURANCE_PATTERNS = [/versicherung/i, /\binsurance\b/i];
const DAMAGE_DISPUTE_PATTERNS = [/streit/i, /dispute/i, /bestreit/i, /nicht mein schaden/i];

export interface IntentClassification {
  intent: WhatsAppAiIntent;
  matchStrength: number;
  extraFlags: string[];
}

export function classifyWhatsAppIntent(message: string): IntentClassification {
  const text = message.trim();
  const extraFlags: string[] = [];

  if (REFUND_PATTERNS.some((p) => p.test(text))) extraFlags.push('REFUND');
  if (LEGAL_PATTERNS.some((p) => p.test(text))) extraFlags.push('LEGAL');
  if (INSURANCE_PATTERNS.some((p) => p.test(text))) extraFlags.push('INSURANCE');
  if (DAMAGE_DISPUTE_PATTERNS.some((p) => p.test(text))) extraFlags.push('DAMAGE_DISPUTE');

  let best: IntentRule | null = null;
  let bestScore = 0;

  for (const rule of INTENT_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      const score = rule.weight;
      if (score > bestScore) {
        bestScore = score;
        best = rule;
      }
    }
  }

  if (!best) {
    return {
      intent: text.length > 0 ? WhatsAppAiIntent.GENERAL : WhatsAppAiIntent.UNKNOWN,
      matchStrength: text.length > 0 ? 0.4 : 0.1,
      extraFlags,
    };
  }

  return { intent: best.intent, matchStrength: bestScore, extraFlags };
}
