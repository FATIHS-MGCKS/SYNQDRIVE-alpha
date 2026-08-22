import { Layers, User, Calendar, Car, MapPin, UserCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalEntityNavigation } from '../../context/RentalEntityNavigationContext';
import type { CommunicationConversationDetail } from '../../../lib/communication/types';
import { CommunicationContextSkeleton } from './skeletons/CommunicationContextSkeleton';

interface CommunicationContextPaneProps {
  conversation: CommunicationConversationDetail | null;
  loading?: boolean;
  selectedConversationId: string | null;
  onClose?: () => void;
}

function ContextSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border/30 px-3 py-3 last:border-b-0">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        <h3>{title}</h3>
      </div>
      <div className="space-y-1 text-[13px] text-foreground">{children}</div>
    </section>
  );
}

export function CommunicationContextPane({
  conversation,
  loading,
  selectedConversationId,
  onClose,
}: CommunicationContextPaneProps) {
  const { t } = useLanguage();
  const navigation = useRentalEntityNavigation();

  if (!selectedConversationId) return null;

  const hasCustomer = Boolean(conversation?.customer);
  const hasBooking = Boolean(conversation?.booking);
  const hasVehicle = Boolean(conversation?.vehicle);
  const hasStation = Boolean(conversation?.station);
  const hasAssignment = Boolean(conversation?.assignedUser || conversation?.assignedAgent);
  const hasAnyContext =
    hasCustomer || hasBooking || hasVehicle || hasStation || hasAssignment;

  return (
    <aside
      data-testid="communication-context-pane"
      className="flex h-full min-h-0 flex-col border-border/40 bg-background"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-2.5">
        <h2 className="text-[13px] font-semibold text-foreground">{t('communication.context.title')}</h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40 xl:hidden"
            aria-label={t('communication.context.close')}
          >
            {t('communication.context.close')}
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <CommunicationContextSkeleton />
        ) : !hasAnyContext ? (
          <EmptyState
            compact
            icon={<Layers className="h-5 w-5" aria-hidden />}
            title={t('communication.context.empty.title')}
            description={t('communication.context.empty.description')}
            className="h-full"
          />
        ) : (
          <div data-testid="communication-context-sections">
            {hasCustomer && conversation?.customer && (
              <ContextSection
                icon={<User className="h-3.5 w-3.5" aria-hidden />}
                title={t('communication.context.customer')}
              >
                <p className="font-medium">{conversation.customer.displayName}</p>
                {conversation.customer.id && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-[12px]"
                    onClick={() => navigation.openCustomerById(conversation.customer!.id)}
                  >
                    {t('communication.context.viewCustomer')}
                  </Button>
                )}
              </ContextSection>
            )}

            {hasBooking && conversation?.booking && (
              <ContextSection
                icon={<Calendar className="h-3.5 w-3.5" aria-hidden />}
                title={t('communication.context.booking')}
              >
                <p className="font-medium">{conversation.booking.reference}</p>
                {conversation.booking.status && (
                  <p className="text-[12px] text-muted-foreground">{conversation.booking.status}</p>
                )}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-[12px]"
                  onClick={() => navigation.openBookingById(conversation.booking!.id)}
                >
                  {t('communication.context.viewBooking')}
                </Button>
              </ContextSection>
            )}

            {hasVehicle && conversation?.vehicle && (
              <ContextSection
                icon={<Car className="h-3.5 w-3.5" aria-hidden />}
                title={t('communication.context.vehicle')}
              >
                <p className="font-medium">{conversation.vehicle.displayLabel}</p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-[12px]"
                  onClick={() => navigation.openVehicleById(conversation.vehicle!.id)}
                >
                  {t('communication.context.viewVehicle')}
                </Button>
              </ContextSection>
            )}

            {hasStation && conversation?.station && (
              <ContextSection
                icon={<MapPin className="h-3.5 w-3.5" aria-hidden />}
                title={t('communication.context.station')}
              >
                <p className="font-medium">{conversation.station.name}</p>
              </ContextSection>
            )}

            {hasAssignment && (
              <ContextSection
                icon={<UserCheck className="h-3.5 w-3.5" aria-hidden />}
                title={t('communication.context.assignment')}
              >
                {conversation?.assignedUser ? (
                  <p>{conversation.assignedUser.displayName}</p>
                ) : conversation?.assignedAgent ? (
                  <p>{conversation.assignedAgent.ref}</p>
                ) : (
                  <p className="text-muted-foreground">{t('communication.timeline.unassigned')}</p>
                )}
              </ContextSection>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
