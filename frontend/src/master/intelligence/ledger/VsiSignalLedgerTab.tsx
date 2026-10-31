import { useMemo } from 'react';
import { MasterTableShell } from '../../shell/MasterTableShell';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { MasterVsiProfileDetailDto } from '../vsi-master-intelligence-api.types';
import { filterSignalsForLedger } from '../vsi-ledger-filter.util';
import type { VsiLedgerFilterState } from '../vsi-ledger-url.types';
import { SignalLedgerFilterBar } from './SignalLedgerFilterBar';
import { SignalLedgerTable } from './SignalLedgerTable';

export type VsiSignalLedgerTabProps = {
  profile: MasterVsiProfileDetailDto;
  multiLinkCount: number;
  filters: VsiLedgerFilterState;
  onFiltersChange: (patch: Partial<VsiLedgerFilterState>) => void;
  onFiltersClear: () => void;
  selectedSignalKey: string | null;
  onSelectSignal: (canonicalSignalKey: string) => void;
  formatTimestamp: (iso: string | null | undefined) => string;
};

export function VsiSignalLedgerTab({
  profile,
  multiLinkCount,
  filters,
  onFiltersChange,
  onFiltersClear,
  selectedSignalKey,
  onSelectSignal,
  formatTimestamp,
}: VsiSignalLedgerTabProps) {
  const { t } = useLanguage();
  const filtered = useMemo(
    () => filterSignalsForLedger(profile.signals, filters),
    [profile.signals, filters],
  );

  const effectiveSelected =
    selectedSignalKey && filtered.some((s) => s.canonicalSignalKey === selectedSignalKey)
      ? selectedSignalKey
      : selectedSignalKey && profile.signals.some((s) => s.canonicalSignalKey === selectedSignalKey)
        ? null
        : selectedSignalKey;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('master.intelligence.vsi.signals.intro' as never)}</p>
      {multiLinkCount > 1 ? (
        <p className="text-[11px] text-muted-foreground" role="status">
          {t('master.intelligence.vsi.ledger.multiLinkNotice' as never, { count: multiLinkCount })}
        </p>
      ) : null}
      <MasterTableShell
        toolbar={
          <SignalLedgerFilterBar
            filters={filters}
            onChange={onFiltersChange}
            onClear={onFiltersClear}
            resultCount={filtered.length}
            totalCount={profile.signals.length}
          />
        }
      >
        <SignalLedgerTable
          profile={profile}
          signals={filtered}
          selectedSignalKey={effectiveSelected}
          onSelectSignal={onSelectSignal}
          formatTimestamp={formatTimestamp}
        />
      </MasterTableShell>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {t('master.intelligence.vsi.ledger.footerMeta' as never, {
          count: profile.signals.length,
          revision: profile.profileRevision,
        })}
      </p>
    </div>
  );
}
