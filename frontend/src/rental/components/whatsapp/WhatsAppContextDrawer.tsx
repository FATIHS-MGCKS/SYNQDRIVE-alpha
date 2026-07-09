import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { Skeleton } from '../../../components/ui/skeleton';
import { api, getErrorMessage, type WhatsAppAiSuggestionResponse, type WhatsAppConfig, type WhatsAppConversation, type WhatsAppConversationContext } from '../../../lib/api';
import { WhatsAppQuickActions } from './WhatsAppQuickActions';

interface WhatsAppContextDrawerProps {
  orgId: string | undefined;
  conversation: WhatsAppConversation | null;
  config: WhatsAppConfig | null;
  aiSuggestionReason: string | null;
  aiResult?: WhatsAppAiSuggestionResponse | null;
  onClose?: () => void;
  onConversationRefresh?: () => void;
}

function ContextCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/40 bg-muted/10 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon name={icon as 'user'} className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{title}</h4>
      </div>
      {children}
    </section>
  );
}

export function WhatsAppContextDrawer({
  orgId,
  conversation,
  config,
  aiSuggestionReason,
  aiResult,
  onClose,
  onConversationRefresh,
}: WhatsAppContextDrawerProps) {
  const [ctx, setCtx] = useState<WhatsAppConversationContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !conversation) {
      setCtx(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.whatsapp.getConversationContext(orgId, conversation.id);
      setCtx(data);
    } catch (err) {
      setError(getErrorMessage(err));
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, conversation]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = () => {
    void load();
    onConversationRefresh?.();
  };

  if (!conversation) {
    return (
      <aside className="hidden h-full min-h-0 flex-col border-l border-border/40 surface-premium p-4 xl:flex">
        <p className="text-[11px] text-muted-foreground">Select a conversation to see linked SynqDrive context.</p>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border/40 surface-premium">
      <div className="flex items-center justify-between border-b border-border/40 px-3 py-2">
        <h3 className="text-[11px] font-semibold text-foreground">SynqDrive context</h3>
        {onClose && (
          <button type="button" onClick={onClose} className="sq-press rounded-lg p-1 hover:bg-muted xl:hidden">
            <Icon name="x" className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : (
          <>
            <WhatsAppQuickActions
              orgId={orgId}
              conversationId={conversation.id}
              context={ctx}
              onRefresh={handleRefresh}
            />

            <ContextCard title="Customer" icon="user">
              {ctx?.customer ? (
                <div className="space-y-1 text-[11px]">
                  <p className="font-semibold text-foreground">{ctx.customer.displayName}</p>
                  <p className="text-muted-foreground">{ctx.customer.phone ?? conversation.contactPhone}</p>
                  <p className="text-muted-foreground">{ctx.customer.email ?? 'No email'}</p>
                  {ctx.whatsapp.customerOptedOut && (
                    <StatusChip tone="watch">Opted out</StatusChip>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No linked customer yet</p>
              )}
            </ContextCard>

            <ContextCard title="Booking" icon="calendar">
              {ctx?.booking ? (
                <div className="space-y-1 text-[11px]">
                  <p className="font-semibold text-foreground">
                    {ctx.booking.bookingNumber} · {ctx.booking.status}
                  </p>
                  <p className="text-muted-foreground">
                    {new Date(ctx.booking.startDate).toLocaleDateString()} →{' '}
                    {new Date(ctx.booking.endDate).toLocaleDateString()}
                  </p>
                  {ctx.booking.pickupStationName && (
                    <p className="text-muted-foreground">Pickup: {ctx.booking.pickupStationName}</p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No linked booking yet</p>
              )}
            </ContextCard>

            <ContextCard title="Vehicle" icon="car">
              {ctx?.vehicle ? (
                <div className="space-y-1 text-[11px]">
                  <p className="font-semibold text-foreground">{ctx.vehicle.displayName}</p>
                  {ctx.vehicle.licensePlate && (
                    <p className="text-muted-foreground">{ctx.vehicle.licensePlate}</p>
                  )}
                  {ctx.vehicle.status && (
                    <StatusChip tone="info">{ctx.vehicle.status}</StatusChip>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No linked vehicle yet</p>
              )}
            </ContextCard>

            <ContextCard title="Station" icon="map-pin">
              {ctx?.station ? (
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <p className="font-semibold text-foreground">{ctx.station.name}</p>
                  {ctx.station.address && <p>{ctx.station.address}</p>}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No station context</p>
              )}
            </ContextCard>

            <ContextCard title="Payment / deposit" icon="credit-card">
              {ctx?.payment ? (
                <div className="space-y-1 text-[11px]">
                  <p className="text-foreground">Payment: {ctx.payment.paymentStatus ?? '—'}</p>
                  <p className="text-muted-foreground">Deposit: {ctx.payment.depositStatus ?? '—'}</p>
                  {ctx.payment.openInvoiceCount > 0 && (
                    <p className="text-[color:var(--status-watch)]">
                      {ctx.payment.openInvoiceCount} open invoice(s)
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No payment context linked</p>
              )}
            </ContextCard>

            <ContextCard title="Documents" icon="file-text">
              {ctx?.documents ? (
                <div className="space-y-1 text-[11px]">
                  <p className="text-foreground">
                    {ctx.documents.missingCount > 0
                      ? `${ctx.documents.missingCount} missing`
                      : 'Bundle complete'}
                  </p>
                  {ctx.documents.missingLabels.length > 0 && (
                    <p className="text-muted-foreground">{ctx.documents.missingLabels.join(', ')}</p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No booking documents to show</p>
              )}
            </ContextCard>

            <ContextCard title="Damages" icon="alert-triangle">
              {ctx?.damages ? (
                <p className="text-[11px] text-foreground">
                  {ctx.damages.openCount > 0
                    ? `${ctx.damages.openCount} open damage(s)`
                    : 'No open damages'}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">No vehicle damages</p>
              )}
            </ContextCard>

            <ContextCard title="Tasks" icon="list-checks">
              {ctx?.tasks ? (
                <div className="space-y-1 text-[11px]">
                  <p className="text-foreground">
                    {ctx.tasks.openCount} open
                    {ctx.tasks.overdueCount > 0 ? ` · ${ctx.tasks.overdueCount} overdue` : ''}
                  </p>
                  {ctx.tasks.items.map(t => (
                    <p key={t.id} className="truncate text-muted-foreground">
                      {t.title}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No linked tasks</p>
              )}
            </ContextCard>

            <ContextCard title="Handover / return" icon="clipboard-check">
              {ctx?.handover ? (
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <p>Pickup: {ctx.handover.pickupCompleted ? 'completed' : 'pending'}</p>
                  <p>Return: {ctx.handover.returnCompleted ? 'completed' : 'pending'}</p>
                  {ctx.handover.operatorBookingUrl && (
                    <p className="truncate text-[9px]">{ctx.handover.operatorBookingUrl}</p>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">No handover context</p>
              )}
            </ContextCard>

            <ContextCard title="AI context" icon="sparkles">
              <div className="space-y-1.5 text-[10px] text-muted-foreground">
                <p>
                  Mode: <span className="font-semibold text-foreground">{config?.aiMode ?? 'OFF'}</span>
                </p>
                {conversation.status === 'PENDING_HUMAN' && (
                  <p className="text-[color:var(--status-watch)]">Human review required for this thread.</p>
                )}
                {aiResult && (
                  <>
                    <p>
                      Intent: <span className="font-semibold text-foreground">{aiResult.intent}</span>
                    </p>
                    <p>Confidence: {Math.round(aiResult.confidence * 100)}%</p>
                  </>
                )}
                {aiSuggestionReason && <p>{aiSuggestionReason}</p>}
              </div>
            </ContextCard>
          </>
        )}
        {error && <p className="text-[10px] text-[color:var(--status-critical)]">{error}</p>}
      </div>
    </aside>
  );
}
