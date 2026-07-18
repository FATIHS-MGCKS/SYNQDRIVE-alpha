import type { ReactNode } from 'react';
import { AlertTriangle, Clock, MapPin, ShieldOff } from 'lucide-react';
import { EmptyState, ErrorState, SkeletonCard, SkeletonMetricGrid } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  resolveStationContextBanners,
  StationViewStateKind,
  type StationContextBanner,
  type StationFetchResolution,
} from '../../lib/station-view-state';

type BoundaryProps = {
  resolution: StationFetchResolution;
  onRetry?: () => void;
  loadingSkeleton?: 'card' | 'metrics' | 'none';
  emptyIcon?: ReactNode;
  emptyTitleKey: TranslationKey;
  emptyDescriptionKey: TranslationKey;
  children: ReactNode;
};

export function StationFetchStateBoundary({
  resolution,
  onRetry,
  loadingSkeleton = 'card',
  emptyIcon,
  emptyTitleKey,
  emptyDescriptionKey,
  children,
}: BoundaryProps) {
  const { t } = useLanguage();

  if (resolution.kind === StationViewStateKind.LOADING) {
    if (loadingSkeleton === 'metrics') {
      return <SkeletonMetricGrid count={4} />;
    }
    if (loadingSkeleton === 'card') {
      return <SkeletonCard className="h-48 w-full" />;
    }
    return null;
  }

  if (resolution.kind === StationViewStateKind.PERMISSION_DENIED) {
    return (
      <EmptyState
        icon={<ShieldOff className="w-8 h-8" />}
        title={t('stations.state.permissionDeniedTitle')}
        description={t('stations.state.permissionDeniedDescription')}
      />
    );
  }

  if (resolution.kind === StationViewStateKind.NOT_FOUND) {
    return (
      <EmptyState
        icon={<MapPin className="w-8 h-8" />}
        title={t('stations.state.notFoundTitle')}
        description={resolution.error?.message ?? t('stations.state.notFoundDescription')}
      />
    );
  }

  if (resolution.kind === StationViewStateKind.API_ERROR) {
    return (
      <ErrorState
        title={t('stations.state.apiErrorTitle')}
        description={resolution.error?.message ?? t('stations.state.apiErrorDescription')}
        onRetry={onRetry}
        retryLabel={t('stations.partialData.retry')}
      />
    );
  }

  if (resolution.kind === StationViewStateKind.EMPTY) {
    return (
      <EmptyState
        icon={emptyIcon ?? <MapPin className="w-8 h-8" />}
        title={t(emptyTitleKey)}
        description={t(emptyDescriptionKey)}
      />
    );
  }

  return <>{children}</>;
}

type BannerProps = {
  banners: StationContextBanner[];
  onRetry?: () => void;
  className?: string;
};

export function StationContextBanners({ banners, onRetry, className }: BannerProps) {
  const { t, locale } = useLanguage();
  if (banners.length === 0) return null;

  return (
    <div className={className ?? 'space-y-2'}>
      {banners.map((banner) => (
        <StationContextBannerRow key={banner.kind} banner={banner} locale={locale} t={t} onRetry={onRetry} />
      ))}
    </div>
  );
}

function StationContextBannerRow({
  banner,
  locale,
  t,
  onRetry,
}: {
  banner: StationContextBanner;
  locale: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onRetry?: () => void;
}) {
  const toneClass = 'border-[color:var(--status-watch)]/35 bg-[color:var(--status-watch)]/[0.04]';

  const titleKey = {
    partial_data: 'stations.state.partialDataTitle',
    stale_data: 'stations.state.staleDataTitle',
    archived: 'stations.state.archivedTitle',
    configuration_incomplete: 'stations.state.configurationIncompleteTitle',
  }[banner.kind] as TranslationKey;

  const descriptionKey = {
    partial_data: 'stations.state.partialDataDescription',
    stale_data: 'stations.state.staleDataDescription',
    archived: 'stations.state.archivedDescription',
    configuration_incomplete: 'stations.state.configurationIncompleteDescription',
  }[banner.kind] as TranslationKey;

  const evaluatedLabel =
    banner.evaluatedAt != null
      ? new Date(banner.evaluatedAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB')
      : null;

  return (
    <div
      role="status"
      className={`rounded-xl border px-4 py-3 text-sm text-muted-foreground flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 ${toneClass}`}
    >
      <div className="flex items-start gap-2 min-w-0">
        {banner.kind === 'stale_data' ? (
          <Clock className="w-4 h-4 shrink-0 mt-0.5 text-[color:var(--status-watch)]" aria-hidden />
        ) : (
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[color:var(--status-watch)]" aria-hidden />
        )}
        <span className="min-w-0">
          <span className="block font-semibold text-foreground">{t(titleKey)}</span>
          <span className="block mt-0.5">
            {banner.detail ?? t(descriptionKey, evaluatedLabel ? { evaluatedAt: evaluatedLabel } : undefined)}
          </span>
        </span>
      </div>
      {onRetry && (banner.kind === 'partial_data' || banner.kind === 'stale_data') ? (
        <button type="button" className="text-xs font-semibold underline shrink-0" onClick={onRetry}>
          {t('stations.partialData.retry')}
        </button>
      ) : null}
    </div>
  );
}

export function useStationContextBanners(input: Parameters<typeof resolveStationContextBanners>[0]) {
  return resolveStationContextBanners(input);
}

