import type { DrivingImpactRollingWindow } from '../../lib/api';

export function formatDrivingImpactRollingFootnote(
  rolling: DrivingImpactRollingWindow | null | undefined,
): string | null {
  if (!rolling) return null;
  const parts: string[] = [];
  if (rolling.tripCount > 0) {
    parts.push(`${rolling.tripCount} Trips`);
  }
  if (rolling.distanceKmWindow > 0) {
    parts.push(`${Math.round(rolling.distanceKmWindow)} km`);
  }
  if (rolling.windowDays > 0) {
    parts.push(`${rolling.windowDays} Tage`);
  }
  if (rolling.excludedTripCount > 0) {
    parts.push(`${rolling.excludedTripCount} ausgeschlossen (Modellwechsel)`);
  }
  if (rolling.proxyShare.estimatedProxyShare > 0) {
    parts.push(
      `Proxy-Anteil ${Math.round(rolling.proxyShare.estimatedProxyShare * 100)} %`,
    );
  }
  if (parts.length === 0) return null;
  return `Rollierende Fahrbelastung (${parts.join(' · ')}) — keine Fahrerbewertung.`;
}
