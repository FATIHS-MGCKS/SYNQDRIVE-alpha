import type { IamMfaState, IamRiskClassification } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { MFA_STATE_LABEL, RISK_LABEL } from './iam-team.utils';

const MFA_TONE: Record<IamMfaState, string> = {
  ENABLED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  DISABLED: 'bg-muted text-muted-foreground border-border',
  REQUIRED: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40',
  UNKNOWN: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-dashed border-slate-400/50',
  NOT_SUPPORTED: 'bg-muted/60 text-muted-foreground border-border border-dashed',
  ACTION_REQUIRED: 'bg-orange-500/15 text-orange-800 dark:text-orange-200 border-orange-500/40',
};

const RISK_TONE: Record<IamRiskClassification, string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
  HIGH: 'bg-orange-500/15 text-orange-800 dark:text-orange-200',
  CRITICAL: 'bg-red-500/15 text-red-700 dark:text-red-300',
};

export function MfaStateBadge({ state }: { state: IamMfaState }) {
  const { t } = useLanguage();
  const label = t(MFA_STATE_LABEL[state]);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${MFA_TONE[state]}`}
      aria-label={t('iam.a11y.statusBadge', { label })}
    >
      <span className="sr-only">{label}</span>
      <span aria-hidden>{label}</span>
    </span>
  );
}

export function RiskBadge({ level }: { level: IamRiskClassification }) {
  const { t } = useLanguage();
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${RISK_TONE[level]}`}>
      {t(RISK_LABEL[level])}
    </span>
  );
}
