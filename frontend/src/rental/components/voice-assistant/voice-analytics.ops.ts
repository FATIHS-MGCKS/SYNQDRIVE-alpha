import type {
  VoiceAssistantAnalytics,
  VoiceConversationEntry,
  VoiceUsageForecast,
  VoiceUsageSummary,
} from '../../../lib/api';
import { conversationIntent, isFinalizedConversation } from './voice-conversation.utils';

export interface VoiceAnalyticsQualityRates {
  solutionRate: number | null;
  escalationRate: number | null;
  finalizedCalls: number;
  pendingExcluded: number;
}

export interface VoiceHourlyBucket {
  hour: number;
  count: number;
}

export interface VoiceIntentAggregate {
  label: string;
  count: number;
}

export interface VoiceAnalyticsDerived {
  quality: VoiceAnalyticsQualityRates;
  peakHours: VoiceHourlyBucket[];
  topIntents: VoiceIntentAggregate[];
  providerErrorCount: number;
  processGapHints: string[];
}

export function computeQualityRates(
  conversations: VoiceConversationEntry[],
): VoiceAnalyticsQualityRates {
  const finalized = conversations.filter(isFinalizedConversation);
  const pendingExcluded = conversations.length - finalized.length;
  if (finalized.length === 0) {
    return {
      solutionRate: null,
      escalationRate: null,
      finalizedCalls: 0,
      pendingExcluded,
    };
  }
  const resolved = finalized.filter(c => c.outcome === 'RESOLVED' && !c.escalated).length;
  const escalated = finalized.filter(c => c.escalated || c.outcome === 'ESCALATED').length;
  return {
    solutionRate: Math.round((resolved / finalized.length) * 1000) / 10,
    escalationRate: Math.round((escalated / finalized.length) * 1000) / 10,
    finalizedCalls: finalized.length,
    pendingExcluded,
  };
}

export function aggregatePeakHours(conversations: VoiceConversationEntry[]): VoiceHourlyBucket[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const conv of conversations) {
    if (!isFinalizedConversation(conv)) continue;
    const hour = new Date(conv.startedAt).getHours();
    buckets[hour].count += 1;
  }
  return buckets.filter(b => b.count > 0).sort((a, b) => b.count - a.count).slice(0, 8);
}

export function aggregateTopIntents(
  conversations: VoiceConversationEntry[],
  limit = 6,
): VoiceIntentAggregate[] {
  const counts = new Map<string, number>();
  for (const conv of conversations) {
    if (!isFinalizedConversation(conv)) continue;
    const intent = conversationIntent(conv);
    if (!intent) continue;
    const key = intent.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

export function deriveAnalyticsInsights(params: {
  conversations: VoiceConversationEntry[];
  analytics: VoiceAssistantAnalytics | null;
}): VoiceAnalyticsDerived {
  const quality = computeQualityRates(params.conversations);
  const providerErrorCount = params.conversations.filter(
    c => isFinalizedConversation(c) && (c.outcome === 'FAILED' || c.errorMessage),
  ).length;

  const processGapHints: string[] = [];
  if (params.analytics && !params.analytics.knowledgeGaps.available) {
    processGapHints.push('knowledge_gaps');
  }
  if (quality.escalationRate != null && quality.escalationRate >= 25) {
    processGapHints.push('high_escalation');
  }
  if (providerErrorCount > 0) {
    processGapHints.push('provider_errors');
  }

  return {
    quality,
    peakHours: aggregatePeakHours(params.conversations),
    topIntents: aggregateTopIntents(params.conversations),
    providerErrorCount,
    processGapHints,
  };
}

export function usageCostLabel(usage: VoiceUsageSummary | null): 'estimated' | 'final' | 'unknown' {
  if (!usage) return 'unknown';
  // Period aggregates are finalized when consumed minutes are closed; until then treat as estimated.
  if (usage.consumedMinutes > 0 && usage.estimatedUsageRevenueCents > 0) return 'estimated';
  return 'estimated';
}

export function formatForecastMinutes(forecast: VoiceUsageForecast | null): number | null {
  if (!forecast) return null;
  return forecast.projectedMinutes;
}

export function analyticsAnsweredFromFinalized(
  analytics: VoiceAssistantAnalytics | null,
  conversations: VoiceConversationEntry[],
): number | null {
  const finalized = conversations.filter(isFinalizedConversation);
  if (finalized.length > 0) {
    return finalized.filter(c => c.outcome === 'RESOLVED' || c.outcome === 'ESCALATED').length;
  }
  return analytics?.answeredCalls ?? null;
}
