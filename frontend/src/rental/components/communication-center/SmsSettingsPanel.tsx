import { StatusChip } from '../../../components/patterns';
import { Skeleton } from '../../../components/ui/skeleton';
import { ErrorState } from '../../../components/patterns/states';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { resolveSmsSettingsStatus } from './communication-settings-status';
import { useSmsSettings } from './useSmsSettings';

interface SmsSettingsPanelProps {
  enabled?: boolean;
}

export function SmsSettingsPanel({ enabled = true }: SmsSettingsPanelProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const { config, loading, error, reload } = useSmsSettings({ orgId, enabled });
  const status = resolveSmsSettingsStatus(config);

  if (loading) {
    return (
      <div className="space-y-3" data-testid="sms-settings-loading">
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        compact
        title={t('communication.settings.loadError')}
        error={t('communication.settings.sms.loadError')}
        onRetry={() => void reload()}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="sms-settings-panel">
      <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">
              {t('communication.settings.sms.title')}
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('communication.settings.sms.description')}
            </p>
          </div>
          <StatusChip tone={status === 'NOT_CONFIGURED' ? 'watch' : status === 'DEGRADED' ? 'critical' : 'success'}>
            {t(`communication.settings.status.${status}` as const)}
          </StatusChip>
        </div>

        <dl className="mt-4 grid gap-3 text-[11px] sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t('communication.settings.provider')}</dt>
            <dd className="font-medium text-foreground">sent.dm</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('communication.settings.sms.credentials')}</dt>
            <dd className="font-medium text-foreground">
              {config?.credentialsConfigured
                ? t('communication.settings.credentialsConfigured')
                : t('communication.settings.credentialsMissing')}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('communication.settings.sms.webhook')}</dt>
            <dd className="font-medium text-foreground">
              {config?.webhookConfigured
                ? t('communication.settings.configured')
                : t('communication.settings.notConfigured')}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t('communication.settings.sms.sender')}</dt>
            <dd className="font-medium text-foreground">
              {config?.senderProfileConfigured
                ? t('communication.settings.configured')
                : t('communication.settings.notConfigured')}
            </dd>
          </div>
        </dl>

        {!config?.credentialsConfigured && (
          <p className="mt-4 text-[11px] text-muted-foreground">
            {t('communication.settings.sms.notConfiguredHelp')}
          </p>
        )}
      </section>
    </div>
  );
}
