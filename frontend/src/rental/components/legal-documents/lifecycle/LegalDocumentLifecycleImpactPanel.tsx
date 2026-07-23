import type { LegalDocumentDto } from '../../../../lib/api';
import type { LegalDocumentLifecycleAction } from '../../../lib/legal-document-lifecycle.types';
import {
  buildLifecycleImpactRows,
  formatLegalDocumentTypeLabel,
} from '../../../lib/legal-document-lifecycle.utils';
import { LEGAL_LIFECYCLE_ACTION_CONFIG } from '../../../lib/legal-document-lifecycle.constants';
import { useLanguage } from '../../../i18n/LanguageContext';

interface Props {
  action: LegalDocumentLifecycleAction;
  document: LegalDocumentDto;
  activePeer: LegalDocumentDto | null;
  fourEyesEnabled: boolean;
  fourEyesBlocked: boolean;
}

export function LegalDocumentLifecycleImpactPanel({
  action,
  document,
  activePeer,
  fourEyesEnabled,
  fourEyesBlocked,
}: Props) {
  const { t } = useLanguage();
  const config = LEGAL_LIFECYCLE_ACTION_CONFIG[action];
  const rows = buildLifecycleImpactRows(document, activePeer, action, t);

  return (
    <div className="space-y-4" data-testid="legal-lifecycle-impact-panel">
      <p className="text-[12px] text-muted-foreground">{t(config.descriptionKey)}</p>

      <dl className="divide-y divide-border/60 rounded-lg border border-border/60 text-[12px]">
        <div className="grid gap-1 px-3 py-2 sm:grid-cols-2">
          <dt className="text-muted-foreground">{t('legalDocuments.lifecycle.impact.documentType')}</dt>
          <dd className="font-medium text-foreground">{formatLegalDocumentTypeLabel(document, t)}</dd>
        </div>
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 px-3 py-2 sm:grid-cols-2">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>

      {action === 'revoke' ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          {t('legalDocuments.lifecycle.notice.revoke')}
        </p>
      ) : null}

      {action === 'replace_active' ? (
        <p className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-[11px] text-muted-foreground">
          {t('legalDocuments.lifecycle.notice.replace')}
        </p>
      ) : null}

      {action === 'archive' ? (
        <p className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-[11px] text-muted-foreground">
          {t('legalDocuments.lifecycle.notice.archive')}
        </p>
      ) : null}

      {fourEyesEnabled ? (
        <p
          className={`rounded-lg border px-3 py-2 text-[11px] ${
            fourEyesBlocked
              ? 'border-destructive/30 bg-destructive/5 text-destructive'
              : 'border-border/60 bg-muted/10 text-muted-foreground'
          }`}
          data-testid="legal-lifecycle-four-eyes"
        >
          {t('legalDocuments.lifecycle.notice.fourEyes')}
          {fourEyesBlocked ? t('legalDocuments.lifecycle.notice.fourEyesBlocked') : ''}
        </p>
      ) : null}
    </div>
  );
}
