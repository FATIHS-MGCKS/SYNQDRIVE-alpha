import type {
  FleetChatCompactFactTone,
  FleetChatStructuredPayload,
} from './fleet-chat-response.types';
import {
  fleetChatResponseTypeLabel,
  formatFleetDataAgeLabel,
  formatVehicleRefLabel,
  sanitizeSourceLabel,
} from './fleet-chat-response-display';

const TONE_TEXT_CLASS: Record<FleetChatCompactFactTone, string> = {
  good: 'text-[color:var(--status-success)]',
  warning: 'text-[color:var(--status-attention)]',
  critical: 'text-[color:var(--status-critical)]',
  neutral: 'text-muted-foreground',
  info: 'text-[color:var(--status-info)]',
};

const TONE_BG_CLASS: Record<FleetChatCompactFactTone, string> = {
  good: 'bg-status-success-soft',
  warning: 'bg-status-attention-soft',
  critical: 'bg-status-critical-soft',
  neutral: 'bg-muted',
  info: 'bg-status-info-soft',
};

export function compactToneTextClass(tone: FleetChatCompactFactTone): string {
  return TONE_TEXT_CLASS[tone] ?? TONE_TEXT_CLASS.neutral;
}

export function compactToneBgClass(tone: FleetChatCompactFactTone): string {
  return TONE_BG_CLASS[tone] ?? TONE_BG_CLASS.neutral;
}

export function buildLocalCompactSummary(
  structured: FleetChatStructuredPayload,
  locale: 'de' | 'en' = 'de',
): FleetChatStructuredPayload['compactSummary'] {
  if (structured.compactSummary?.facts.length) {
    return structured.compactSummary;
  }

  const facts: NonNullable<FleetChatStructuredPayload['compactSummary']>['facts'] = [];

  const vehicleLabel = formatVehicleRefLabel(structured.vehicle, locale);
  if (vehicleLabel) {
    facts.push({
      id: 'vehicle',
      label: locale === 'en' ? 'Vehicle' : 'Fahrzeug',
      value: vehicleLabel,
      tone: 'neutral',
    });
  }

  facts.push({
    id: 'freshness',
    label: locale === 'en' ? 'Data freshness' : 'Datenfrische',
    value: formatFleetDataAgeLabel(structured.dataFreshness, locale),
    tone: structured.dataFreshness.isLastKnown ? 'warning' : 'info',
  });

  if (structured.sources[0]) {
    facts.push({
      id: 'source',
      label: locale === 'en' ? 'Source' : 'Quelle',
      value: sanitizeSourceLabel(structured.sources[0].label, locale),
      tone: 'info',
    });
  }

  let statusTone: FleetChatCompactFactTone = 'info';
  if (structured.partial || structured.dataFreshness.isLastKnown) statusTone = 'warning';
  if (
    structured.responseType === 'PERMISSION_RESTRICTED' ||
    structured.responseType === 'TEMPORARY_UNAVAILABLE'
  ) {
    statusTone = 'critical';
  }

  return {
    statusTone,
    facts,
  };
}

export function shouldCollapseNarrative(
  structured: FleetChatStructuredPayload,
  content: string,
): boolean {
  const summary = structured.compactSummary ?? buildLocalCompactSummary(structured);
  if (!summary?.facts.length) return false;
  const headline = summary.headline?.trim();
  if (!headline) return true;
  const normalizedContent = content.trim().replace(/\s+/g, ' ');
  const normalizedHeadline = headline.replace(/\s+/g, ' ');
  if (normalizedContent === normalizedHeadline) return true;
  if (normalizedContent.startsWith(normalizedHeadline)) return true;
  return summary.facts.length >= 2;
}
