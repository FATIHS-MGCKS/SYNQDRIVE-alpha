/** German labels for read-only ClickHouse trip evidence (not scores). */

export function signalQualityLabelDe(
  quality: 'good' | 'medium' | 'weak' | 'unavailable',
): string {
  switch (quality) {
    case 'good':
      return 'Gut';
    case 'medium':
      return 'Mittel';
    case 'weak':
      return 'Schwach';
    default:
      return 'Nicht verfügbar';
  }
}

export function clickhouseStatusHintDe(
  status: 'available' | 'degraded' | 'unavailable' | 'mirror_disabled',
): string | null {
  switch (status) {
    case 'degraded':
      return 'ClickHouse Evidence eingeschränkt';
    case 'unavailable':
      return 'ClickHouse Evidence nicht verfügbar';
    case 'mirror_disabled':
      return 'HF-Mirror deaktiviert';
    default:
      return null;
  }
}
