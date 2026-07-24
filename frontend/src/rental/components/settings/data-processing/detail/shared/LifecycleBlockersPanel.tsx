import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { StatusChip } from '../../../../../../components/patterns';
import { useLanguage } from '../../../../../i18n/LanguageContext';

interface Props {
  blockingGaps?: string[];
  warnings?: string[];
  dpiaStatus?: string;
  dpaBlockers?: string[];
}

export function LifecycleBlockersPanel({
  blockingGaps,
  warnings,
  dpiaStatus,
  dpaBlockers,
}: Props) {
  const { t } = useLanguage();
  const gaps = blockingGaps ?? [];
  const warns = warnings ?? [];
  const dpa = dpaBlockers ?? [];
  const dpiaBlocked =
    dpiaStatus === 'DPIA_REQUIRED' ||
    dpiaStatus === 'DPIA_REVIEW_DUE' ||
    dpiaStatus === 'REQUIRED_NOT_DONE' ||
    dpiaStatus === 'BLOCKED';

  if (!gaps.length && !warns.length && !dpa.length && !dpiaBlocked) return null;

  return (
    <div className="space-y-2" role="region" aria-label={t('dataProcessing.detail.blockers.aria')}>
      {dpiaBlocked ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" aria-hidden />
          <div>
            <p className="text-[12px] font-semibold">{t('dataProcessing.detail.blockers.dpia')}</p>
            <StatusChip tone="watch" className="mt-1.5">
              {dpiaStatus}
            </StatusChip>
          </div>
        </div>
      ) : null}

      {dpa.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-[12px] font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" aria-hidden />
            {t('dataProcessing.detail.blockers.dpa')}
          </p>
          <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground list-disc pl-4">
            {dpa.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {gaps.length > 0 ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-[12px] font-semibold text-destructive">{t('dataProcessing.detail.blockers.gaps')}</p>
          <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground list-disc pl-4">
            {gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {warns.length > 0 ? (
        <div className="rounded-xl border border-border/70 p-3">
          <p className="text-[12px] font-semibold">{t('dataProcessing.detail.blockers.warnings')}</p>
          <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground list-disc pl-4">
            {warns.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
