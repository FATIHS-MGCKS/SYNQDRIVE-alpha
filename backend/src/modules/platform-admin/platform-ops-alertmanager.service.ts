import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PlatformOpsAlertmanagerSummaryDto } from './platform-ops.types';

interface AmAlert {
  status?: { state?: string };
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  startsAt?: string;
  endsAt?: string;
}

@Injectable()
export class PlatformOpsAlertmanagerService {
  private readonly logger = new Logger(PlatformOpsAlertmanagerService.name);

  constructor(private readonly config: ConfigService) {}

  getAlertmanagerUrl(): string {
    return this.config.get<string>('ALERTMANAGER_INTERNAL_URL') ?? 'http://127.0.0.1:9093';
  }

  async getSummary(): Promise<PlatformOpsAlertmanagerSummaryDto> {
    const generatedAt = new Date().toISOString();
    const baseUrl = this.getAlertmanagerUrl();
    const enabled = this.config.get<string>('PLATFORM_OPS_ALERTMANAGER_ENABLED') !== 'false';

    if (!enabled) {
      return {
        generatedAt,
        available: false,
        firingCritical: 0,
        firingWarning: 0,
        pending: 0,
        silenced: 0,
        lastNotificationAt: null,
        source: 'unavailable',
      };
    }

    try {
      const [alertsRes, silencesRes] = await Promise.all([
        fetch(`${baseUrl}/api/v2/alerts`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        }),
        fetch(`${baseUrl}/api/v2/silences`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        }),
      ]);

      if (!alertsRes.ok) {
        throw new Error(`Alertmanager alerts HTTP ${alertsRes.status}`);
      }

      const alerts = (await alertsRes.json()) as AmAlert[];
      let silenced = 0;
      if (silencesRes.ok) {
        const silences = (await silencesRes.json()) as Array<{ status?: { state?: string } }>;
        silenced = silences.filter((s) => s.status?.state === 'active').length;
      }

      let firingCritical = 0;
      let firingWarning = 0;
      let pending = 0;

      for (const alert of alerts) {
        const state = alert.status?.state ?? 'active';
        const severity = (alert.labels?.severity ?? 'warning').toLowerCase();
        if (state === 'suppressed') continue;
        if (state === 'pending') {
          pending += 1;
          continue;
        }
        if (severity === 'critical') firingCritical += 1;
        else if (severity === 'warning') firingWarning += 1;
      }

      return {
        generatedAt,
        available: true,
        firingCritical,
        firingWarning,
        pending,
        silenced,
        lastNotificationAt: null,
        source: 'alertmanager',
      };
    } catch (err: unknown) {
      this.logger.debug(`Alertmanager summary unavailable: ${(err as Error).message}`);
      return {
        generatedAt,
        available: false,
        firingCritical: 0,
        firingWarning: 0,
        pending: 0,
        silenced: 0,
        lastNotificationAt: null,
        source: 'unavailable',
      };
    }
  }

  async getAlertGroups(): Promise<
    Array<{
      alertname: string;
      severity: string;
      component: string;
      count: number;
      summary: string;
      firstSeen: string;
      lastSeen: string;
      silenced: boolean;
      pending: boolean;
    }>
  > {
    const baseUrl = this.getAlertmanagerUrl();
    const enabled = this.config.get<string>('PLATFORM_OPS_ALERTMANAGER_ENABLED') !== 'false';
    if (!enabled) return [];

    try {
      const res = await fetch(`${baseUrl}/api/v2/alerts`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const alerts = (await res.json()) as AmAlert[];

      const groups = new Map<
        string,
        {
          alertname: string;
          severity: string;
          component: string;
          count: number;
          summary: string;
          firstSeen: string;
          lastSeen: string;
          silenced: boolean;
          pending: boolean;
        }
      >();

      for (const alert of alerts) {
        const state = alert.status?.state ?? 'active';
        if (state === 'suppressed') continue;
        const alertname = alert.labels?.alertname ?? 'UnknownAlert';
        const component = alert.labels?.component ?? 'platform';
        const severity = (alert.labels?.severity ?? 'warning').toLowerCase();
        const key = `${alertname}|${component}|${severity}`;
        const startsAt = alert.startsAt ?? new Date().toISOString();
        const existing = groups.get(key);
        if (existing) {
          existing.count += 1;
          if (startsAt < existing.firstSeen) existing.firstSeen = startsAt;
          if (startsAt > existing.lastSeen) existing.lastSeen = startsAt;
          if (state === 'pending') existing.pending = true;
        } else {
          groups.set(key, {
            alertname,
            severity,
            component,
            count: 1,
            summary: alert.annotations?.summary ?? alertname,
            firstSeen: startsAt,
            lastSeen: startsAt,
            silenced: false,
            pending: state === 'pending',
          });
        }
      }

      return Array.from(groups.values()).sort((a, b) => {
        const rank = (s: string) => (s === 'critical' ? 0 : s === 'warning' ? 1 : 2);
        return rank(a.severity) - rank(b.severity);
      });
    } catch {
      return [];
    }
  }
}
