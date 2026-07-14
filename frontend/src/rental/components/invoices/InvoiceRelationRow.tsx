import type { KeyboardEvent } from 'react';
import { Building2, Calendar, ChevronRight, Tag, User } from 'lucide-react';

import type { InvoiceEntityRelation } from './invoiceDetailTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';

export interface InvoiceRelationRowProps extends Pick<InvoiceThemeClasses, 'tp' | 'ts' | 'isDarkMode'> {
  relation: InvoiceEntityRelation;
  onNavigate?: (relation: InvoiceEntityRelation) => void;
}

const RELATION_ICONS = {
  customer: User,
  booking: Calendar,
  vehicle: Tag,
  vendor: Building2,
} as const;

export function InvoiceRelationRow({
  relation,
  onNavigate,
  isDarkMode,
  tp,
  ts,
}: InvoiceRelationRowProps) {
  const interactive = relation.navigable && Boolean(onNavigate);
  const RowIcon = RELATION_ICONS[relation.kind];

  const handleActivate = () => {
    if (!interactive || !onNavigate) return;
    onNavigate(relation);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!interactive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate();
    }
  };

  const secondaryLine = [relation.secondary, relation.tertiary].filter(Boolean).join(' · ');

  const content = (
    <>
      <RowIcon className={`w-4 h-4 mt-0.5 ${ts} shrink-0`} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className={`text-[10px] ${ts} uppercase tracking-wider font-semibold`}>{relation.label}</p>
        <p className={`text-xs mt-0.5 font-medium truncate ${tp}`}>{relation.primary}</p>
        {secondaryLine && (
          <p className={`text-[11px] mt-0.5 truncate ${ts}`}>{secondaryLine}</p>
        )}
        {!interactive && relation.navigationBlockedReason && (
          <p className={`text-[10px] mt-1 ${ts}`}>{relation.navigationBlockedReason}</p>
        )}
      </div>
      {interactive && (
        <ChevronRight className={`w-4 h-4 shrink-0 self-center ${ts} opacity-60`} aria-hidden />
      )}
    </>
  );

  const rowClass = [
    'flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-lg transition-colors w-full text-left',
    interactive
      ? isDarkMode
        ? 'cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'
        : 'cursor-pointer hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30'
      : '',
  ].join(' ');

  if (interactive) {
    return (
      <button
        type="button"
        className={rowClass}
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
        aria-label={`${relation.label}: ${relation.primary}`}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={rowClass} role="group" aria-label={relation.label}>
      {content}
    </div>
  );
}
