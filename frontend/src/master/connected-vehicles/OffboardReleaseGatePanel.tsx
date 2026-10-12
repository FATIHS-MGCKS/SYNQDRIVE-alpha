import { ShieldAlert } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  evaluateMasterOffboardUiGate,
  PRODUCTION_BACKEND_OFFBOARD_ROUTE_VERIFIED_DOC,
} from './vo5c-release-gates';

export function OffboardReleaseGatePanel() {
  const { t } = useLanguage();
  const gate = evaluateMasterOffboardUiGate();

  const rows: { key: TranslationKey; ok: boolean }[] = [
    { key: 'master.cv.release.gate.uiFlag', ok: gate.uiFlagOn },
    { key: 'master.cv.release.gate.routeVerified', ok: gate.backendRouteVerified },
    { key: 'master.cv.release.gate.attestation', ok: gate.releaseAttestationMatch },
  ];

  return (
    <div
      className="border-t border-border pt-4 space-y-3"
      data-testid="offboard-release-gate-panel"
      role="status"
    >
      <div className="rounded-xl border border-[color:var(--status-warning)]/35 bg-muted/30 p-4 flex gap-3">
        <ShieldAlert className="h-5 w-5 shrink-0 text-[color:var(--status-warning)]" aria-hidden />
        <div className="space-y-2 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {t('master.cv.release.offboardDisabledTitle')}
          </p>
          <p className="text-xs text-muted-foreground">{t('master.cv.release.offboardDisabledDescription')}</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
            {rows.map((row) => (
              <li key={row.key}>
                {t(row.key)}:{' '}
                <span className={row.ok ? 'text-[color:var(--status-success)]' : 'text-[color:var(--status-warning)]'}>
                  {row.ok ? t('master.cv.release.gate.ok') : t('master.cv.release.gate.missing')}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground font-mono break-all">{PRODUCTION_BACKEND_OFFBOARD_ROUTE_VERIFIED_DOC}</p>
        </div>
      </div>
    </div>
  );
}
