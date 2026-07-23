import { ClipboardCheck, RefreshCw, SearchCheck, Upload } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { PageHeader, StatusChip } from '../../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { RentalRulesHeaderMeta } from './rental-rules-matrix.utils';

interface RentalRulesPageHeaderProps {
  meta: RentalRulesHeaderMeta;
  loading: boolean;
  canWrite: boolean;
  canPublish: boolean;
  onRefresh: () => void;
  onEditDefaults: () => void;
  onCreateCategory: () => void;
  onPublish: () => void;
  onCheckBooking?: () => void;
}

function formatPublishedAt(value: string | null, locale: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function RentalRulesPageHeader({
  meta,
  loading,
  canWrite,
  canPublish,
  onRefresh,
  onEditDefaults,
  onCreateCategory,
  onPublish,
  onCheckBooking,
}: RentalRulesPageHeaderProps) {
  const { t, locale } = useLanguage();

  return (
    <PageHeader
      variant="full"
      eyebrow={t('rentalRules.ui.eyebrow')}
      title={t('rentalRules.ui.title')}
      description={t('rentalRules.ui.description')}
      status={
        <StatusChip tone={meta.rulesActive ? 'success' : 'watch'} dot>
          {meta.rulesActive ? t('rentalRules.ui.status.active') : t('rentalRules.ui.status.inactive')}
        </StatusChip>
      }
      meta={
        <dl className="grid gap-2 text-[12px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="sq-section-label">{t('rentalRules.ui.meta.version')}</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-foreground">v{meta.activeVersion}</dd>
          </div>
          <div>
            <dt className="sq-section-label">{t('rentalRules.ui.meta.publishedAt')}</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {formatPublishedAt(meta.publishedAt, locale)}
            </dd>
          </div>
          <div>
            <dt className="sq-section-label">{t('rentalRules.ui.meta.affectedVehicles')}</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-foreground">{meta.affectedVehicleCount}</dd>
          </div>
          <div>
            <dt className="sq-section-label">{t('rentalRules.ui.meta.openDrafts')}</dt>
            <dd className="mt-0.5 font-medium tabular-nums text-foreground">{meta.unpublishedDraftCount}</dd>
          </div>
        </dl>
      }
      icon={
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/50 text-[var(--brand)]">
          <ClipboardCheck className="h-5 w-5" aria-hidden />
        </div>
      }
      actions={
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            title={t('rentalRules.ui.actions.refresh')}
            aria-label={t('rentalRules.ui.actions.refresh')}
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} />
          </Button>
          {onCheckBooking ? (
            <Button type="button" variant="neutral" size="sm" onClick={onCheckBooking}>
              <SearchCheck />
              {t('rentalRules.ui.actions.checkBooking')}
            </Button>
          ) : null}
          {canPublish && meta.unpublishedDraftCount > 0 ? (
            <Button type="button" variant="neutral" size="sm" onClick={onPublish}>
              <Upload />
              {t('rentalRules.ui.actions.publishChanges')}
            </Button>
          ) : null}
          {canWrite ? (
            <>
              <Button type="button" variant="neutral" size="sm" onClick={onEditDefaults}>
                {t('rentalRules.ui.actions.editDefaults')}
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={onCreateCategory}>
                {t('rentalRules.ui.actions.createCategory')}
              </Button>
            </>
          ) : null}
        </div>
      }
    />
  );
}
