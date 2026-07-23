import { AlertTriangle, Info } from 'lucide-react';
import { DataCard, SectionHeader, StatusChip } from '../../../components/patterns';
import type { LegalDocumentConfigAlert } from '../../lib/legal-documents-overview';
import { useLanguage } from '../../i18n/LanguageContext';

interface Props {
  alerts: LegalDocumentConfigAlert[];
}

function alertTone(severity: LegalDocumentConfigAlert['severity']) {
  if (severity === 'critical') return 'critical' as const;
  if (severity === 'warning') return 'watch' as const;
  return 'info' as const;
}

export function LegalDocumentConfigAlerts({ alerts }: Props) {
  const { t } = useLanguage();

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      <SectionHeader
        title={t('legalDocuments.alerts.title')}
        description={t('legalDocuments.alerts.description')}
        as="label"
      />
      <DataCard flush bodyClassName="divide-y divide-border/60">
        {alerts.map((alert) => (
          <div key={alert.id} className="flex items-start gap-3 px-4 py-3">
            <div className="mt-0.5 text-muted-foreground">
              {alert.severity === 'info' ? (
                <Info className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] font-medium text-foreground">{alert.title}</p>
                <StatusChip tone={alertTone(alert.severity)}>
                  {alert.severity === 'critical'
                    ? t('legalDocuments.alerts.severity.critical')
                    : alert.severity === 'warning'
                      ? t('legalDocuments.alerts.severity.warning')
                      : t('legalDocuments.alerts.severity.info')}
                </StatusChip>
              </div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{alert.detail}</p>
            </div>
          </div>
        ))}
      </DataCard>
    </div>
  );
}
