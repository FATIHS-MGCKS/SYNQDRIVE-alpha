import { Calendar, Clock, Wrench, ChevronRight, CheckCircle, ChevronLeft, AlertTriangle, Car, MessageSquare, Bell, Star, ThumbsUp, ThumbsDown, ListTodo, X, ExternalLink, BookOpen, CalendarClock, CreditCard, RotateCcw, ShieldAlert } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations/en';
import { api } from '../../lib/api';

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
}

type ScheduleItem = {
  date: Date;
  time: string;
  type: 'pickup' | 'return' | 'maintenance';
  vehicle: string;
  customer?: string;
  task?: string;
  location: string;
};

function formatTimeFromIso(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function RightSidebar({ isDarkMode, highlightedVehicle, orgId, fleetVehicles = [], onTaskClick, onVehicleAlertClick, onSchedulePickupReturnClick, onScheduleMaintenanceClick }: RightSidebarProps) {
  const { locale, t } = useLanguage();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [scheduleFilter, setScheduleFilter] = useState<'all' | 'pickup' | 'return' | 'maintenance'>('all');
  const [taskTab, setTaskTab] = useState<'open' | 'done'>('open');
  const [selectedNotification, setSelectedNotification] = useState<number | null>(null);
  const [apiScheduleItems, setApiScheduleItems] = useState<ScheduleItem[]>([]);

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
      (pickups || []).forEach((p: { startDate?: string; vehicleName?: string; customerName?: string; station?: string }) => {
        const date = p.startDate ? new Date(p.startDate) : today;
        items.push({
          date,
          time: formatTimeFromIso(p.startDate || ''),
          type: 'pickup',
          vehicle: p.vehicleName || '',
          customer: p.customerName,
          location: p.station || '',
        });
      });
      (returns || []).forEach((r: { endDate?: string; vehicleName?: string; customerName?: string; station?: string }) => {
        const date = r.endDate ? new Date(r.endDate) : today;
        items.push({
          date,
          time: formatTimeFromIso(r.endDate || ''),
          type: 'return',
          vehicle: r.vehicleName || '',
          customer: r.customerName,
          location: r.station || '',
        });
      });
      setApiScheduleItems(items);
    }).catch(() => setApiScheduleItems([]));
  }, [orgId]);

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

  const vehicleAlerts = useMemo(() => {
    return fleetVehicles
      .filter((v) => (v.healthStatus === 'Warning' || v.healthStatus === 'Critical') || (v.alert != null && String(v.alert).trim() !== ''))
      .map((v, i) => ({
        id: i + 1,
        vehicle: v.model,
        vehicleId: v.id,
        alertKey: 'rightSidebar.alert.nextService' as TranslationKey,
        severity: (v.healthStatus === 'Critical' ? 'critical' : 'warning') as 'critical' | 'warning' | 'info',
        timeCount: 0,
        timeUnit: 'minutes' as const,
      }));
  }, [fleetVehicles]);

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

  const getNotifTypeColor = (type: string) => {
    switch (type) {
      case 'booking': return 'text-blue-500 bg-blue-500/10';
      case 'reminder': return 'text-amber-500 bg-amber-500/10';
      case 'payment': return 'text-green-500 bg-green-500/10';
      case 'return': return 'text-orange-500 bg-orange-500/10';
      case 'alert': return 'text-red-500 bg-red-500/10';
      default: return 'text-gray-500 bg-gray-500/10';
    }
  };

  const selectedNotif = notifications.find(n => n.id === selectedNotification);

  // Close popup on Escape
  useEffect(() => {
    if (!selectedNotification) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedNotification(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNotification]);

  return (
    <div className="hidden lg:flex w-[280px] h-screen border-l border-sidebar-border flex-col shrink-0 overflow-y-auto relative bg-sidebar">
      <div className="px-4 py-4">
        {/* Mini Calendar */}
        <div className="pb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-[13px] font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
            </h3>
            <div className="flex items-center gap-1">
              <button onClick={goToToday} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all duration-200 ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                {t('rightSidebar.today')}
              </button>
              <button onClick={prevMonth} className={`p-1 rounded-md transition-all duration-200 ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button onClick={nextMonth} className={`p-1 rounded-md transition-all duration-200 ${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {dayLabels.map(day => (
              <div key={day} className={`text-center text-[10px] font-semibold py-1 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map(({ date, isCurrentMonth }, idx) => {
              const isToday = isSameDay(date, today);
              const isSelected = isSameDay(date, selectedDate);
              const hasEvent = hasEvents(date);
              return (
                <button
                  key={idx}
                  onClick={() => { setSelectedDate(date); if (!isCurrentMonth) setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }}
                  className={`relative flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] transition-all duration-150 ${
                    isSelected ? 'bg-blue-600 text-white font-bold'
                    : isToday ? isDarkMode ? 'bg-white/10 text-white font-bold' : 'bg-gray-900/5 text-gray-900 font-bold'
                    : isCurrentMonth ? isDarkMode ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-50'
                    : isDarkMode ? 'text-gray-700 hover:bg-white/5' : 'text-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {date.getDate()}
                  {hasEvent && <div className={`absolute bottom-0.5 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-border mb-4" />

        {/* Schedule for Selected Date */}
        <div className="pb-5">
          <h3 className={`text-[13px] font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {t('rightSidebar.scheduleTitle')} · {selectedDate.toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
            {isSameDay(selectedDate, today) && (
              <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>{t('rightSidebar.today')}</span>
            )}
          </h3>
          <div className="flex items-center gap-1 mb-3 flex-wrap">
            {([
              { key: 'all' as const, label: t('rightSidebar.allFilter'), count: scheduleItems.length },
              { key: 'pickup' as const, label: t('rightSidebar.pickupFilter'), count: scheduleItems.filter(i => i.type === 'pickup').length },
              { key: 'return' as const, label: t('rightSidebar.returnFilter'), count: scheduleItems.filter(i => i.type === 'return').length },
              { key: 'maintenance' as const, label: t('rightSidebar.restFilter'), count: scheduleItems.filter(i => i.type === 'maintenance').length },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setScheduleFilter(tab.key)}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 flex items-center gap-1 ${
                  scheduleFilter === tab.key
                    ? tab.key === 'pickup' ? 'bg-purple-100 text-purple-700'
                    : tab.key === 'return' ? 'bg-orange-100 text-orange-700'
                    : tab.key === 'maintenance' ? 'bg-red-100 text-red-700'
                    : isDarkMode ? 'bg-white/10 text-white' : 'bg-gray-900/5 text-gray-900'
                  : isDarkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100/60'
                }`}
              >
                {tab.label}
                <span className={`text-[9px] min-w-[14px] h-[14px] flex items-center justify-center rounded-full font-bold ${
                  scheduleFilter === tab.key
                    ? tab.key === 'pickup' ? 'bg-purple-200 text-purple-800'
                    : tab.key === 'return' ? 'bg-orange-200 text-orange-800'
                    : tab.key === 'maintenance' ? 'bg-red-200 text-red-800'
                    : isDarkMode ? 'bg-white/15 text-white' : 'bg-gray-900/10 text-gray-700'
                  : isDarkMode ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-400'
                }`}>{tab.count}</span>
              </button>
            ))}
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
                className={`flex items-center gap-2.5 px-2 py-2 rounded-lg transition-all duration-200 group cursor-pointer ${
                  isHighlighted
                    ? isDarkMode ? 'bg-blue-500/15 ring-1 ring-blue-500/30' : 'bg-blue-50 ring-1 ring-blue-200'
                    : isDarkMode ? 'hover:bg-white/5 active:bg-white/10' : 'hover:bg-gray-50/80 active:bg-gray-100'
                }`}
              >
                <div className={`min-w-[36px] text-[11px] font-semibold tabular-nums ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{item.time}</div>
                <div className={`w-2 h-2 rounded-full shrink-0 ${item.type === 'pickup' ? 'bg-purple-500' : item.type === 'return' ? 'bg-orange-500' : 'bg-red-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-[12px] truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{item.vehicle}</div>
                  <div className={`text-[11px] truncate ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{taskLabel || item.customer} · {item.location}</div>
                </div>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                  item.type === 'pickup' ? isDarkMode ? 'bg-purple-500/15 text-purple-400' : 'bg-purple-50 text-purple-600'
                  : item.type === 'return' ? isDarkMode ? 'bg-orange-500/15 text-orange-400' : 'bg-orange-50 text-orange-600'
                  : isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600'
                }`}>
                  {item.type === 'pickup' ? t('rightSidebar.pickupBadge') : item.type === 'return' ? t('rightSidebar.returnBadge') : t('rightSidebar.maintBadge')}
                </span>
              </div>
              );
            })}
            {scheduleItems.filter(item => scheduleFilter === 'all' || item.type === scheduleFilter).length === 0 && (
              <div className={`text-center py-6 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                <Calendar className="w-6 h-6 mx-auto mb-2 opacity-40" />
                <p className="text-[11px] font-semibold">{t('rightSidebar.noEventsForDate')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Tasks – clickable */}
        <div className="pt-5 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-[13px] font-semibold flex items-center gap-1.5 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              <ListTodo className="w-3.5 h-3.5 text-blue-500" />
              {t('rightSidebar.tasks')}
            </h3>
            <div className={`flex rounded-md p-0.5 ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`}>
              <button onClick={() => setTaskTab('open')} className={`px-2 py-0.5 rounded font-semibold text-[10px] transition-all ${taskTab === 'open' ? (isDarkMode ? 'bg-neutral-700 text-white' : 'bg-white text-gray-900 shadow-sm') : (isDarkMode ? 'text-gray-500' : 'text-gray-400')}`}>{t('rightSidebar.openTasks')} ({openTasks.length})</button>
              <button onClick={() => setTaskTab('done')} className={`px-2 py-0.5 rounded font-semibold text-[10px] transition-all ${taskTab === 'done' ? (isDarkMode ? 'bg-neutral-700 text-white' : 'bg-white text-gray-900 shadow-sm') : (isDarkMode ? 'text-gray-500' : 'text-gray-400')}`}>{t('rightSidebar.doneTasks')} ({doneTasks.length})</button>
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
                    <div className={`font-semibold text-[12px] truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t(task.titleKey)}</div>
                    <div className={`text-[11px] truncate ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{t('rightSidebar.due')}: {task.dueDate}</div>
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
                    <div className={`font-semibold text-[12px] truncate ${isDarkMode ? 'text-gray-500 line-through' : 'text-gray-400 line-through'}`}>{t(task.titleKey)}</div>
                    <div className={`text-[11px] truncate ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>{task.completedDate}</div>
                  </div>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${isDarkMode ? 'bg-green-500/15 text-green-400' : 'bg-green-50 text-green-600'}`}>{t('rightSidebar.doneTasks')}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Vehicle Alerts – clickable */}
        <div className="pt-5 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-[13px] font-semibold flex items-center gap-1.5 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              {t('rightSidebar.vehicleAlerts')}
            </h3>
            <span className={`text-[9px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full ${isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>{vehicleAlerts.length}</span>
          </div>
          <div className="space-y-0.5">
            {vehicleAlerts.map(alert => (
              <div
                key={alert.id}
                onClick={() => onVehicleAlertClick?.(alert.vehicleId)}
                className={`flex items-start gap-2.5 px-2 py-2 rounded-lg transition-all duration-200 cursor-pointer ${isDarkMode ? 'hover:bg-white/5 active:bg-white/10' : 'hover:bg-gray-50/80 active:bg-gray-100'}`}
              >
                <div className={`w-1 h-1 rounded-full shrink-0 mt-1.5 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-[12px] truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{alert.vehicle}</div>
                  <div className={`text-[11px] truncate ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{t(alert.alertKey)}</div>
                </div>
                <div className="flex flex-col items-end shrink-0 gap-1">
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                    alert.severity === 'critical' ? isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600'
                    : alert.severity === 'warning' ? isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'
                    : isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'
                  }`}>
                    {alert.severity === 'critical' ? t('rightSidebar.severityCritical') : alert.severity === 'warning' ? t('rightSidebar.severityWarning') : t('rightSidebar.severityInfo')}
                  </span>
                  <span className={`text-[9px] ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>{formatTimeAgo(alert.timeCount, alert.timeUnit)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications – clickable with popup */}
        <div className="pt-5 border-t border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-[13px] font-semibold flex items-center gap-1.5 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              <Bell className="w-3.5 h-3.5 text-blue-500" />
              {t('rightSidebar.notifications')}
            </h3>
            <span className={`text-[9px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full ${isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>{notifications.filter(n => n.unread).length}</span>
          </div>
          <div className="space-y-0.5">
            {notifications.map(notif => (
              <div
                key={notif.id}
                onClick={() => setSelectedNotification(notif.id)}
                className={`flex items-start gap-2.5 px-2 py-2 rounded-lg transition-all duration-200 cursor-pointer ${isDarkMode ? 'hover:bg-white/5 active:bg-white/10' : 'hover:bg-gray-50/80 active:bg-gray-100'}`}
              >
                <div className={`w-1 h-1 rounded-full shrink-0 mt-1.5 ${notif.unread ? 'bg-blue-500' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-[12px] truncate ${
                    notif.unread ? isDarkMode ? 'text-white' : 'text-gray-900' : isDarkMode ? 'text-gray-500' : 'text-gray-400'
                  }`}>{t(notif.titleKey)}</div>
                  <div className={`text-[11px] truncate ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{t(notif.descKey)}</div>
                </div>
                <span className={`text-[9px] shrink-0 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>{formatTimeAgo(notif.timeCount, notif.timeUnit)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notification Detail Popup */}
      {selectedNotif && (
        <div className="absolute inset-0 z-50 flex items-end justify-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setSelectedNotification(null)} />
          
          {/* Popup */}
          <div className="relative w-full mx-3 mb-3 rounded-lg border border-border shadow-2xl overflow-hidden bg-card"
            style={{ maxHeight: 'calc(100vh - 80px)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getNotifTypeColor(selectedNotif.type)}`}>
                  {getNotifTypeIcon(selectedNotif.type)}
                </div>
                <div>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {t(notifTypeKeys[selectedNotif.type])}
                  </p>
                  <h4 className={`text-[13px] font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {t(selectedNotif.titleKey)}
                  </h4>
                </div>
              </div>
              <button
                onClick={() => setSelectedNotification(null)}
                className={`p-1.5 rounded-lg transition-all ${isDarkMode ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-gray-100 text-gray-400'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4">
              {/* Time */}
              <div className={`flex items-center gap-2 mb-3 text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                <Clock className="w-3 h-3" />
                {formatTimeAgo(selectedNotif.timeCount, selectedNotif.timeUnit)}
                {selectedNotif.unread && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                    {locale === 'de' ? 'Ungelesen' : 'Unread'}
                  </span>
                )}
              </div>

              {/* Detail text */}
              <p className={`text-[12px] leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
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