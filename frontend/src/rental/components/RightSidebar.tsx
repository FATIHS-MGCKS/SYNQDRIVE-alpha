import { Calendar, Clock, Wrench, ChevronRight, CheckCircle, ChevronLeft, AlertTriangle, Car, MessageSquare, Bell, Star, ThumbsUp, ThumbsDown, ListTodo, X, ExternalLink, BookOpen, CalendarClock, CreditCard, RotateCcw, ShieldAlert, PanelRightClose, PanelRightOpen, FileSignature } from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations/en';
import { api } from '../../lib/api';
import { useVehicleHealthAlerts } from '../DashboardInsightsContext';
import type { VehicleData } from '../data/vehicles';
import { useHandover } from '../HandoverContext';

interface FleetVehicle {
  id: string;
  model: string;
  license: string;
  healthStatus?: string;
  alert?: string | null;
}

interface RightSidebarProps {
  isDarkMode: boolean;
  highlightedVehicle?: string | null;
  orgId?: string;
  fleetVehicles?: FleetVehicle[];
  onTaskClick?: (taskId: string) => void;
  onVehicleAlertClick?: (vehicleId: string) => void;
  onSchedulePickupReturnClick?: () => void;
  onScheduleMaintenanceClick?: (vehicleId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  /**
   * Monotonically increasing counter that App.tsx bumps whenever bookings
   * change (create / update / cancel). The sidebar is persistent across
   * views, so without this trigger the calendar and schedule list would
   * not reflect a newly-created booking until the tenant-switched orgId
   * changed. Bumping this forces the today-pickup / today-return refetch.
   */
  bookingsVersion?: number;
}

type ScheduleItem = {
  date: Date;
  time: string;
  type: 'pickup' | 'return' | 'maintenance';
  vehicle: string;
  customer?: string;
  task?: string;
  location: string;
  // V4.6.75 — booking metadata so the Termine list can launch the
  // Übergabeprotokoll directly (pickup + return only).
  bookingId?: string;
  vehicleId?: string;
  vehicleLicense?: string;
  startDate?: string;
  endDate?: string;
  handoverDone?: boolean;
  pickupOdometerKm?: number | null;
};

function formatTimeFromIso(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

type RightSidebarSection = 'calendar' | 'schedule' | 'tasks' | 'vehicle-alerts' | 'notifications';

export function RightSidebar({ isDarkMode, highlightedVehicle, orgId, fleetVehicles = [], onTaskClick, onVehicleAlertClick, onSchedulePickupReturnClick, onScheduleMaintenanceClick, isCollapsed = false, onToggleCollapse, bookingsVersion = 0 }: RightSidebarProps) {
  const { openHandover } = useHandover();
  const { locale, t } = useLanguage();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'pickup' | 'return' | 'maintenance'>('all');
  const [taskTab, setTaskTab] = useState<'open' | 'done'>('open');
  const [selectedNotification, setSelectedNotification] = useState<number | null>(null);
  const [apiScheduleItems, setApiScheduleItems] = useState<ScheduleItem[]>([]);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<RightSidebarSection | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const calendarSectionRef = useRef<HTMLDivElement | null>(null);
  const scheduleSectionRef = useRef<HTMLDivElement | null>(null);
  const tasksSectionRef = useRef<HTMLDivElement | null>(null);
  const vehicleAlertsSectionRef = useRef<HTMLDivElement | null>(null);
  const notificationsSectionRef = useRef<HTMLDivElement | null>(null);

  // V4.6.75 — expose loader so the Termine list also refreshes after a
  // handover has been submitted via `handover:completed`.
  const [handoverVersion, setHandoverVersion] = useState(0);
  useEffect(() => {
    if (!orgId) {
      setApiScheduleItems([]);
      return;
    }
    Promise.all([
      api.bookings.todayPickups(orgId),
      api.bookings.todayReturns(orgId),
    ]).then(([pickups, returns]) => {
      const items: ScheduleItem[] = [];
      (pickups || []).forEach((p: any) => {
        const date = p.startDate ? new Date(p.startDate) : today;
        items.push({
          date,
          time: formatTimeFromIso(p.startDate || ''),
          type: 'pickup',
          vehicle: p.vehicleName || '',
          customer: p.customerName,
          location: p.station || '',
          bookingId: p.id ? String(p.id) : undefined,
          vehicleId: p.vehicleId ?? undefined,
          vehicleLicense: p.vehicleLicense ?? undefined,
          startDate: p.startDate ?? undefined,
          endDate: p.endDate ?? undefined,
          handoverDone: !!p.pickupProtocol,
        });
      });
      (returns || []).forEach((r: any) => {
        const date = r.endDate ? new Date(r.endDate) : today;
        items.push({
          date,
          time: formatTimeFromIso(r.endDate || ''),
          type: 'return',
          vehicle: r.vehicleName || '',
          customer: r.customerName,
          location: r.station || '',
          bookingId: r.id ? String(r.id) : undefined,
          vehicleId: r.vehicleId ?? undefined,
          vehicleLicense: r.vehicleLicense ?? undefined,
          startDate: r.startDate ?? undefined,
          endDate: r.endDate ?? undefined,
          handoverDone: !!r.returnProtocol,
          pickupOdometerKm: r.pickupProtocol?.odometerKm ?? null,
        });
      });
      setApiScheduleItems(items);
    }).catch(() => setApiScheduleItems([]));
  }, [orgId, bookingsVersion, handoverVersion]);

  useEffect(() => {
    const onHandover = () => setHandoverVersion((v) => v + 1);
    window.addEventListener('handover:completed', onHandover as EventListener);
    return () => window.removeEventListener('handover:completed', onHandover as EventListener);
  }, []);

  // Locale-dependent task keys for schedule items
  const scheduleTaskKeys: Record<string, TranslationKey> = {
    'Oil Change': 'rightSidebar.scheduleTask.oilChange',
    'Tire Rotation': 'rightSidebar.scheduleTask.tireRotation',
    'Battery Check': 'rightSidebar.scheduleTask.batteryCheck',
    'Brake Inspection': 'rightSidebar.scheduleTask.brakeInspection',
  };

  const vehicleNameToId = useMemo(() => {
    const map: Record<string, string> = {};
    fleetVehicles.forEach((v) => {
      map[v.model] = v.id;
      if (v.license) map[v.license] = v.id;
    });
    return map;
  }, [fleetVehicles]);

  const allScheduleItems = apiScheduleItems;

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const scheduleItems = useMemo(
    () => allScheduleItems.filter(item => isSameDay(item.date, selectedDate)),
    [selectedDate, allScheduleItems]
  );

  const eventDates = useMemo(() => {
    const set = new Set<string>();
    allScheduleItems.forEach(item => {
      set.add(`${item.date.getFullYear()}-${item.date.getMonth()}-${item.date.getDate()}`);
    });
    return set;
  }, [allScheduleItems]);

  const hasEvents = (date: Date) =>
    eventDates.has(`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`);

  // Locale-aware calendar labels
  const monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthNamesDe = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const dayLabelsEn = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  const dayLabelsDe = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

  const monthNames = locale === 'de' ? monthNamesDe : monthNamesEn;
  const dayLabels = locale === 'de' ? dayLabelsDe : dayLabelsEn;

  const getDaysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const getFirstDayOfMonth = (date: Date) => {
    const day = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return day === 0 ? 6 : day - 1;
  };

  const prevMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
  const nextMonth = () => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
  const goToToday = () => {
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(today);
  };

  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(calendarMonth);
    const firstDay = getFirstDayOfMonth(calendarMonth);
    const prevMonthDays = getDaysInMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1));
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ date: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, prevMonthDays - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), i), isCurrentMonth: true });
    }
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        days.push({ date: new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, i), isCurrentMonth: false });
      }
    }
    return days;
  }, [calendarMonth]);

  // Tasks: keine Dummy-Daten; wenn später Task-API pro Org existiert, hier laden
  const openTasks: { id: string; titleKey: TranslationKey; priority: 'high' | 'medium' | 'low'; dueDate: string }[] = [];
  const doneTasks: { id: string; titleKey: TranslationKey; completedDate: string }[] = [];

  // Per-vehicle alert rows derived from the DashboardInsights feed
  // (BATTERY_CRITICAL + SERVICE_OVERDUE detectors). Shared with the
  // BusinessInsightsBox pointer and the Dashboard Vehicle-Alerts popup so
  // every surface shows the exact same state. Relying on the persisted
  // `Vehicle.healthStatus` column was the previous bug — that column is
  // admin-set and never auto-computed from live service/battery state.
  // The derivation only reads `id`, `license`, `model`, `station`, so the
  // sidebar's compact FleetVehicle[] projection is enough — we cast via
  // unknown to avoid copying every vehicle.
  const vehicleAlertsSource = fleetVehicles as unknown as VehicleData[];
  const { alerts: derivedAlerts } = useVehicleHealthAlerts(vehicleAlertsSource);
  const vehicleAlerts = useMemo(
    () =>
      derivedAlerts.map((row, i) => ({
        id: i + 1,
        vehicle: row.license || row.model || 'Vehicle',
        vehicleId: row.vehicleId,
        alertKey: 'rightSidebar.alert.nextService' as TranslationKey,
        alertText: row.primaryReason || null,
        severity: row.severity,
        timeCount: 0,
        timeUnit: 'minutes' as const,
      })),
    [derivedAlerts],
  );

  // Notification type keys
  const notifTypeKeys: Record<string, TranslationKey> = {
    booking: 'rightSidebar.notifDetail.type.booking',
    reminder: 'rightSidebar.notifDetail.type.reminder',
    payment: 'rightSidebar.notifDetail.type.payment',
    return: 'rightSidebar.notifDetail.type.return',
    alert: 'rightSidebar.notifDetail.type.alert',
  };

  // Notifications – loaded from API when available; empty by default
  const notifications: { id: number; titleKey: TranslationKey; descKey: TranslationKey; detailKey: TranslationKey; type: 'booking' | 'reminder' | 'payment' | 'return' | 'alert'; timeCount: number; timeUnit: 'minutes' | 'hours'; unread: boolean }[] = [];

  const formatTimeAgo = (count: number, unit: 'minutes' | 'hours') => {
    if (unit === 'minutes') return t('rightSidebar.minutesAgo', { count });
    return t('rightSidebar.hoursAgo', { count });
  };

  const getNotifTypeIcon = (type: string) => {
    switch (type) {
      case 'booking': return <BookOpen className="w-4 h-4" />;
      case 'reminder': return <CalendarClock className="w-4 h-4" />;
      case 'payment': return <CreditCard className="w-4 h-4" />;
      case 'return': return <RotateCcw className="w-4 h-4" />;
      case 'alert': return <ShieldAlert className="w-4 h-4" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  // V4.6.86 — semantic tones, theme-aware via tokens.
  const getNotifTypeColor = (type: string) => {
    switch (type) {
      case 'booking': return 'sq-tone-info';
      case 'reminder': return 'sq-tone-warning';
      case 'payment': return 'sq-tone-success';
      case 'return': return 'sq-tone-warning';
      case 'alert': return 'sq-tone-critical';
      default: return 'sq-tone-neutral';
    }
  };

  const selectedNotif = notifications.find(n => n.id === selectedNotification);

  const unreadNotifications = useMemo(() => notifications.filter(n => n.unread).length, [notifications]);

  const criticalAlertSeverity = useMemo<'critical' | 'warning' | 'info' | null>(() => {
    if (vehicleAlerts.some(a => a.severity === 'critical')) return 'critical';
    if (vehicleAlerts.some(a => a.severity === 'warning')) return 'warning';
    if (vehicleAlerts.length > 0) return 'info';
    return null;
  }, [vehicleAlerts]);

  const sectionRefs: Record<RightSidebarSection, React.RefObject<HTMLDivElement>> = {
    calendar: calendarSectionRef,
    schedule: scheduleSectionRef,
    tasks: tasksSectionRef,
    'vehicle-alerts': vehicleAlertsSectionRef,
    notifications: notificationsSectionRef,
  };

  const scrollToSection = (section: RightSidebarSection) => {
    const target = sectionRefs[section]?.current;
    const container = scrollContainerRef.current;
    if (!target || !container) return;
    const top = target.offsetTop - 8;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  const handleCollapsedIconClick = (section: RightSidebarSection) => {
    if (isCollapsed) {
      setPendingScrollTarget(section);
      onToggleCollapse?.();
    } else {
      scrollToSection(section);
    }
  };

  useEffect(() => {
    if (!isCollapsed && pendingScrollTarget) {
      // Wait for the 300ms width-expansion transition so layout is stable before scrolling
      const timer = setTimeout(() => {
        scrollToSection(pendingScrollTarget);
        setPendingScrollTarget(null);
      }, 320);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollapsed, pendingScrollTarget]);

  // Close popup on Escape
  useEffect(() => {
    if (!selectedNotification) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedNotification(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNotification]);

  // Mirror the left sidebar's collapsed button styling
  const collapsedBtnClass = `w-8 h-8 flex items-center justify-center rounded-md transition-all duration-200 ease-out relative group text-muted-foreground hover:bg-accent/50 hover:text-foreground`;

  // V4.6.86 — tooltip uses the shared `sq-overlay` surface for consistent elevation.
  const CollapsedTooltip = ({ label }: { label: string }) => (
    <div className="sq-overlay absolute right-full mr-2 px-2 py-1 text-[10.5px] font-medium whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-foreground">
      {label}
    </div>
  );

  // V4.6.86 — count badge routed through semantic tones (no raw palette).
  const CollapsedBadge = ({ count, tone }: { count: number; tone: 'neutral' | 'critical' | 'warning' | 'info' }) => {
    if (count <= 0) return null;
    const toneClass =
      tone === 'critical' ? 'sq-tone-critical'
      : tone === 'warning' ? 'sq-tone-warning'
      : tone === 'info' ? 'sq-tone-info'
      : 'sq-tone-neutral';
    return (
      <span className={`absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-semibold font-mono tabular leading-none flex items-center justify-center ring-2 ring-background ${toneClass}`}>
        {count > 99 ? '99+' : count}
      </span>
    );
  };

  const calendarLabel = locale === 'de' ? 'Kalender' : 'Calendar';
  const scheduleLabel = locale === 'de' ? 'Termine' : 'Schedule';

  return (
    <div className={`hidden lg:flex h-screen border-l border-sidebar-border flex-col shrink-0 relative bg-sidebar transition-all duration-300 ease-in-out ${
      isCollapsed ? 'w-[52px]' : 'w-[220px]'
    }`}>
      {isCollapsed && (
        <div
          className="flex-1 overflow-y-auto pt-3 pb-3 flex flex-col items-center"
          style={{ scrollbarWidth: 'none' }}
        >
          <nav className="space-y-0.5 w-full flex flex-col items-center">
            <button
              onClick={() => handleCollapsedIconClick('calendar')}
              className={collapsedBtnClass}
              aria-label={calendarLabel}
            >
              <Calendar className="w-[14px] h-[14px]" />
              <CollapsedTooltip label={calendarLabel} />
            </button>
            <button
              onClick={() => handleCollapsedIconClick('schedule')}
              className={collapsedBtnClass}
              aria-label={scheduleLabel}
            >
              <Clock className="w-[14px] h-[14px]" />
              <CollapsedBadge count={scheduleItems.length} tone="neutral" />
              <CollapsedTooltip label={scheduleLabel} />
            </button>
            <button
              onClick={() => handleCollapsedIconClick('tasks')}
              className={collapsedBtnClass}
              aria-label={t('rightSidebar.tasks')}
            >
              <ListTodo className="w-[14px] h-[14px]" />
              <CollapsedBadge count={openTasks.length} tone="info" />
              <CollapsedTooltip label={t('rightSidebar.tasks')} />
            </button>
            <button
              onClick={() => handleCollapsedIconClick('vehicle-alerts')}
              className={collapsedBtnClass}
              aria-label={t('rightSidebar.vehicleAlerts')}
            >
              <AlertTriangle className="w-[14px] h-[14px]" />
              <CollapsedBadge count={vehicleAlerts.length} tone={criticalAlertSeverity ?? 'warning'} />
              <CollapsedTooltip label={t('rightSidebar.vehicleAlerts')} />
            </button>
            <button
              onClick={() => handleCollapsedIconClick('notifications')}
              className={collapsedBtnClass}
              aria-label={t('rightSidebar.notifications')}
            >
              <Bell className="w-[14px] h-[14px]" />
              <CollapsedBadge count={unreadNotifications} tone="info" />
              <CollapsedTooltip label={t('rightSidebar.notifications')} />
            </button>
          </nav>
        </div>
      )}

      {!isCollapsed && (
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-[18px] py-4 space-y-5">
        {/* Mini Calendar — V4.6.86: brand-tinted selection, softened header, tabular days */}
        <div ref={calendarSectionRef} className="pb-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">
              {monthNames[calendarMonth.getMonth()]} <span className="text-muted-foreground font-medium font-mono tabular">{calendarMonth.getFullYear()}</span>
            </h3>
            <div className="flex items-center gap-0.5">
              <button onClick={goToToday} className="px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide uppercase transition-all duration-200 ease-out text-muted-foreground hover:text-foreground hover:bg-muted sq-press">
                {t('rightSidebar.today')}
              </button>
              <button onClick={prevMonth} className="p-1 rounded-md transition-all duration-200 ease-out text-muted-foreground hover:text-foreground hover:bg-muted sq-press" aria-label="Previous month">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button onClick={nextMonth} className="p-1 rounded-md transition-all duration-200 ease-out text-muted-foreground hover:text-foreground hover:bg-muted sq-press" aria-label="Next month">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {dayLabels.map(day => (
              <div key={day} className="text-center text-[9.5px] font-semibold tracking-[0.08em] uppercase py-1 text-muted-foreground/70">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-[1px]">
            {calendarDays.map(({ date, isCurrentMonth }, idx) => {
              const isToday = isSameDay(date, today);
              const isSelected = isSameDay(date, selectedDate);
              const hasEvent = hasEvents(date);
              return (
                <button
                  key={idx}
                  onClick={() => { setSelectedDate(date); if (!isCurrentMonth) setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }}
                  className={`relative flex flex-col items-center justify-center py-1.5 rounded-md text-[11px] font-mono tabular transition-all duration-150 ease-out ${
                    isSelected
                      ? 'bg-[color:var(--brand)] text-[color:var(--brand-foreground)] font-semibold shadow-[0_2px_8px_-2px_var(--brand-glow)]'
                      : isToday
                        ? 'ring-1 ring-[color:var(--brand-soft)] text-[color:var(--brand)] font-semibold bg-[color:var(--brand-soft)]/40'
                        : isCurrentMonth
                          ? 'text-foreground/80 hover:bg-muted'
                          : 'text-muted-foreground/40 hover:bg-muted/60'
                  }`}
                >
                  {date.getDate()}
                  {hasEvent && <div className={`absolute bottom-[3px] w-1 h-1 rounded-full ${isSelected ? 'bg-[color:var(--brand-foreground)]/80' : 'bg-[color:var(--brand)]'}`} />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-border/60" />

        {/* Schedule for Selected Date — V4.6.86: consolidated semantic filter pills */}
        <div ref={scheduleSectionRef} className="pb-1">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground flex items-center gap-2">
              <span>{t('rightSidebar.scheduleTitle')}</span>
              <span className="text-muted-foreground font-normal">·</span>
              <span className="text-muted-foreground font-medium text-[10px]">
                {selectedDate.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </h3>
            {isSameDay(selectedDate, today) && (
              <span className="sq-chip sq-chip-info">{t('rightSidebar.today')}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {([
              { key: 'all' as const, label: t('rightSidebar.allFilter'), count: scheduleItems.length },
              { key: 'pickup' as const, label: t('rightSidebar.pickupFilter'), count: scheduleItems.filter(i => i.type === 'pickup').length },
              { key: 'return' as const, label: t('rightSidebar.returnFilter'), count: scheduleItems.filter(i => i.type === 'return').length },
              { key: 'maintenance' as const, label: t('rightSidebar.restFilter'), count: scheduleItems.filter(i => i.type === 'maintenance').length },
            ]).map(tab => {
              const isActive = scheduleFilter === tab.key;
              // Semantic tone mapping (dot + active ring):
              // pickup → brand (operational start), return → attention, maintenance → critical, all → neutral
              const dotColor =
                tab.key === 'pickup' ? 'bg-[color:var(--brand)]'
                : tab.key === 'return' ? 'bg-[color:var(--status-attention)]'
                : tab.key === 'maintenance' ? 'bg-[color:var(--status-critical)]'
                : 'bg-muted-foreground/40';
              const activeStyle =
                tab.key === 'pickup' ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)] ring-1 ring-[color:var(--brand-soft)]'
                : tab.key === 'return' ? 'sq-tone-warning ring-1 ring-[color:var(--status-attention-soft)]'
                : tab.key === 'maintenance' ? 'sq-tone-critical ring-1 ring-[color:var(--status-critical-soft)]'
                : 'bg-muted text-foreground ring-1 ring-border';
              const inactiveStyle = 'text-muted-foreground hover:text-foreground hover:bg-muted/60 ring-1 ring-transparent';
              return (
                <button
                  key={tab.key}
                  onClick={() => setScheduleFilter(tab.key)}
                  className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-md text-[10.5px] font-semibold transition-all duration-200 ease-out ${
                    isActive ? activeStyle : inactiveStyle
                  }`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                    <span className="truncate">{tab.label}</span>
                  </span>
                  <span className={`font-mono tabular text-[10px] font-semibold shrink-0 ${
                    isActive ? '' : 'text-muted-foreground/70'
                  }`}>{tab.count}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-0.5">
            {scheduleItems
              .filter(item => scheduleFilter === 'all' || item.type === scheduleFilter)
              .map((item, index) => {
              const isHighlighted = !!highlightedVehicle && item.vehicle.toLowerCase().includes(highlightedVehicle.toLowerCase());
              const taskLabel = item.type === 'maintenance' && (item as any).task
                ? (scheduleTaskKeys[(item as any).task] ? t(scheduleTaskKeys[(item as any).task]) : (item as any).task)
                : null;
              return (
              <div
                key={index}
                onClick={() => {
                  if (item.type === 'maintenance') {
                    const vId = vehicleNameToId[item.vehicle];
                    if (vId) onScheduleMaintenanceClick?.(vId);
                  } else {
                    onSchedulePickupReturnClick?.();
                  }
                }}
                className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all duration-200 ease-out group cursor-pointer ${
                  isHighlighted
                    ? 'bg-[color:var(--brand-soft)] ring-1 ring-[color:var(--brand-soft)]'
                    : 'hover:bg-muted/60 active:bg-muted'
                }`}
              >
                <div className="min-w-[36px] text-[11px] font-semibold font-mono tabular text-muted-foreground">{item.time}</div>
                <div className={`w-2 h-2 rounded-full shrink-0 ${item.type === 'pickup' ? 'bg-[color:var(--brand)]' : item.type === 'return' ? 'bg-[color:var(--status-attention)]' : 'bg-[color:var(--status-critical)]'}`} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[11.5px] truncate text-foreground">{item.vehicle}</div>
                  <div className="text-[10.5px] truncate text-muted-foreground">{taskLabel || item.customer} · {item.location}</div>
                </div>
                {/* V4.6.75 — inline Übergabeprotokoll trigger for pickup/return rows */}
                {(item.type === 'pickup' || item.type === 'return') && item.bookingId && !item.handoverDone ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const kind = item.type === 'pickup' ? 'PICKUP' : 'RETURN';
                      openHandover({
                        bookingId: item.bookingId!,
                        kind,
                        booking: {
                          id: item.bookingId,
                          vehicleId: item.vehicleId ?? '',
                          vehicleName: item.vehicle,
                          plate: item.vehicleLicense,
                          customerName: item.customer,
                          startDate: item.startDate ?? '',
                          endDate: item.endDate ?? '',
                          pickupLocation: item.location,
                          pickupOdometerKm: item.pickupOdometerKm ?? null,
                        },
                      });
                    }}
                    title={item.type === 'pickup' ? 'Pickup bestätigen' : 'Rückgabe bestätigen'}
                    className={`inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-md text-[9.5px] font-semibold tracking-wide uppercase transition-all duration-150 ease-out sq-press ${
                      item.type === 'pickup' ? 'sq-cta' : 'bg-[color:var(--status-positive)] text-white hover:brightness-110'
                    }`}
                  >
                    <FileSignature className="w-2.5 h-2.5" />
                    {item.type === 'pickup' ? t('rightSidebar.pickupBadge') : t('rightSidebar.returnBadge')}
                  </button>
                ) : (
                  <span className={`text-[9px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded-md shrink-0 ${
                    item.type === 'pickup' ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                    : item.type === 'return' ? 'sq-tone-warning'
                    : 'sq-tone-critical'
                  }`}>
                    {item.handoverDone && (item.type === 'pickup' || item.type === 'return') ? (
                      <span className="inline-flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" />{item.type === 'pickup' ? t('rightSidebar.pickupBadge') : t('rightSidebar.returnBadge')}</span>
                    ) : item.type === 'pickup' ? t('rightSidebar.pickupBadge') : item.type === 'return' ? t('rightSidebar.returnBadge') : t('rightSidebar.maintBadge')}
                  </span>
                )}
              </div>
              );
            })}
            {scheduleItems.filter(item => scheduleFilter === 'all' || item.type === scheduleFilter).length === 0 && (
              <div className="text-center py-6 text-muted-foreground/60 animate-fade-in">
                <Calendar className="w-6 h-6 mx-auto mb-2 opacity-40" />
                <p className="text-[11px] font-medium">{t('rightSidebar.noEventsForDate')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Tasks – clickable */}
        <div ref={tasksSectionRef} className="pt-5 border-t border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold tracking-[-0.003em] flex items-center gap-1.5 text-foreground">
              <ListTodo className="w-3.5 h-3.5 text-[color:var(--brand)]" />
              {t('rightSidebar.tasks')}
            </h3>
            <div className="flex rounded-md p-0.5 bg-muted sq-neo-press">
              <button onClick={() => setTaskTab('open')} className={`px-2 py-0.5 rounded font-semibold text-[10px] tracking-wide uppercase transition-all duration-200 ease-out ${taskTab === 'open' ? 'bg-card text-foreground shadow-[0_1px_2px_var(--shadow-xs)]' : 'text-muted-foreground hover:text-foreground'}`}>{t('rightSidebar.openTasks')} <span className="font-mono tabular opacity-70">({openTasks.length})</span></button>
              <button onClick={() => setTaskTab('done')} className={`px-2 py-0.5 rounded font-semibold text-[10px] tracking-wide uppercase transition-all duration-200 ease-out ${taskTab === 'done' ? 'bg-card text-foreground shadow-[0_1px_2px_var(--shadow-xs)]' : 'text-muted-foreground hover:text-foreground'}`}>{t('rightSidebar.doneTasks')} <span className="font-mono tabular opacity-70">({doneTasks.length})</span></button>
            </div>
          </div>

          <div className="space-y-0.5">
            {taskTab === 'open' ? (
              openTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onTaskClick?.(task.id.toString())}
                  className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all duration-200 cursor-pointer ${
                    isDarkMode
                      ? 'hover:bg-white/5 active:bg-white/10'
                      : 'hover:bg-gray-50/80 active:bg-gray-100'
                  }`}
                >
                  <div className={`w-1 h-1 rounded-full shrink-0 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-[11px] truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t(task.titleKey)}</div>
                    <div className={`text-[10.5px] truncate ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{t('rightSidebar.due')}: {task.dueDate}</div>
                  </div>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                    task.priority === 'high' ? isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600'
                    : task.priority === 'medium' ? isDarkMode ? 'bg-yellow-500/15 text-yellow-400' : 'bg-yellow-50 text-yellow-600'
                    : isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {task.priority === 'high' ? t('rightSidebar.priorityHigh') : task.priority === 'medium' ? t('rightSidebar.priorityMedium') : t('rightSidebar.priorityLow')}
                  </span>
                  <ChevronRight className={`w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                </div>
              ))
            ) : (
              doneTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onTaskClick?.(task.id.toString())}
                  className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all duration-200 cursor-pointer ${
                    isDarkMode
                      ? 'hover:bg-white/5 active:bg-white/10'
                      : 'hover:bg-gray-50/80 active:bg-gray-100'
                  }`}
                >
                  <div className={`w-1 h-1 rounded-full shrink-0 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-[11px] truncate ${isDarkMode ? 'text-gray-500 line-through' : 'text-gray-400 line-through'}`}>{t(task.titleKey)}</div>
                    <div className={`text-[10.5px] truncate ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>{task.completedDate}</div>
                  </div>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${isDarkMode ? 'bg-green-500/15 text-green-400' : 'bg-green-50 text-green-600'}`}>{t('rightSidebar.doneTasks')}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Vehicle Alerts – clickable */}
        <div ref={vehicleAlertsSectionRef} id="vehicle-alerts-section" className="pt-5 border-t border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold tracking-[-0.003em] flex items-center gap-1.5 text-foreground">
              <AlertTriangle className="w-3.5 h-3.5 text-[color:var(--status-attention)]" />
              {t('rightSidebar.vehicleAlerts')}
            </h3>
            <span className={`text-[9.5px] font-semibold font-mono tabular leading-none min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full ${
              vehicleAlerts.some(a => a.severity === 'critical') ? 'sq-tone-critical' : 'sq-tone-warning'
            }`}>{vehicleAlerts.length}</span>
          </div>
          {vehicleAlerts.length === 0 ? (
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg sq-tone-success animate-fade-in">
              <CheckCircle className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium">{locale === 'de' ? 'Alle Fahrzeuge in Ordnung' : 'All clear'}</span>
            </div>
          ) : (
            <div className="space-y-0.5">
              {vehicleAlerts.map(alert => (
                <div
                  key={alert.id}
                  onClick={() => onVehicleAlertClick?.(alert.vehicleId)}
                  className="flex items-start gap-2.5 px-2 py-2 rounded-lg transition-all duration-200 ease-out cursor-pointer hover:bg-muted/60 active:bg-muted"
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                    alert.severity === 'critical' ? 'bg-[color:var(--status-critical)]'
                    : alert.severity === 'warning' ? 'bg-[color:var(--status-attention)]'
                    : 'bg-[color:var(--status-info)]'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[10px] truncate text-foreground">{alert.vehicle}</div>
                    <div className="text-[10px] truncate text-muted-foreground">{alert.alertText ?? t(alert.alertKey)}</div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <span className={`text-[9px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded-md ${
                      alert.severity === 'critical' ? 'sq-tone-critical'
                      : alert.severity === 'warning' ? 'sq-tone-warning'
                      : 'sq-tone-info'
                    }`}>
                      {alert.severity === 'critical' ? t('rightSidebar.severityCritical') : alert.severity === 'warning' ? t('rightSidebar.severityWarning') : t('rightSidebar.severityInfo')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notifications – clickable with popup */}
        <div ref={notificationsSectionRef} className="pt-5 border-t border-border/60">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold tracking-[-0.003em] flex items-center gap-1.5 text-foreground">
              <Bell className="w-3.5 h-3.5 text-[color:var(--brand)]" />
              {t('rightSidebar.notifications')}
            </h3>
            <span className="text-[9.5px] font-semibold font-mono tabular leading-none min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full sq-tone-info">{unreadNotifications}</span>
          </div>
          <div className="space-y-0.5">
            {notifications.map(notif => (
              <div
                key={notif.id}
                onClick={() => setSelectedNotification(notif.id)}
                className="flex items-start gap-2.5 px-2 py-2 rounded-lg transition-all duration-200 ease-out cursor-pointer hover:bg-muted/60 active:bg-muted"
              >
                <div className={`w-1 h-1 rounded-full shrink-0 mt-1.5 ${notif.unread ? 'bg-[color:var(--brand)]' : 'bg-muted-foreground/30'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-[11.5px] truncate ${
                    notif.unread ? 'text-foreground' : 'text-muted-foreground'
                  }`}>{t(notif.titleKey)}</div>
                  <div className="text-[10.5px] truncate text-muted-foreground">{t(notif.descKey)}</div>
                </div>
                <span className="text-[9.5px] shrink-0 text-muted-foreground/70 font-mono tabular">{formatTimeAgo(notif.timeCount, notif.timeUnit)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      <div className={`sq-sidebar-footer shrink-0 ${isCollapsed ? 'px-2 py-3' : 'px-[18px] py-3'}`}>
        <div className={`flex ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
          <button
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? 'Expand right sidebar' : 'Collapse right sidebar'}
            className={`sq-sidebar-footer__toggle ${isCollapsed ? 'sq-sidebar-footer__toggle--icon-only relative group' : ''}`}
          >
            <span className="sq-sidebar-footer__icon">
              {isCollapsed ? (
                <PanelRightOpen className="w-3.5 h-3.5" />
              ) : (
                <PanelRightClose className="w-3.5 h-3.5" />
              )}
            </span>
            {!isCollapsed && <span className="sq-sidebar-footer__label">Collapse</span>}
            {isCollapsed && <CollapsedTooltip label="Expand right sidebar" />}
          </button>
        </div>
      </div>

      {/* Notification Detail Popup */}
      {!isCollapsed && selectedNotif && (
        <div className="absolute inset-0 z-50 flex items-end justify-center animate-fade-in">
          {/* Backdrop */}
          <div className="absolute inset-0 sq-backdrop" onClick={() => setSelectedNotification(null)} />

          {/* Popup */}
          <div className="relative w-full mx-3 mb-3 sq-overlay overflow-hidden animate-fade-up"
            style={{ maxHeight: 'calc(100vh - 80px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getNotifTypeColor(selectedNotif.type)}`}>
                  {getNotifTypeIcon(selectedNotif.type)}
                </div>
                <div>
                  <p className="sq-section-label">
                    {t(notifTypeKeys[selectedNotif.type])}
                  </p>
                  <h4 className="text-[14px] font-semibold tracking-[-0.003em] text-foreground">
                    {t(selectedNotif.titleKey)}
                  </h4>
                </div>
              </div>
              <button
                onClick={() => setSelectedNotification(null)}
                className="p-1.5 rounded-lg transition-all duration-150 ease-out hover:bg-muted text-muted-foreground hover:text-foreground sq-press"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              {/* Time */}
              <div className="flex items-center gap-2 mb-3 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className="font-mono tabular">{formatTimeAgo(selectedNotif.timeCount, selectedNotif.timeUnit)}</span>
                {selectedNotif.unread && (
                  <span className="sq-chip sq-chip-info">
                    {locale === 'de' ? 'Ungelesen' : 'Unread'}
                  </span>
                )}
              </div>

              {/* Detail text */}
              <p className="text-[12.5px] leading-relaxed text-foreground/80">
                {t(selectedNotif.detailKey)}
              </p>
            </div>

            {/* Footer */}
            <div className={`flex items-center gap-2 px-5 pb-4 pt-1`}>
              <button
                onClick={() => setSelectedNotification(null)}
                className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all ${
                  isDarkMode
                    ? 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300'
                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                }`}
              >
                {t('rightSidebar.notifDetail.dismiss')}
              </button>
              <button
                onClick={() => setSelectedNotification(null)}
                className="flex-1 px-3 py-2 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-all"
              >
                {t('rightSidebar.notifDetail.markAsRead')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}