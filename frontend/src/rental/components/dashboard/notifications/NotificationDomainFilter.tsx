import { useState } from 'react';
import { Icon } from '../../ui/Icon';
import { Popover, PopoverContent, PopoverTrigger } from '../../../../components/ui/popover';
import { cn } from '../../../../components/ui/utils';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import {
  NOTIFICATION_DOMAIN_FILTERS,
  type NotificationDomainFilter,
} from './notificationPanelTypes';
import type { useLanguage } from '../../../i18n/LanguageContext';

const DOMAIN_LABEL_KEYS: Record<NotificationDomainFilter, string> = {
  operations: 'notification.domain.operations',
  'vehicle-health': 'notification.domain.vehicleHealth',
  'driving-analysis': 'notification.domain.drivingAnalysis',
  bookings: 'notification.domain.bookings',
  handovers: 'notification.domain.handovers',
  documents: 'notification.domain.documents',
  billing: 'notification.domain.billing',
  system: 'notification.domain.system',
};

export function NotificationDomainFilter({
  value,
  t,
  onChange,
}: {
  value: NotificationDomainFilter | null;
  t: ReturnType<typeof useLanguage>['t'];
  onSelect?: (domain: NotificationDomainFilter | null) => void;
  onChange: (domain: NotificationDomainFilter | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            NOTIFICATION_PANEL_TYPO.filterButton,
            'sq-press inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border/40 px-2.5 text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
            value && 'border-[color:color-mix(in_srgb,var(--brand)_25%,var(--border))] text-foreground',
          )}
          aria-label={t('notification.filter.title')}
        >
          <Icon name="filter" className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">
            {value ? t(DOMAIN_LABEL_KEYS[value] as never) : t('notification.filter.title')}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mb-2 px-1 font-semibold text-foreground')}>
          {t('notification.filter.title')}
        </p>
        <div className="flex flex-col gap-0.5">
          {NOTIFICATION_DOMAIN_FILTERS.map((domain) => {
            const selected = value === domain;
            return (
              <button
                key={domain}
                type="button"
                onClick={() => {
                  onChange(selected ? null : domain);
                  setOpen(false);
                }}
                className={cn(
                  'flex min-h-11 items-center rounded-md px-2.5 text-left text-xs leading-4 transition-colors hover:bg-muted/50',
                  selected && 'bg-muted/60 font-medium text-foreground',
                )}
              >
                {t(DOMAIN_LABEL_KEYS[domain] as never)}
              </button>
            );
          })}
        </div>
        {value ? (
          <button
            type="button"
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded-md text-xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            {t('notification.filter.clear')}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
