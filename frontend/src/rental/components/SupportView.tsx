import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type SupportTicket, type SupportTicketCategory, type SupportTicketRelatedEntityType } from '../../lib/api';
import { useSupportPolling } from '../../components/support/useSupportPolling';
import { CreateSupportTicketDialog } from '../../components/support/CreateSupportTicketDialog';
import { useRentalOrg } from '../RentalContext';
import { Sheet, SheetContent } from '../../components/ui/sheet';
import { SupportCenterHero } from './support/SupportCenterHero';
import { SupportTicketDetailPanel } from './support/SupportTicketDetailPanel';
import { SupportTicketInbox } from './support/SupportTicketInbox';
import {
  DEFAULT_TICKET_FILTERS,
  computeSupportStats,
  filterTickets,
  sp,
  type SupportTicketFilters,
} from './support/support-center.utils';

export interface SupportViewProps {
  isDarkMode?: boolean;
  onOpenHelpCenter?: () => void;
  prefilledCategory?: SupportTicketCategory;
  prefilledRelatedEntityType?: SupportTicketRelatedEntityType;
  prefilledRelatedEntityId?: string;
  helpCenterAttempted?: boolean;
  onUnreadCountChange?: (count: number) => void;
}

export function SupportView({
  onOpenHelpCenter,
  prefilledCategory,
  prefilledRelatedEntityType,
  prefilledRelatedEntityId,
  helpCenterAttempted,
  onUnreadCountChange,
}: SupportViewProps) {
  const { orgId } = useRentalOrg();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SupportTicketFilters>(DEFAULT_TICKET_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createCategory, setCreateCategory] = useState<SupportTicketCategory | undefined>(prefilledCategory);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const loadTickets = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!orgId) return;
      try {
        if (!opts?.silent) {
          setLoading(true);
          setLoadError(null);
        }
        const list = await api.support.byOrg(orgId);
        setTickets(list ?? []);
        try {
          const unread = await api.support.unreadCountByOrg(orgId);
          onUnreadCountChange?.(unread.count ?? 0);
        } catch {
          const count = (list ?? []).filter((t) => t.unreadForUser).length;
          onUnreadCountChange?.(count);
        }
      } catch (e) {
        if (!opts?.silent) {
          setTickets([]);
          setLoadError(e instanceof Error ? e.message : 'Unbekannter Fehler');
        }
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [orgId, onUnreadCountChange],
  );

  const refreshSelectedTicket = useCallback(async () => {
    if (!orgId || !selectedId) return;
    try {
      const full = await api.support.getByOrg(orgId, selectedId);
      setSelectedTicket(full);
      setTickets((prev) => prev.map((t) => (t.id === full.id ? { ...t, ...full } : t)));
    } catch {
      /* keep current */
    }
  }, [orgId, selectedId]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useSupportPolling({
    enabled: Boolean(orgId),
    onListRefresh: () => loadTickets({ silent: true }),
    onDetailRefresh: refreshSelectedTicket,
    detailActive: Boolean(selectedId),
  });

  const filteredTickets = useMemo(() => filterTickets(tickets, filters), [tickets, filters]);
  const stats = useMemo(() => computeSupportStats(tickets), [tickets]);

  const openTicket = async (ticket: SupportTicket) => {
    if (!orgId) return;
    setSelectedId(ticket.id);
    setDetailLoading(true);
    if (isMobile) setMobileDetailOpen(true);
    try {
      const full = await api.support.getByOrg(orgId, ticket.id);
      setSelectedTicket(full);
      setTickets((prev) =>
        prev.map((t) =>
          t.id === full.id ? { ...t, ...full, messages: full.messages, unreadForUser: false } : t,
        ),
      );
      void loadTickets({ silent: true });
    } catch {
      setSelectedTicket({ ...ticket, messages: ticket.messages ?? [] });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleTicketUpdate = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, ...ticket } : t)));
    void loadTickets({ silent: true });
  };

  const handleCreated = async (ticket: SupportTicket) => {
    await loadTickets();
    void openTicket(ticket);
  };

  const openCreate = (category?: SupportTicketCategory) => {
    setCreateCategory(category ?? prefilledCategory);
    setCreateOpen(true);
  };

  const closeMobileDetail = () => {
    setMobileDetailOpen(false);
    setSelectedId(null);
    setSelectedTicket(null);
    void loadTickets({ silent: true });
  };

  return (
    <div className={sp.shell}>
      <SupportCenterHero
        stats={stats}
        loading={loading}
        onCreateTicket={() => openCreate()}
        onOpenHelpCenter={onOpenHelpCenter}
        onQuickCategory={(category) => openCreate(category)}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(380px,440px)]">
        <SupportTicketInbox
          tickets={filteredTickets}
          selectedId={selectedId}
          loading={loading}
          error={loadError}
          filters={filters}
          onFiltersChange={setFilters}
          onSelect={(t) => void openTicket(t)}
          onCreateTicket={() => openCreate()}
          onRetry={() => void loadTickets()}
          hasAnyTickets={tickets.length > 0}
        />

        <div className="hidden lg:flex lg:min-h-[520px]">
          <SupportTicketDetailPanel
            className="w-full"
            ticket={selectedTicket}
            orgId={orgId ?? ''}
            loading={detailLoading && !selectedTicket}
            onTicketUpdate={handleTicketUpdate}
          />
        </div>
      </div>

      <Sheet open={mobileDetailOpen && isMobile} onOpenChange={(open: boolean) => !open && closeMobileDetail()}>
        <SheetContent side="right" className="w-full max-w-none border-l p-0 sm:max-w-full">
          <SupportTicketDetailPanel
            className="h-full rounded-none border-0 shadow-none"
            ticket={selectedTicket}
            orgId={orgId ?? ''}
            loading={detailLoading && !selectedTicket}
            onTicketUpdate={handleTicketUpdate}
            onClose={closeMobileDetail}
          />
        </SheetContent>
      </Sheet>

      <CreateSupportTicketDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId ?? ''}
        defaultCategory={createCategory}
        relatedEntityType={prefilledRelatedEntityType}
        relatedEntityId={prefilledRelatedEntityId}
        helpCenterAttempted={helpCenterAttempted}
        onOpenHelpCenter={onOpenHelpCenter}
        onCreated={(t) => void handleCreated(t)}
      />
    </div>
  );
}
