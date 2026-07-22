import type { LegalDocumentDto } from '../../../../lib/api';
import type { LegalDocumentLifecycleAction } from '../../../lib/legal-document-lifecycle.types';
import { buildLifecycleImpactRows, formatLegalDocumentTypeLabel } from '../../../lib/legal-document-lifecycle.utils';
import { LEGAL_LIFECYCLE_ACTION_CONFIG } from '../../../lib/legal-document-lifecycle.constants';

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
  const config = LEGAL_LIFECYCLE_ACTION_CONFIG[action];
  const rows = buildLifecycleImpactRows(document, activePeer, action);

  return (
    <div className="space-y-4" data-testid="legal-lifecycle-impact-panel">
      <p className="text-[12px] text-muted-foreground">{config.description}</p>

      <dl className="divide-y divide-border/60 rounded-lg border border-border/60 text-[12px]">
        <div className="grid gap-1 px-3 py-2 sm:grid-cols-2">
          <dt className="text-muted-foreground">Dokumenttyp</dt>
          <dd className="font-medium text-foreground">{formatLegalDocumentTypeLabel(document)}</dd>
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
          Widerruf ist rechtlich anders als eine Ersetzung: bestehende Verträge bleiben gebunden, neue
          Buchungen erhalten diese Version nicht mehr.
        </p>
      ) : null}

      {action === 'replace_active' ? (
        <p className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-[11px] text-muted-foreground">
          Die bisher aktive Version wird als „Ersetzt“ markiert — kein Widerruf, keine Löschung.
        </p>
      ) : null}

      {action === 'archive' ? (
        <p className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-[11px] text-muted-foreground">
          Archivierte Versionen bleiben in Snapshots und Nachweisen sichtbar. Es werden keine Dateien gelöscht.
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
          Vier-Augen-Prinzip ist aktiv: Freigabe und Aktivierung dürfen nicht durch dieselbe Person
          erfolgen, die hochgeladen oder zur Prüfung eingereicht hat.
          {fourEyesBlocked ? ' Sie sind für diese Aktion gesperrt.' : ''}
        </p>
      ) : null}
    </div>
  );
}
