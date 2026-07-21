import { Mail, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  SkeletonRows,
  type DataTableColumn,
} from '../../../components/patterns';
import { api, type OrganizationInviteDto, type OrganizationInviteStatus } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { InviteStatusBadge } from './badges';
import { extractApiError, formatDateTime } from './utils';

type InviteBucket = 'pending' | 'expired' | 'accepted';

function deliveryStatusLabel(status: OrganizationInviteDto['deliveryStatus']): string {
  switch (status) {
    case 'SENT':
      return 'E-Mail gesendet';
    case 'SENDING':
      return 'Wird gesendet';
    case 'FAILED':
      return 'Zustellung fehlgeschlagen';
    case 'DEAD_LETTER':
      return 'Zustellung abgebrochen';
    default:
      return 'In Warteschlange';
  }
}

interface InvitesTabProps {
  orgId: string;
  onRefreshParent: () => Promise<void>;
  onNotifySuccess: (msg: string) => void;
  onNotifyError: (err: unknown, fallback: string) => void;
}

export function InvitesTab({
  orgId,
  onRefreshParent,
  onNotifySuccess,
  onNotifyError,
}: InvitesTabProps) {
  const [bucket, setBucket] = useState<InviteBucket>('pending');
  const [invites, setInvites] = useState<OrganizationInviteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const { hasPermission } = useRentalOrg();
  const canManage = hasPermission('users-roles', 'manage');

  const statusForBucket = (b: InviteBucket): OrganizationInviteStatus | undefined => {
    if (b === 'pending') return 'PENDING';
    if (b === 'expired') return 'EXPIRED';
    return 'ACCEPTED';
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.organizationInvites.list(orgId, statusForBucket(bucket));
      setInvites(Array.isArray(list) ? list : []);
    } catch (err) {
      setInvites([]);
      setError(extractApiError(err, 'Einladungen konnten nicht geladen werden.'));
    } finally {
      setLoading(false);
    }
  }, [orgId, bucket]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleResend = async (invite: OrganizationInviteDto) => {
    setActionId(invite.inviteId);
    try {
      await api.organizationInvites.resend(orgId, invite.inviteId);
      onNotifySuccess('Einladung erneut per E-Mail versendet');
      await load();
      await onRefreshParent();
    } catch (err) {
      onNotifyError(err, 'Einladung konnte nicht erneut gesendet werden.');
    } finally {
      setActionId(null);
    }
  };

  const handleRevoke = async (invite: OrganizationInviteDto) => {
    if (
      !window.confirm(
        `Einladung an ${invite.recipientMasked} wirklich widerrufen? Der Link ist danach ungültig.`,
      )
    ) {
      return;
    }
    setActionId(invite.inviteId);
    try {
      await api.organizationInvites.revoke(orgId, invite.inviteId);
      onNotifySuccess('Einladung widerrufen');
      await load();
      await onRefreshParent();
    } catch (err) {
      onNotifyError(err, 'Einladung konnte nicht widerrufen werden.');
    } finally {
      setActionId(null);
    }
  };

  const columns: DataTableColumn<OrganizationInviteDto>[] = [
    {
      key: 'email',
      header: 'Empfänger',
      cell: (i) => <span className="text-[13px] font-medium">{i.recipientMasked}</span>,
    },
    {
      key: 'role',
      header: 'Rolle',
      cell: (i) => <span className="text-[12px] text-muted-foreground">{i.roleSummary}</span>,
    },
    {
      key: 'delivery',
      header: 'Zustellung',
      cell: (i) => (
        <span className="text-[12px] text-muted-foreground">{deliveryStatusLabel(i.deliveryStatus)}</span>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'expires',
      header: 'Läuft ab',
      cell: (i) => <span className="text-[12px] tabular-nums">{formatDateTime(i.expiresAt)}</span>,
      className: 'hidden xl:table-cell',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (i) => <InviteStatusBadge status={i.status} />,
    },
    {
      key: 'actions',
      header: '',
      cell: (i) =>
        i.status === 'PENDING' && canManage ? (
          <div className="flex justify-end gap-1">
            <button
              type="button"
              disabled={actionId === i.inviteId}
              className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground"
              title="Erneut senden"
              onClick={(e) => {
                e.stopPropagation();
                void handleResend(i);
              }}
            >
              <RefreshCw className={`w-4 h-4 ${actionId === i.inviteId ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              disabled={actionId === i.inviteId}
              className="p-2 rounded-lg hover:bg-muted/60 text-red-600"
              title="Widerrufen"
              onClick={(e) => {
                e.stopPropagation();
                void handleRevoke(i);
              }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([
          ['pending', 'Offene Einladungen'],
          ['expired', 'Abgelaufen'],
          ['accepted', 'Angenommen'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setBucket(id)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-colors ${
              bucket === id
                ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-foreground'
                : 'border-border text-muted-foreground hover:bg-muted/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="surface-premium rounded-2xl shadow-[var(--shadow-1)] overflow-hidden">
        {error && !invites.length ? (
          <ErrorState title="Einladungen nicht verfügbar" error={error} onRetry={() => void load()} />
        ) : loading ? (
          <SkeletonRows rows={5} className="p-4" />
        ) : invites.length === 0 ? (
          <EmptyState
            icon={<Mail className="w-5 h-5" />}
            title={
              bucket === 'pending'
                ? 'Keine offenen Einladungen'
                : bucket === 'expired'
                  ? 'Keine abgelaufenen Einladungen'
                  : 'Keine angenommenen Einladungen'
            }
            description="Neue Einladungen erstellen Sie im Tab Benutzer."
          />
        ) : (
          <>
            <div className="hidden md:block p-1">
              <DataTable columns={columns} rows={invites} getRowKey={(i) => i.inviteId} card={false} />
            </div>
            <div className="md:hidden divide-y divide-border/60">
              {invites.map((i) => (
                <div key={i.inviteId} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-[13px]">{i.recipientMasked}</p>
                      <p className="text-[11px] text-muted-foreground">{i.roleSummary}</p>
                    </div>
                    <InviteStatusBadge status={i.status} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Zustellung: {deliveryStatusLabel(i.deliveryStatus)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Läuft ab: {formatDateTime(i.expiresAt)}
                  </p>
                  {i.status === 'PENDING' && (
                    <div className="flex gap-2 pt-1">
                      <button type="button" className="sq-3d-btn text-xs" onClick={() => void handleResend(i)}>
                        <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Erneut senden
                      </button>
                      <button type="button" className="sq-3d-btn text-xs text-red-600" onClick={() => void handleRevoke(i)}>
                        Widerrufen
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
