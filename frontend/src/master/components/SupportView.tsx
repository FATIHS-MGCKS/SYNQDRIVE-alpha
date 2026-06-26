import { useCallback, useEffect, useMemo, useState } from 'react';
import { Headphones } from 'lucide-react';
import { PageHeader } from '../../components/patterns/page-header';
import { Sheet, SheetContent } from '../../components/ui/sheet';
import { useSupportPolling } from '../../components/support/useSupportPolling';
import { api, type SupportTicket, type SupportTicketStats } from '../../lib/api';
import { getStoredUser } from '../../lib/auth';
import { SupportOpsInbox } from './support-ops/SupportOpsInbox';
import { SupportOpsKpis } from './support-ops/SupportOpsKpis';
import { SupportOpsQueue, SupportOpsQueueMobile } from './support-ops/SupportOpsQueue';
import { SupportOpsWorkspace } from './support-ops/SupportOpsWorkspace';
import {
  DEFAULT_INBOX_FILTERS,
  buildTicketListParams,
  sop,
  type SupportInboxFilters,
  type SupportQueueId,
} from './support-ops/support-ops.utils';

export interface SupportViewProps {
  isDarkMode?: boolean;
  organizations?: Array<{ id: string; name: string; companyName?: string }>;
  onNavigateToOrg?: (orgId: string) => void;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function SupportView({ organizations = [], onNavigateToOrg }: SupportViewProps) {
  const currentUser = getStoredUser();

  const [stats, setStats] = useState<SupportTicketStats | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [queue, setQueue] = useState<SupportQueueId>('all_open');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);
  const [filters, setFilters] = useState<SupportInboxFilters>(DEFAULT_INBOX_FILTERS);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [assignees, setAssignees] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1279px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    void api.users
      .listAll()
      .then((users) => {
        const masters = (users ?? [])
          .filter((u: { platformRole?: string; role?: string }) => {
            const role = String(u.platformRole ?? u.role ?? '').toUpperCase();
            return role.includes('MASTER');
          })
          .map((u: { id: string; name?: string; email?: string }) => ({
            id: u.id,
            name: u.name || u.email || u.id.slice(0, 8),
          }));
        setAssignees(masters);
      })
      .catch(() => setAssignees([]));
  }, []);

  const orgOptions = useMemo(
    () =>
      organizations.map((o) => ({
        id: o.id,
        name: o.name || o.companyName || o.id.slice(0, 8),
      })),
    [organizations],
  );

  const orgNameById = useCallback(
    (id: string) => orgOptions.find((o) => o.id === id)?.name ?? id.slice(0, 8),
    [orgOptions],
  );

  const assigneeName = useCallback(
    (id: string | null | undefined) => {
      if (!id) return 'Nicht zugewiesen';
      return assignees.find((a) => a.id === id)?.name ?? id.slice(0, 8);
    },
    [assignees],
  );

  const loadStats = useCallback(async () => {
    try {
      const res = await api.support.stats();
      setStats(res);
    } catch {
      setStats(null);
    }
  }, []);

  const loadTickets = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) {
        setLoading(true);
        setListError(null);
      }
      const params = buildTicketListParams(queue, filters, debouncedSearch, page, currentUser?.id);
      const res = await api.support.tickets(params);
      setTickets(res.data ?? []);
      setTotal(res.meta?.total ?? res.data?.length ?? 0);
      setTotalPages(res.meta?.totalPages ?? 1);
    } catch (e) {
      if (!opts?.silent) {
        setTickets([]);
        setListError(e instanceof Error ? e.message : 'Unbekannter Fehler');
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [queue, filters, debouncedSearch, page, currentUser?.id]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const refreshSelectedTicket = useCallback(async () => {
    if (!selectedId) return;
    try {
      const full = await api.support.getTicket(selectedId);
      setSelectedTicket(full);
      setTickets((prev) => prev.map((t) => (t.id === full.id ? { ...t, ...full } : t)));
    } catch {
      /* keep current */
    }
  }, [selectedId]);

  useSupportPolling({
    enabled: true,
    onListRefresh: () => {
      void loadTickets({ silent: true });
      void loadStats();
    },
    onDetailRefresh: refreshSelectedTicket,
    detailActive: Boolean(selectedId),
  });

  useEffect(() => {
    setPage(1);
  }, [queue, filters, debouncedSearch]);

  const openTicket = async (ticket: SupportTicket) => {
    setSelectedId(ticket.id);
    setDetailLoading(true);
    setDetailError(null);
    if (isMobile) setMobileWorkspaceOpen(true);
    try {
      const full = await api.support.getTicket(ticket.id);
      setSelectedTicket(full);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Laden fehlgeschlagen');
      setSelectedTicket({ ...ticket, messages: ticket.messages ?? [] });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleTicketUpdate = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setTickets((prev) => prev.map((t) => (t.id === ticket.id ? { ...t, ...ticket } : t)));
    void loadTickets();
    void loadStats();
  };

  const closeMobileWorkspace = () => {
    setMobileWorkspaceOpen(false);
    setSelectedId(null);
    setSelectedTicket(null);
    void loadTickets();
    void loadStats();
  };

  const queueCounts = useMemo(
    () =>
      ({
        all_open: stats?.totalOpen,
        new: stats?.open,
        critical: stats?.criticalOpen,
        waiting_support: stats?.unreadForAdmin,
        waiting_customer: stats?.waitingForCustomer ?? stats?.waiting,
        unread: stats?.unreadForAdmin,
        resolved: stats?.resolved,
        closed: stats?.closed,
      }) satisfies Partial<Record<SupportQueueId, number>>,
    [stats],
  );

  return (
    <div className={sop.shell}>
      <PageHeader
        title="Support Operations"
        icon={<Headphones className="h-4 w-4 text-[color:var(--brand)]" />}
      />

      <SupportOpsKpis stats={stats} loading={loading && !stats} />

      <SupportOpsQueueMobile activeQueue={queue} onQueueChange={setQueue} />

      <div className="flex min-h-0 flex-1 gap-3">
        <SupportOpsQueue activeQueue={queue} onQueueChange={setQueue} counts={queueCounts} />

        <SupportOpsInbox
          tickets={tickets}
          selectedId={selectedId}
          loading={loading}
          error={listError}
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFiltersChange={setFilters}
          organizations={orgOptions}
          assignees={assignees}
          orgNameById={orgNameById}
          onSelect={(t) => void openTicket(t)}
          onRetry={() => void loadTickets()}
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
          onRefresh={() => {
            void loadTickets();
            void loadStats();
          }}
        />

        <SupportOpsWorkspace
          ticket={selectedTicket}
          loading={detailLoading && !selectedTicket}
          error={detailError}
          orgName={selectedTicket ? orgNameById(selectedTicket.organizationId) : '—'}
          assignees={assignees}
          assigneeName={assigneeName}
          onTicketUpdate={handleTicketUpdate}
          onNavigateToOrg={onNavigateToOrg}
        />
      </div>

      <Sheet open={mobileWorkspaceOpen && isMobile} onOpenChange={(open: boolean) => !open && closeMobileWorkspace()}>
        <SheetContent side="right" className="w-full max-w-none border-l p-0 sm:max-w-full">
          <SupportOpsWorkspace
            className="flex h-full w-full rounded-none border-0 shadow-none"
            ticket={selectedTicket}
            loading={detailLoading && !selectedTicket}
            error={detailError}
            orgName={selectedTicket ? orgNameById(selectedTicket.organizationId) : '—'}
            assignees={assignees}
            assigneeName={assigneeName}
            onTicketUpdate={handleTicketUpdate}
            onNavigateToOrg={onNavigateToOrg}
            onClose={closeMobileWorkspace}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
