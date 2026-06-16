/**
 * Vehicle stress / Fahrbelastung bands (0–100).
 * Higher score = higher vehicle load — never a positive driver-quality signal.
 */
export type StressLevel = 'low' | 'moderate' | 'high' | 'critical';

export function classifyStressLevel(
  score: number | null | undefined,
): StressLevel | null {
  if (score == null || !Number.isFinite(score)) return null;
  const s = Math.max(0, Math.min(100, score));
  if (s <= 25) return 'low';
  if (s <= 50) return 'moderate';
  if (s <= 75) return 'high';
  return 'critical';
}
