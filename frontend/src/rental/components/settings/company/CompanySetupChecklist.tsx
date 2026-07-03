import {
  ArrowRight,
  Building2,
  CreditCard,
  FileText,
  ImageIcon,
  Mail,
  MapPin,
} from 'lucide-react';
import { StatusChip } from '../../../../components/patterns';
import { Button } from '../../../../components/ui/button';
import type { CompanySection, SetupCheckItem, SetupItemStatus } from './company-utils';
import { SETUP_STATUS_LABEL } from './company-utils';

const ICONS: Record<string, typeof Building2> = {
  company: Building2,
  billing: CreditCard,
  branding: ImageIcon,
  legal: FileText,
  station: MapPin,
  contact: Mail,
};

const TONE: Record<SetupItemStatus, 'success' | 'warning' | 'neutral'> = {
  done: 'success',
  missing: 'warning',
  review: 'neutral',
};

interface CompanySetupChecklistProps {
  items: SetupCheckItem[];
  onNavigate: (section: CompanySection) => void;
  onManageDocuments?: () => void;
  onNavigateToStations?: () => void;
}

export function CompanySetupChecklist({
  items,
  onNavigate,
  onManageDocuments,
  onNavigateToStations,
}: CompanySetupChecklistProps) {
  const handleCta = (item: SetupCheckItem) => {
    if (item.id === 'legal' && onManageDocuments) {
      onManageDocuments();
    } else if (item.id === 'station' && onNavigateToStations) {
      onNavigateToStations();
    } else if (item.ctaSection) {
      onNavigate(item.ctaSection);
    }
  };

  const showCta = (item: SetupCheckItem) =>
    Boolean(
      item.ctaLabel &&
        (item.id === 'legal'
          ? onManageDocuments
          : item.id === 'station'
            ? onNavigateToStations
            : item.ctaSection),
    );

  return (
    <div className="sq-card overflow-hidden">
      <div className="border-b border-border/70 px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Einrichtungsstatus</h3>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Voraussetzungen für Rechnungen, Dokumente und Kommunikation.
        </p>
      </div>
      <ul className="divide-y divide-border/60">
        {items.map((item) => {
          const Icon = ICONS[item.id] ?? Building2;
          return (
            <li
              key={item.id}
              className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{item.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2 pl-10 sm:pl-0">
                <StatusChip tone={TONE[item.status]}>
                  {SETUP_STATUS_LABEL[item.status]}
                </StatusChip>
                {showCta(item) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-[11px]"
                    onClick={() => handleCta(item)}
                  >
                    {item.ctaLabel}
                    <ArrowRight />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
