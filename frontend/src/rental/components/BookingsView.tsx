
import { Baby, CheckCircle, Clock, CreditCard, Globe, MapPin, Snowflake, UserCheck, Wifi, Zap } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { useRentalOrg } from '../RentalContext';
import { useFleetVehicles } from '../FleetContext';
import { useHandover } from '../HandoverContext';
import { api } from '../../lib/api';
import { mapApiBooking, type BookingUiRow } from '../lib/entityMappers';
import { BrandLogo, getBrandFromModel } from './BrandLogo';
import { BookingDocumentsSection } from './BookingDocumentsSection';
import { EntityTasksSection } from './EntityTasksSection';
// V4.6.76 Rental Health V1 — surface the rental_blocked gate on the
// "Pickup bestätigen" flow so dispatchers can't even try to hand over a
// vehicle that the backend will refuse. The BookingsService.create gate
// already guarantees no fresh bookings land here in a blocked state, but
// confirmed-in-the-past bookings may still transition to CRITICAL between
// creation and the actual pickup day.
import { useVehicleHealth } from '../hooks/useVehicleHealth';
import { RentalHealthBadge } from './rental-health/RentalHealthBadge';
import {
  PageHeader,
  MetricCard,
  DataTable,
  DetailDrawer,
  EmptyState,
  SkeletonMetricGrid,
  StatusChip,
  SectionHeader,
  DataCard,
} from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';

// V4.6.68 — Canonical "Make Model Year" label, identical to NewBookingView.
// Guarantees consistent vehicle naming between creation and management flows.
const buildMMY = (v: { make?: string | null; model?: string | null; year?: number | null }) => {
  const make = (v.make ?? '').toString().trim();
  const rawModel = (v.model ?? '').toString().trim();
  const year = typeof v.year === 'number' && Number.isFinite(v.year) ? v.year : null;
  const modelClean = rawModel.replace(/\s+\d{4}$/, '').trim();
  const makeAlreadyInModel = make && modelClean.toLowerCase().startsWith(make.toLowerCase());
  const head = makeAlreadyInModel || !make ? modelClean : `${make} ${modelClean}`.trim();
  return year ? `${head} ${year}`.trim() : head || rawModel || 'Fahrzeug';
};

const bookingStatusTone = (status: string): StatusTone => {
  if (status === 'active') return 'info';
  if (status === 'pending') return 'warning';
  if (status === 'confirmed' || status === 'completed') return 'success';
  return 'neutral';
};

const bookingStatusLabel = (status: string): string => {
  if (status === 'active') return 'Active';
  if (status === 'pending') return 'Pending';
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'completed') return 'Completed';
  return status;
};

const metricToneToStatus = (tone: 'brand' | 'success' | 'warning' | 'neutral'): StatusTone => {
  if (tone === 'brand') return 'info';
  if (tone === 'success') return 'success';
  if (tone === 'warning') return 'warning';
  return 'neutral';
};

interface BookingsViewProps {
  onActiveBookingRefChange?: (ref: string | null) => void;
  onNavigateToVehicle?: (vehicleName: string) => void;
  onCreateNewBooking?: () => void;
  additionalBookings?: any[];
  onBookingUpdated?: (updatedBooking: any) => void;
  onBookingCancelled?: (bookingId: string) => void;
  // V4.6.99 — Cross-View-Deep-Link auf eine konkrete Booking-Detail-Seite.
  // Wird vom App-Container gesetzt, wenn z.B. der BK-Chip im Dashboard
  // (StatInlineDetail) geklickt wird; BookingsView konsumiert die Id
  // EINMAL beim Mount/Wechsel und meldet den Konsum über
  // `onConsumeInitialDetailBookingId` zurück, damit die App den Pending-
  // State zurücksetzt und ein erneutes Auf-/Zumachen der Detail-Seite
  // nicht versehentlich denselben Deep-Link wiedereröffnet.
  initialDetailBookingId?: string | null;
  onConsumeInitialDetailBookingId?: () => void;
}

export function BookingsView({ onActiveBookingRefChange, onNavigateToVehicle, onCreateNewBooking, additionalBookings = [], onBookingUpdated, onBookingCancelled, initialDetailBookingId, onConsumeInitialDetailBookingId }: BookingsViewProps) {
  const { orgId } = useRentalOrg();
  const systemDark = useSyncExternalStore(
    (onStoreChange) => {
      const el = document.documentElement;
      const obs = new MutationObserver(onStoreChange);
      obs.observe(el, { attributes: true, attributeFilter: ['class'] });
      return () => obs.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
  const { fleetVehicles } = useFleetVehicles();
  // V4.6.75 — open the Übergabeprotokoll dialog (pickup/return) via the
  // global HandoverProvider mounted in App.tsx.
  const { openHandover } = useHandover();
  const [apiBookings, setApiBookings] = useState<BookingUiRow[]>([]);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [rawApiBookings, setRawApiBookings] = useState<any[]>([]);
  const [apiCustomers, setApiCustomers] = useState<any[]>([]);
  const [apiUsers, setApiUsers] = useState<any[]>([]);
  const [apiStations, setApiStations] = useState<any[]>([]);

  const loadBookings = useCallback(() => {
    if (!orgId) return;
    api.bookings.list(orgId)
      .then((res: any) => {
        const list = Array.isArray(res) ? res : res?.data ?? res?.items ?? [];
        setRawApiBookings(list);
        setApiBookings(list.map(mapApiBooking));
        setApiLoaded(true);
      })
      .catch(() => setApiLoaded(true));
  }, [orgId]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  // V4.6.75 — Refetch after a handover (pickup/return) was confirmed from
  // any entry point (detail sheet, Dashboard tile, RightSidebar).
  useEffect(() => {
    const onHandover = () => loadBookings();
    window.addEventListener('handover:completed', onHandover as EventListener);
    return () => window.removeEventListener('handover:completed', onHandover as EventListener);
  }, [loadBookings]);

  // V4.6.68 — Load real customers, users (employees) and stations from backend.
  // Previously the edit dropdowns used hardcoded mock lists which violated
  // the multi-tenant source-of-truth rule.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const [custRes, userRes, stationRes] = await Promise.all([
          (api.customers.list as any)(orgId).catch(() => ({ data: [] })),
          api.users.listByOrg(orgId).catch(() => []),
          api.stations.list(orgId).catch(() => []),
        ]);
        if (cancelled) return;
        const custList = Array.isArray(custRes) ? custRes : (custRes?.data ?? custRes?.items ?? []);
        const userList = Array.isArray(userRes) ? userRes : ((userRes as any)?.data ?? []);
        const stationList = Array.isArray(stationRes) ? stationRes : ((stationRes as any)?.data ?? []);
        setApiCustomers(custList);
        setApiUsers(userList);
        setApiStations(stationList);
      } catch {
        /* keep empty arrays on transient failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const [activeTab, setActiveTab] = useState<'active' | 'upcoming' | 'completed' | null>('active');
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [popupBookingId, setPopupBookingId] = useState<string | null>(null);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Edit & Cancel state
  const [editingBooking, setEditingBooking] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ startDate: '', endDate: '', startTime: '', endTime: '', pickupLocation: '', returnLocation: '', insurance: '', paymentMethod: '', notes: '', customer: '', vehicle: '', plate: '' });
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [localCancelled, setLocalCancelled] = useState<string[]>([]);
  const [localEdits, setLocalEdits] = useState<Record<string, any>>({});
  // V4.6.81 — No-show flow (distinct from cancel). The operator opens
  // the confirm modal from an overdue booking row; the modal takes an
  // optional reason string that we persist into booking.notes.
  const [noShowConfirmId, setNoShowConfirmId] = useState<string | null>(null);
  const [noShowReason, setNoShowReason] = useState<string>('');
  const [noShowSubmitting, setNoShowSubmitting] = useState(false);

  // Inline edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<Record<string, any>>({});
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // V4.6.68 — Inline calendar state (for edit mode date picking).
  // Initialize to the current month/year instead of hardcoded March 2026.
  const [editCalendarOpen, setEditCalendarOpen] = useState(false);
  const [editCalendarMonth, setEditCalendarMonth] = useState(() => new Date().getMonth());
  const [editCalendarYear, setEditCalendarYear] = useState(() => new Date().getFullYear());
  const [editCalendarMode, setEditCalendarMode] = useState<'pickup' | 'return'>('pickup');
  const [editHoveredDay, setEditHoveredDay] = useState<number | null>(null);
  const calendarPopoverRef = useRef<HTMLDivElement>(null);

  // Close calendar popover on outside click
  useEffect(() => {
    const handleCalClick = (e: MouseEvent) => {
      if (calendarPopoverRef.current && !calendarPopoverRef.current.contains(e.target as Node)) {
        setEditCalendarOpen(false);
      }
    };
    if (editCalendarOpen) {
      document.addEventListener('mousedown', handleCalClick);
      return () => document.removeEventListener('mousedown', handleCalClick);
    }
  }, [editCalendarOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    if (activeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeDropdown]);

  // V4.6.68 — Derive dropdown options from real backend data.
  // Vehicle options come from the shared FleetContext (same source as FleetView /
  // NewBookingView). This keeps plate + MMY consistent across the app.
  const vehicleOptions = useMemo(
    () => fleetVehicles.map(v => ({
      id: v.id,
      name: buildMMY({ make: v.make, model: v.model, year: v.year }),
      plate: v.license || '',
      make: v.make || '',
      model: v.model || '',
      year: v.year || null,
    })),
    [fleetVehicles],
  );

  const customerOptions = useMemo(
    () => apiCustomers.map((c: any) => {
      const name = [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim()
        || c?.name
        || c?.email
        || 'Kunde';
      return {
        id: String(c?.id ?? ''),
        name,
        phone: c?.phone ?? '',
        email: c?.email ?? '',
        _raw: c,
      };
    }),
    [apiCustomers],
  );

  const locationOptions = useMemo(
    () => apiStations.map((s: any) => s?.name ?? s?.label ?? '').filter(Boolean),
    [apiStations],
  );

  const employeeOptions = useMemo(
    () => apiUsers.map((u: any) => {
      const n = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
      return n || u?.name || u?.email || '';
    }).filter(Boolean),
    [apiUsers],
  );

  const insuranceOptions = ['Vollkasko', 'Teilkasko', 'Haftpflicht', 'Premium Vollkasko'];
  const paymentOptions = ['Kreditkarte', 'EC-Karte', 'PayPal', 'Lastschrift', 'Rechnung', 'Bar'];
  const sourceOptions = ['Website', 'App', 'Telefon', 'Walk-in', 'Partner'];
  const kmPackageOptions = [
    { km: 500, label: 'Basis' },
    { km: 750, label: 'Standard' },
    { km: 1000, label: 'Komfort' },
    { km: 1500, label: 'Premium' },
    { km: 2000, label: 'Unlimited' },
  ];

  // V4.6.68 — Build a customer-detail lookup (by display name) for the detail
  // card in edit mode. Replaces the old hardcoded Kunde A/B/C mock map.
  const customerDetailByName = useMemo(() => {
    const byName = new Map<string, {
      email: string;
      phone: string;
      address: string;
      city: string;
      customerId: string;
      license: string;
      licenseExpiry: string;
      since: string;
      bookingsCount: number;
    }>();
    apiCustomers.forEach((c: any) => {
      const name = [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim()
        || c?.name
        || c?.email
        || '';
      if (!name) return;
      const createdAt = c?.createdAt ? new Date(c.createdAt) : null;
      const sinceLabel = createdAt && !isNaN(createdAt.getTime())
        ? createdAt.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })
        : '';
      const licenseExpiry = c?.licenseExpiry ? new Date(c.licenseExpiry) : null;
      const licenseExpiryLabel = licenseExpiry && !isNaN(licenseExpiry.getTime())
        ? licenseExpiry.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';
      byName.set(name, {
        email: c?.email || '',
        phone: c?.phone || '',
        address: c?.address || '',
        city: [c?.zip, c?.city].filter(Boolean).join(' ').trim(),
        customerId: (c?.id ? `KD-${String(c.id).slice(-6).toUpperCase()}` : ''),
        license: c?.licenseClass || '',
        licenseExpiry: licenseExpiryLabel,
        since: sinceLabel,
        bookingsCount: typeof c?.bookingCount === 'number' ? c.bookingCount : 0,
      });
    });
    return byName;
  }, [apiCustomers]);

  // Calendar helper functions for inline edit
  const editCalMonthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const editCalMonthNamesShortEN: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const editCalMonthShortEN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Parse "DD Mon YYYY" → ISO "YYYY-MM-DD"
  const parseDateToISO = (dateStr: string): string => {
    if (!dateStr) return '';
    const parts = dateStr.split(' ');
    if (parts.length < 3) return '';
    const day = parseInt(parts[0], 10);
    const month = editCalMonthNamesShortEN[parts[1]];
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || month === undefined || isNaN(year)) return '';
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // ISO "YYYY-MM-DD" → "DD Mon YYYY"
  const isoToDisplayDate = (iso: string): string => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${editCalMonthShortEN[m - 1]} ${y}`;
  };

  const getEditCalendarDays = (month: number, year: number) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMo = new Date(year, month + 1, 0).getDate();
    const adjustedFirst = firstDay === 0 ? 6 : firstDay - 1;
    const days: (number | null)[] = [];
    for (let i = 0; i < adjustedFirst; i++) days.push(null);
    for (let i = 1; i <= daysInMo; i++) days.push(i);
    return days;
  };

  const editCalIsInRange = (day: number) => {
    const pickISO = parseDateToISO(inlineEdit.startDate || '');
    const retISO = parseDateToISO(inlineEdit.endDate || '');
    if (!pickISO || !retISO || !day) return false;
    const dateStr = `${editCalendarYear}-${String(editCalendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return dateStr >= pickISO && dateStr <= retISO;
  };

  const editCalIsStartDay = (day: number) => {
    const pickISO = parseDateToISO(inlineEdit.startDate || '');
    if (!pickISO || !day) return false;
    return `${editCalendarYear}-${String(editCalendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` === pickISO;
  };

  const editCalIsEndDay = (day: number) => {
    const retISO = parseDateToISO(inlineEdit.endDate || '');
    if (!retISO || !day) return false;
    return `${editCalendarYear}-${String(editCalendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` === retISO;
  };

  // V4.6.68 — Derive blocked-day info for the inline edit calendar from real
  // bookings (not hardcoded mock data). A day in the visible month is blocked
  // when it falls inside the date range of any *other* booking for the same
  // vehicle. Handles multi-month bookings correctly (e.g. Jan 25 → Feb 10 will
  // correctly paint both January and February days as blocked when those
  // months are displayed). We intentionally ignore `editingBooking.id` so the
  // user can still see the current booking's own range as editable.
  const getEditBlockedInfo = (vehicleName: string) => {
    const info: Record<number, {
      customer: string;
      startDay: number;
      endDay: number;
      reason: 'booking' | 'maintenance';
    }> = {};
    if (!vehicleName) return info;

    const daysInVisibleMonth = new Date(editCalendarYear, editCalendarMonth + 1, 0).getDate();
    const visibleStart = new Date(editCalendarYear, editCalendarMonth, 1);
    const visibleEnd = new Date(editCalendarYear, editCalendarMonth, daysInVisibleMonth);

    const currentBookingId = isEditMode ? (inlineEdit.id || inlineEdit._bookingId) : null;

    apiBookings.forEach(b => {
      if (currentBookingId && b.id === currentBookingId) return;
      if (b.vehicle !== vehicleName) return;
      if (b.status === 'cancelled') return;
      if (localCancelled.includes(b.id)) return;

      const bStart = new Date(b.startYear, b.startMonth, b.startDay);
      const bEnd = new Date(b.endYear, b.endMonth, b.endDay);
      const overlapStart = bStart > visibleStart ? bStart : visibleStart;
      const overlapEnd = bEnd < visibleEnd ? bEnd : visibleEnd;
      if (overlapStart > overlapEnd) return;

      for (let d = overlapStart.getDate(); d <= overlapEnd.getDate(); d++) {
        info[d] = {
          customer: b.customer,
          startDay: b.startDay,
          endDay: b.endDay,
          reason: 'booking',
        };
      }
    });

    return info;
  };

  const handleEditCalendarDayClick = (day: number, blockedDays: number[]) => {
    if (!day || blockedDays.includes(day)) return;
    const dateISO = `${editCalendarYear}-${String(editCalendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const displayDt = isoToDisplayDate(dateISO);

    const hasBlockedBetween = (sDay: number, eDay: number) => blockedDays.some(bd => bd > sDay && bd < eDay);

    if (editCalendarMode === 'pickup') {
      setInlineEdit(prev => ({ ...prev, startDate: displayDt }));
      const retISO = parseDateToISO(inlineEdit.endDate || '');
      if (retISO && dateISO >= retISO) {
        setInlineEdit(prev => ({ ...prev, startDate: displayDt, endDate: '' }));
      } else if (retISO) {
        const retDay = parseInt(retISO.split('-')[2], 10);
        const retMo = parseInt(retISO.split('-')[1], 10) - 1;
        if (retMo === editCalendarMonth && hasBlockedBetween(day, retDay)) {
          setInlineEdit(prev => ({ ...prev, startDate: displayDt, endDate: '' }));
        }
      }
      setEditCalendarMode('return');
    } else {
      const pickISO = parseDateToISO(inlineEdit.startDate || '');
      if (pickISO && dateISO <= pickISO) {
        setInlineEdit(prev => ({ ...prev, startDate: displayDt, endDate: '' }));
        setEditCalendarMode('return');
      } else {
        if (pickISO) {
          const pickDay = parseInt(pickISO.split('-')[2], 10);
          const pickMo = parseInt(pickISO.split('-')[1], 10) - 1;
          if (pickMo === editCalendarMonth && hasBlockedBetween(pickDay, day)) return;
        }
        setInlineEdit(prev => ({ ...prev, endDate: displayDt }));
        setEditCalendarMode('pickup');
      }
    }
  };

  const openEditCalendar = (mode: 'pickup' | 'return') => {
    const dateStr = mode === 'pickup' ? (inlineEdit.startDate || '') : (inlineEdit.endDate || '');
    if (dateStr) {
      const iso = parseDateToISO(dateStr);
      if (iso) {
        const [y, m] = iso.split('-').map(Number);
        setEditCalendarMonth(m - 1);
        setEditCalendarYear(y);
      }
    }
    setEditCalendarMode(mode);
    setEditCalendarOpen(true);
  };

  const enterEditMode = (booking: any) => {
    setInlineEdit({
      _bookingId: booking.id,
      vehicle: booking.vehicle,
      plate: booking.plate,
      customer: booking.customer,
      customerPhone: booking.customerPhone,
      startDate: booking.startDate,
      endDate: booking.endDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      pickupLocation: booking.pickupLocation,
      returnLocation: booking.returnLocation,
      insurance: booking.insurance,
      paymentMethod: booking.paymentMethod,
      bookingSource: booking.bookingSource,
      bookedBy: booking.bookedBy,
      pickupHandoverBy: booking.pickupHandoverBy || '',
      returnHandoverBy: booking.returnHandoverBy || '',
      includedKm: booking.includedKm,
      notes: booking.notes || '',
      fuelLevel: booking.fuelLevel,
    });
    setIsEditMode(true);
    setActiveDropdown(null);
    setEditCalendarOpen(false);
  };

  const cancelEditMode = () => {
    setIsEditMode(false);
    setInlineEdit({});
    setActiveDropdown(null);
    setEditCalendarOpen(false);
  };

  const saveInlineEdit = (booking: any) => {
    // V4.6.68 — Strip internal tracking fields (_bookingId) before merging so
    // they never leak into downstream booking payloads or UI.
    const { _bookingId: _omitBookingId, ...cleanEdit } = inlineEdit;
    const updatedBooking = { ...booking, ...cleanEdit };
    setLocalEdits(prev => ({ ...prev, [booking.id]: cleanEdit }));
    onBookingUpdated?.(updatedBooking);
    toast.success('Buchung aktualisiert', {
      description: `${cleanEdit.vehicle || booking.vehicle} • ${cleanEdit.customer || booking.customer}`,
      duration: 3000,
    });
    setIsEditMode(false);
    setInlineEdit({});
    setActiveDropdown(null);
  };

  // Reusable inline editable field component helper
  const EditableDropdown = ({ fieldKey, icon: Icon, label, value, options, iconColor, renderOption }: {
    fieldKey: string;
    icon: any;
    label: string;
    value: string;
    options: string[];
    iconColor?: string;
    renderOption?: (opt: string) => React.ReactNode;
  }) => {
    const isOpen = activeDropdown === fieldKey;
    return (
      <div className="relative" ref={isOpen ? dropdownRef : undefined}>
        <div
          onClick={() => isEditMode && setActiveDropdown(isOpen ? null : fieldKey)}
          className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 ${
            'bg-muted/50'
          } ${isEditMode ? 'cursor-pointer ring-1 ring-transparent hover:ring-blue-500/40 group' : ''}`}
        >
          <Icon className={`w-5 h-5 ${iconColor || ('text-muted-foreground')}`} />
          <div className="flex-1 min-w-0">
            <div className={`text-xs text-muted-foreground`}>{label}</div>
            <div className={`text-xs font-semibold text-foreground`}>
              {isEditMode ? (inlineEdit[fieldKey] || value) : value}
            </div>
          </div>
          {isEditMode && (
            <div className={`flex items-center gap-1 text-[color:var(--brand)]`}>
              <Icon name="pencil" className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <Icon name="chevron-down" className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          )}
        </div>
        {isOpen && (
          <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
            'bg-card border-border'
          }`}>
            <div className="max-h-48 overflow-y-auto py-1">
              {options.map(opt => (
                <button
                  key={opt}
                  onClick={() => { setInlineEdit(prev => ({ ...prev, [fieldKey]: opt })); setActiveDropdown(null); }}
                  className={`w-full text-left px-3 py-2.5 text-xs transition-colors ${
                    (inlineEdit[fieldKey] || value) === opt
                      ? 'sq-tone-brand'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {renderOption ? renderOption(opt) : opt}
                  {(inlineEdit[fieldKey] || value) === opt && <Icon name="check-circle" className="w-3.5 h-3.5 inline ml-2" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const EditableInput = ({ fieldKey, icon: Icon, label, value, type = 'text', iconColor }: {
    fieldKey: string;
    icon: any;
    label: string;
    value: string;
    type?: string;
    iconColor?: string;
  }) => (
    <div className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 ${
      'bg-muted/50'
    } ${isEditMode ? 'ring-1 ring-transparent hover:ring-blue-500/40 group' : ''}`}>
      <Icon className={`w-5 h-5 ${iconColor || ('text-muted-foreground')}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-xs text-muted-foreground`}>{label}</div>
        {isEditMode ? (
          <input
            type={type}
            value={inlineEdit[fieldKey] ?? value}
            onChange={(e) => setInlineEdit(prev => ({ ...prev, [fieldKey]: e.target.value }))}
            className={`w-full text-xs font-semibold bg-transparent outline-none border-b transition-colors ${
              'text-foreground border-border focus:border-[color:var(--brand)]'
            }`}
          />
        ) : (
          <div className={`text-xs font-semibold text-foreground`}>{value}</div>
        )}
      </div>
      {isEditMode && !isEditMode ? null : isEditMode && (
        <Icon name="pencil" className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-[color:var(--brand)]`} />
      )}
    </div>
  );

  const handleClosePopup = () => {
    setPopupBookingId(null);
    setSelectedBookingId(null);
  };

  // Open edit modal for a booking
  const openEditModal = (booking: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBooking(booking);
    setEditForm({
      startDate: booking.startDate,
      endDate: booking.endDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      pickupLocation: booking.pickupLocation,
      returnLocation: booking.returnLocation,
      insurance: booking.insurance,
      paymentMethod: booking.paymentMethod || 'Kreditkarte',
      notes: booking.notes || '',
      customer: booking.customer || '',
      vehicle: booking.vehicle || '',
      plate: booking.plate || '',
    });
  };

  const saveEdit = async () => {
    if (!editingBooking || !orgId) return;
    const updatedBooking = { ...editingBooking, ...editForm };
    try {
      const startIso = editForm.startDate && editForm.startTime
        ? new Date(`${editForm.startDate}T${editForm.startTime}:00`).toISOString()
        : undefined;
      const endIso = editForm.endDate && editForm.endTime
        ? new Date(`${editForm.endDate}T${editForm.endTime}:00`).toISOString()
        : undefined;

      const patch: any = {};
      if (startIso) patch.startDate = startIso;
      if (endIso) patch.endDate = endIso;
      if (editForm.notes !== undefined) patch.notes = editForm.notes;
      if (Array.isArray(editForm.insurance)) patch.insuranceOptions = editForm.insurance;
      else if (typeof editForm.insurance === 'string' && editForm.insurance) patch.insuranceOptions = [editForm.insurance];

      // Only call API for bookings that exist server-side (UUID-like id)
      const isPersistedId = typeof editingBooking.id === 'string' && !editingBooking.id.startsWith('new-');
      if (isPersistedId && Object.keys(patch).length > 0) {
        await api.bookings.update(orgId, editingBooking.id, patch);
      }

      setLocalEdits(prev => ({ ...prev, [editingBooking.id]: editForm }));
      onBookingUpdated?.(updatedBooking);
      toast.success('Buchung aktualisiert', {
        description: `${editForm.vehicle || editingBooking.vehicle} • ${editForm.customer || editingBooking.customer}`,
        duration: 3000,
      });
      setEditingBooking(null);
      loadBookings();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Buchung konnte nicht gespeichert werden';
      toast.error('Fehler beim Speichern', { description: String(msg) });
    }
  };

  const confirmCancel = (bookingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelConfirmId(bookingId);
  };

  // V4.6.81 — Open the "Kunde nicht erschienen" confirmation modal.
  // Backend guards ensure the booking is CONFIRMED and the planned
  // pickup is in the past, but we still stop event propagation so this
  // never triggers row-click navigation.
  const confirmNoShow = (bookingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNoShowReason('');
    setNoShowConfirmId(bookingId);
  };

  const executeNoShow = async () => {
    if (!noShowConfirmId || !orgId || noShowSubmitting) return;
    const allBk = [...activeBookings, ...upcomingBookings, ...completedBookings];
    const booking = allBk.find(b => b.id === noShowConfirmId);
    try {
      setNoShowSubmitting(true);
      await api.bookings.markNoShow(orgId, noShowConfirmId, noShowReason.trim() || null);
      // Treat it like a cancellation for local state: the booking is now
      // effectively off the active board and the vehicle is free again.
      setLocalCancelled(prev => [...prev, noShowConfirmId]);
      onBookingCancelled?.(noShowConfirmId);
      toast.success('Als No-Show markiert', {
        description: booking ? `${booking.vehicle} • ${booking.customer}` : undefined,
        duration: 3000,
      });
      loadBookings();
      if (detailBookingId === noShowConfirmId) {
        setDetailBookingId(null);
      }
      setNoShowConfirmId(null);
      setNoShowReason('');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'No-Show konnte nicht gesetzt werden';
      toast.error('Fehler beim Markieren als No-Show', { description: String(msg) });
    } finally {
      setNoShowSubmitting(false);
    }
  };

  const executeCancel = async () => {
    if (!cancelConfirmId || !orgId) return;
    const allBk = [...activeBookings, ...upcomingBookings, ...completedBookings];
    const booking = allBk.find(b => b.id === cancelConfirmId);
    const isPersistedId = typeof cancelConfirmId === 'string' && !cancelConfirmId.startsWith('new-');
    try {
      if (isPersistedId) {
        await api.bookings.cancel(orgId, cancelConfirmId);
      }
      setLocalCancelled(prev => [...prev, cancelConfirmId]);
      onBookingCancelled?.(cancelConfirmId);
      toast.success('Buchung storniert', {
        description: booking ? `${booking.vehicle} • ${booking.customer}` : undefined,
        duration: 3000,
      });
      loadBookings();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Stornieren fehlgeschlagen';
      toast.error('Fehler beim Stornieren', { description: String(msg) });
      setCancelConfirmId(null);
      return;
    }
    // If we're in detail view for this booking, navigate back
    if (detailBookingId === cancelConfirmId) {
      setDetailBookingId(null);
    }
    setCancelConfirmId(null);
  };

  const today = new Date();
  const [displayMonth, setDisplayMonth] = useState(today.getMonth());
  const [displayYear, setDisplayYear] = useState(today.getFullYear());

  const goToPrevMonth = () => {
    if (displayMonth === 0) {
      setDisplayMonth(11);
      setDisplayYear(displayYear - 1);
    } else {
      setDisplayMonth(displayMonth - 1);
    }
    setSelectedDate(null);
  };

  const goToNextMonth = () => {
    if (displayMonth === 11) {
      setDisplayMonth(0);
      setDisplayYear(displayYear + 1);
    } else {
      setDisplayMonth(displayMonth + 1);
    }
    setSelectedDate(null);
  };

  const goToCurrentMonth = () => {
    setDisplayMonth(today.getMonth());
    setDisplayYear(today.getFullYear());
    setSelectedDate(null);
  };

  const isCurrentMonth = displayMonth === today.getMonth() && displayYear === today.getFullYear();

  const monthNamesDE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  // Mock generator disabled: no placeholder rows when API has no bookings
  const generateBookingsForMonth = (_month: number, _year: number) => {
    return { active: [], upcoming: [], completed: [] };
  };

  // Use API bookings once loaded (including empty list); otherwise empty until load / no org
  const useApiData = apiLoaded;
  const { active: generatedActive, upcoming: generatedUpcoming, completed: generatedCompleted } = useApiData
    ? { active: apiBookings.filter((b: any) => b.status === 'active'), upcoming: apiBookings.filter((b: any) => b.status === 'confirmed' || b.status === 'pending'), completed: apiBookings.filter((b: any) => b.status === 'completed') }
    : generateBookingsForMonth(displayMonth, displayYear);

  // Merge additional bookings (created via NewBookingView) into correct category for current month.
  // V4.6.68 — Deduplicate against `apiBookings` by id. When a booking is created via
  // NewBookingView, App.tsx pushes it into `createdBookings` (passed here as
  // `additionalBookings`) AND the record is persisted to the backend, so the
  // next `api.bookings.list(orgId)` round also returns it — previously this
  // caused the just-created booking to appear twice in the "Upcoming" list.
  const monthNamesShortEN_lookup = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const apiBookingIds = new Set(apiBookings.map((b: any) => b?.id).filter(Boolean));
  const additionalForMonth = additionalBookings.filter(b => {
    if (b?.id && apiBookingIds.has(b.id)) return false;
    if (b.startMonth !== undefined && b.startYear !== undefined) {
      return b.startMonth === displayMonth && b.startYear === displayYear;
    }
    const match = b.startDate?.match(/\d+\s+(\w+)\s+(\d+)/);
    if (match) {
      const mIdx = monthNamesShortEN_lookup.indexOf(match[1]);
      return mIdx === displayMonth && parseInt(match[2], 10) === displayYear;
    }
    return false;
  });
  
  const additionalActive = additionalForMonth.filter((b: any) => b.status === 'active');
  const additionalUpcoming = additionalForMonth.filter((b: any) => b.status === 'confirmed' || b.status === 'pending');
  const additionalCompleted = additionalForMonth.filter((b: any) => b.status === 'completed');

  // Apply local edits and filter cancelled bookings
  const applyEdits = (bookings: any[]) => bookings
    .filter(b => !localCancelled.includes(b.id))
    .map(b => localEdits[b.id] ? { ...b, ...localEdits[b.id] } : b);

  const activeBookings = applyEdits([...generatedActive, ...additionalActive]);
  const upcomingBookings = applyEdits([...generatedUpcoming, ...additionalUpcoming]);
  const completedBookings = applyEdits([...generatedCompleted, ...additionalCompleted]);

  // V4.6.76 Rental Health V1 — derive the detail booking's vehicle at the
  // top level so we can unconditionally call useVehicleHealth (hooks MUST
  // run on every render). Passing a null vehicleId short-circuits the fetch.
  const detailVehicleId = useMemo(() => {
    if (!detailBookingId) return null;
    const all = [...activeBookings, ...upcomingBookings, ...completedBookings];
    const b = all.find((x) => x.id === detailBookingId) as any;
    return (b?.vehicleId ?? b?._raw?.vehicleId ?? null) as string | null;
  }, [detailBookingId, activeBookings, upcomingBookings, completedBookings]);
  const { data: detailHealth } = useVehicleHealth(orgId, detailVehicleId);

  // V4.6.95 — Fetch the canonical RentalDrivingAnalysis row for the booking
  // currently shown in the detail panel. Drives the rebuilt
  // "Booking Driving Analysis" card (replaces the previous dead UI which
  // was wired to mock `drivingBehavior` / `abuseDetection` arrays). Backend
  // is the single source of truth; the frontend only formats this payload.
  const [bookingAnalysis, setBookingAnalysis] = useState<any | null>(null);
  const [bookingAnalysisLoading, setBookingAnalysisLoading] = useState(false);
  useEffect(() => {
    if (!orgId || !detailBookingId) {
      setBookingAnalysis(null);
      return;
    }
    let cancelled = false;
    setBookingAnalysisLoading(true);
    api.rentalDrivingAnalyses
      .list(orgId, { bookingId: detailBookingId, limit: 1 })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setBookingAnalysis(rows[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setBookingAnalysis(null);
      })
      .finally(() => {
        if (!cancelled) setBookingAnalysisLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, detailBookingId]);

  // V4.6.99 — Cross-View-Deep-Link konsumieren. Wenn die App einen
  // `initialDetailBookingId` mitliefert (Dashboard-BK-Chip-Click), öffnen
  // wir genau einmal die zugehörige Detail-Seite. `consumed`-Ack räumt
  // den Pending-State im Parent auf, sodass „Detail schliessen" nicht
  // versehentlich den Deep-Link wieder reöffnet.
  useEffect(() => {
    if (!initialDetailBookingId) return;
    setDetailBookingId(initialDetailBookingId);
    setSelectedBookingId(initialDetailBookingId);
    onConsumeInitialDetailBookingId?.();
  }, [initialDetailBookingId, onConsumeInitialDetailBookingId]);

  // Notify parent about active booking ref for breadcrumb
  useEffect(() => {
    if (detailBookingId) {
      const allBookings = [...activeBookings, ...upcomingBookings, ...completedBookings];
      const booking = allBookings.find(b => b.id === detailBookingId);
      onActiveBookingRefChange?.(booking?.bookingRef ?? null);
    } else {
      onActiveBookingRefChange?.(null);
    }
  }, [detailBookingId]);

  // Calendar logic
  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(displayYear, displayMonth, 1).getDay();

  // V4.6.68 — Compute the list of days within the currently displayed month
  // that are covered by a booking. The previous implementation naively took
  // `startDay..endDay` which broke for bookings spanning across months
  // (e.g. Jan 28 → Feb 5 would show Jan 28..Jan 5 which is invalid). We now
  // intersect the booking's real [start, end] range with the visible month.
  const getBookingDaysInDisplayMonth = (booking: any): number[] => {
    const hasStructured = typeof booking?.startDay === 'number'
      && typeof booking?.startMonth === 'number'
      && typeof booking?.startYear === 'number'
      && typeof booking?.endDay === 'number'
      && typeof booking?.endMonth === 'number'
      && typeof booking?.endYear === 'number';
    if (!hasStructured) {
      const match = /(\d+)\s+(\w+)\s+(\d+)/;
      const s = String(booking?.startDate ?? '').match(match);
      const e = String(booking?.endDate ?? '').match(match);
      if (!s || !e) return [];
      const monthIdx: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
      const sDay = parseInt(s[1], 10);
      const sMo = monthIdx[s[2]] ?? 0;
      const sYr = parseInt(s[3], 10);
      const eDay = parseInt(e[1], 10);
      const eMo = monthIdx[e[2]] ?? 0;
      const eYr = parseInt(e[3], 10);
      return intersectRangeWithDisplayMonth(sYr, sMo, sDay, eYr, eMo, eDay);
    }
    return intersectRangeWithDisplayMonth(
      booking.startYear, booking.startMonth, booking.startDay,
      booking.endYear, booking.endMonth, booking.endDay,
    );
  };

  function intersectRangeWithDisplayMonth(
    sYr: number, sMo: number, sDay: number,
    eYr: number, eMo: number, eDay: number,
  ): number[] {
    const start = new Date(sYr, sMo, sDay);
    const end = new Date(eYr, eMo, eDay);
    const visibleStart = new Date(displayYear, displayMonth, 1);
    const visibleEnd = new Date(displayYear, displayMonth + 1, 0);
    const overlapStart = start > visibleStart ? start : visibleStart;
    const overlapEnd = end < visibleEnd ? end : visibleEnd;
    if (overlapStart > overlapEnd) return [];
    const days: number[] = [];
    for (let d = overlapStart.getDate(); d <= overlapEnd.getDate(); d++) days.push(d);
    return days;
  }

  // Get all bookings with their day ranges for the displayed month
  const allBookingsWithDays = [...activeBookings, ...upcomingBookings, ...completedBookings].map(booking => ({
    ...booking,
    days: getBookingDaysInDisplayMonth(booking),
  }));
  const bookingsInDisplayMonth = allBookingsWithDays.filter((booking) => booking.days.length > 0);
  const displayMonthActiveBookings = bookingsInDisplayMonth.filter((booking) => booking.status === 'active');
  const displayMonthUpcomingBookings = bookingsInDisplayMonth.filter((booking) => booking.status === 'confirmed' || booking.status === 'pending');
  const displayMonthCompletedBookings = bookingsInDisplayMonth.filter((booking) => booking.status === 'completed');

  // Check if a day has any bookings
  const getDayBookings = (day: number) => {
    return allBookingsWithDays.filter(booking => booking.days.includes(day));
  };

  // Check if a day is part of the hovered booking
  const isDayInHoveredBooking = (day: number): boolean => {
    if (!selectedBookingId) return false;
    const hovered = allBookingsWithDays.find(b => b.id === selectedBookingId);
    return hovered ? hovered.days.includes(day) : false;
  };

  const getHoveredBookingColor = (): 'blue' | 'purple' | 'green' => {
    if (!selectedBookingId) return 'blue';
    const hovered = allBookingsWithDays.find(b => b.id === selectedBookingId);
    if (!hovered) return 'blue';
    if (hovered.status === 'active') return 'blue';
    if (hovered.status === 'confirmed' || hovered.status === 'pending') return 'purple';
    return 'green';
  };

  // Check if a day has bookings matching the active tab
  const isDayInActiveTab = (day: number): boolean => {
    if (activeTab === null) return false;
    const statuses = getDayBookingsByStatus(day);
    if (activeTab === 'active') return statuses.active.length > 0;
    if (activeTab === 'upcoming') return statuses.upcoming.length > 0;
    return statuses.completed.length > 0;
  };

  // Get bookings by status for a specific day
  const getDayBookingsByStatus = (day: number) => {
    const bookings = getDayBookings(day);
    return {
      active: bookings.filter(b => b.status === 'active'),
      upcoming: bookings.filter(b => b.status === 'confirmed' || b.status === 'pending'),
      completed: bookings.filter(b => b.status === 'completed'),
    };
  };

  // Handle day click - filter bookings and auto-select tab
  const handleDayClick = (day: number) => {
    // If a booking is selected and we click any day, deselect the booking
    if (selectedBookingId) {
      setSelectedBookingId(null);
      return;
    }
    if (selectedDate === day) {
      // Deselect if clicking same day
      setSelectedDate(null);
      return;
    }
    setSelectedDate(day);
    const dayStatuses = getDayBookingsByStatus(day);
    // Auto-select first available tab
    if (dayStatuses.active.length > 0) {
      setActiveTab('active');
    } else if (dayStatuses.upcoming.length > 0) {
      setActiveTab('upcoming');
    } else if (dayStatuses.completed.length > 0) {
      setActiveTab('completed');
    }
  };

  // Handle booking card click - highlight in calendar
  const handleBookingClick = (bookingId: string) => {
    if (selectedBookingId === bookingId) {
      setSelectedBookingId(null);
    } else {
      setSelectedBookingId(bookingId);
      setSelectedDate(null); // Clear day filter when selecting a booking
    }
  };

  // Get the selected booking's day range and status color
  const selectedBooking = selectedBookingId 
    ? allBookingsWithDays.find(b => b.id === selectedBookingId) 
    : null;

  const isDayInSelectedBooking = (day: number): boolean => {
    if (!selectedBooking) return false;
    return selectedBooking.days.includes(day);
  };

  const getSelectedBookingColor = (): 'blue' | 'purple' | 'green' => {
    if (!selectedBooking) return 'blue';
    if (selectedBooking.status === 'active') return 'blue';
    if (selectedBooking.status === 'confirmed' || selectedBooking.status === 'pending') return 'purple';
    return 'green';
  };

  // Search filter helper
  const matchesSearch = (b: typeof activeBookings[0]) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      b.customer.toLowerCase().includes(q) ||
      b.vehicle.toLowerCase().includes(q) ||
      b.plate.toLowerCase().includes(q) ||
      b.bookingRef.toLowerCase().includes(q) ||
      b.pickupLocation.toLowerCase().includes(q) ||
      b.returnLocation.toLowerCase().includes(q) ||
      b.status.toLowerCase().includes(q) ||
      b.revenue.toLowerCase().includes(q) ||
      (b.notes && b.notes.toLowerCase().includes(q))
    );
  };

  // Filtered bookings based on selectedDate + search
  const getFilteredBookings = (tab: 'active' | 'upcoming' | 'completed') => {
    const source = tab === 'active' ? displayMonthActiveBookings : tab === 'upcoming' ? displayMonthUpcomingBookings : displayMonthCompletedBookings;
    return source.filter(b => {
      if (!matchesSearch(b)) return false;
      if (selectedDate === null) return true;
      return b.days.includes(selectedDate);
    });
  };

  // When activeTab is null, show all bookings combined
  const getAllFilteredBookings = () => {
    return bookingsInDisplayMonth.filter(b => {
      if (!matchesSearch(b)) return false;
      if (selectedDate === null) return true;
      return b.days.includes(selectedDate);
    });
  };

  const filteredBookings = activeTab !== null ? getFilteredBookings(activeTab) : getAllFilteredBookings();

  // Counts for day-filtered tabs (respects search + date)
  const dayFilteredCounts = {
    active: getFilteredBookings('active').length,
    upcoming: getFilteredBookings('upcoming').length,
    completed: getFilteredBookings('completed').length,
  };
  const totalContextBookings = getAllFilteredBookings().length;
  const totalMetricLabel = selectedDate !== null
    ? 'Selected Day'
    : searchQuery.trim()
      ? 'Selection'
      : 'Month Total';
  const bookingMetricCards: Array<{
    label: string;
    value: number;
    icon: string;
    tone: 'brand' | 'success' | 'warning' | 'neutral';
    tab: 'active' | 'upcoming' | 'completed' | null;
  }> = [
    { label: totalMetricLabel, value: totalContextBookings, icon: 'book-open', tone: 'brand', tab: null },
    { label: 'Active', value: dayFilteredCounts.active, icon: 'zap', tone: 'brand', tab: 'active' },
    { label: 'Upcoming', value: dayFilteredCounts.upcoming, icon: 'clock', tone: 'warning', tab: 'upcoming' },
    { label: 'Completed', value: dayFilteredCounts.completed, icon: 'check-circle', tone: 'success', tab: 'completed' },
  ];

  const bookingTableColumns = useMemo(
    () => [
      {
        key: 'customer',
        header: 'Customer',
        cell: (booking: BookingUiRow) => (
          <div>
            <div className="font-semibold text-foreground">{booking.customer}</div>
            <div className="text-[10px] font-mono text-muted-foreground">Ref: {booking.bookingRef}</div>
          </div>
        ),
      },
      {
        key: 'vehicle',
        header: 'Vehicle',
        cell: (booking: BookingUiRow) => (
          <div className="text-xs">
            <div className="font-medium text-foreground">{booking.vehicle}</div>
            <div className="text-muted-foreground">{booking.plate}</div>
          </div>
        ),
      },
      {
        key: 'period',
        header: 'Period',
        cell: (booking: BookingUiRow) => (
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {booking.startDate} – {booking.endDate}
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        cell: (booking: BookingUiRow) => (
          <StatusChip tone={bookingStatusTone(booking.status)} dot={booking.status === 'active'}>
            {bookingStatusLabel(booking.status)}
          </StatusChip>
        ),
      },
      {
        key: 'revenue',
        header: 'Revenue',
        align: 'right' as const,
        numeric: true,
        cell: (booking: BookingUiRow) => (
          <span className="font-semibold text-[color:var(--status-success)]">{booking.revenue}</span>
        ),
      },
    ],
    [],
  );

  const popupBooking = useMemo(() => {
    if (!popupBookingId) return null;
    const allBookings = [...activeBookings, ...upcomingBookings, ...completedBookings];
    return allBookings.find((b) => b.id === popupBookingId) ?? null;
  }, [popupBookingId, activeBookings, upcomingBookings, completedBookings]);

  const listSectionTitle =
    activeTab === null
      ? 'All bookings'
      : activeTab === 'active'
        ? 'Active bookings'
        : activeTab === 'upcoming'
          ? 'Upcoming bookings'
          : 'Completed bookings';
  
  // Generate calendar days
  const calendarDays = [];
  // Add empty cells for days before the first day of month
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  // Add actual days
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  // Detail View - Full page booking detail
  if (detailBookingId) {
    const allBookings = [...activeBookings, ...upcomingBookings, ...completedBookings];
    const detailBooking = allBookings.find(b => b.id === detailBookingId);
    if (!detailBooking) {
      // V4.6.95 — Don't drop a deep-linked detail id while the bookings
      // list is still mid-fetch. Without this guard, a click from the
      // dashboard's Active-Rented card briefly mounts `BookingsView`,
      // sets `detailBookingId` from `initialDetailBookingId`, and on the
      // very next render — bookings still loading, so `allBookings` is
      // empty — the missing-booking branch fired and reset the state,
      // kicking the dispatcher back to the booking calendar instead of
      // the requested detail page. We render a lightweight skeleton
      // until the API resolves; only when the list is loaded AND still
      // doesn't contain the id do we drop the deep-link (e.g. booking
      // was cancelled in another tab).
      if (!apiLoaded) {
        return (
          <div className="max-w-[1800px] mx-auto px-4 py-10">
            <div className={`flex items-center gap-3 text-sm text-muted-foreground`}>
              <Icon name="loader-2" className="w-4 h-4 animate-spin" />
              <span>Lade Buchung…</span>
            </div>
          </div>
        );
      }
      setDetailBookingId(null);
      return null;
    }
    const detailStatusColor = detailBooking.status === 'active' ? 'blue' : detailBooking.status === 'confirmed' || detailBooking.status === 'pending' ? 'purple' : 'green';
    const detailStatusLabel = detailBooking.status === 'active' ? 'Active' : detailBooking.status === 'pending' ? 'Pending' : detailBooking.status === 'confirmed' ? 'Confirmed' : 'Completed';

    return (
      <>
      <div className="max-w-[1800px] mx-auto">
        {/* Header with Back Button */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => { setDetailBookingId(null); cancelEditMode(); }}
            className={`p-3 rounded-lg transition-all duration-200 ${
              'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="arrow-left" className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              'bg-muted'
            }`}>
              <Icon name="hash" className={`w-5 h-5 text-muted-foreground`} />
              <span className={`text-xs font-mono font-semibold text-foreground`}>
                {detailBooking.bookingRef}
              </span>
            </div>
            <h1 className={`text-lg font-bold tracking-tight text-foreground`}>
              Booking Details
            </h1>
            <span className={`text-xs px-3 py-1.5 rounded-full font-semibold flex items-center gap-1.5 ${
              detailStatusColor === 'blue' ? ('sq-tone-brand') :
              detailStatusColor === 'purple' ? (detailBooking.status === 'pending' ? ('sq-tone-warning') : ('sq-tone-success')) :
              ('sq-tone-success')
            }`}>
              {detailBooking.status === 'active' && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>}
              {detailBooking.status === 'completed' && <Icon name="check-circle" className="w-5 h-5" />}
              {detailStatusLabel}
            </span>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Action Bar for upcoming bookings */}
          {/* Edit Mode Action Bar */}
          {isEditMode ? (
            <div className="col-span-12">
              <div className={`flex items-center justify-between px-3 py-3 rounded-lg border ${
                'sq-tone-brand border border-current/20'
              }`}>
                <div className="flex items-center gap-3">
                  <Icon name="pencil" className={`w-5 h-5 text-[color:var(--brand)]`} />
                  <span className={`text-xs font-semibold ${'text-[color:var(--brand)]'}`}>
                    Bearbeitungsmodus aktiv — Klicke auf ein Feld zum Ändern
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={cancelEditMode}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-200 ${
                      'bg-card text-foreground hover:bg-muted border border-border'
                    }`}
                  >
                    <Icon name="x" className="w-3.5 h-3.5" />
                    Abbrechen
                  </button>
                  <button
                    onClick={() => saveInlineEdit(detailBooking)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-blue-600 text-white hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    <Icon name="save" className="w-3.5 h-3.5" />
                    Änderungen speichern
                  </button>
                </div>
              </div>
            </div>
          ) : (detailBooking.status === 'confirmed' || detailBooking.status === 'pending') ? (
            <div className="col-span-12 space-y-2">
              {/* V4.6.81 — Overdue-Pickup-Banner. Ein bestätigter Pickup
                  gilt als überfällig, wenn startDate < jetzt und noch
                  kein PICKUP-Handover existiert. Der Banner bietet zwei
                  Pfade: "Pickup nachtragen" (öffnet Handover-Dialog mit
                  Backdate-Feld) und "Kunde nicht erschienen" (setzt
                  status=NO_SHOW via markNoShow-Endpoint). */}
              {(() => {
                if (detailBooking.status !== 'confirmed' && detailBooking.status !== 'pending') return null;
                if (detailBooking.pickupProtocol) return null;
                const startIso = (detailBooking._raw as any)?.startDate;
                if (!startIso) return null;
                const start = new Date(startIso);
                if (Number.isNaN(start.getTime())) return null;
                const now = new Date();
                if (start >= now) return null;
                const deltaMin = Math.floor((now.getTime() - start.getTime()) / 60_000);
                const hours = Math.floor(deltaMin / 60);
                const mins = deltaMin % 60;
                const label = hours >= 24
                  ? `${Math.floor(hours / 24)} Tag${Math.floor(hours / 24) === 1 ? '' : 'e'} ${hours % 24} h`
                  : hours > 0
                    ? `${hours} h ${mins} Min.`
                    : `${mins} Min.`;
                const isCritical = deltaMin >= 24 * 60;
                const bannerBg = isCritical
                  ? 'sq-tone-critical border border-current/30'
                  : 'sq-tone-warning border border-current/30';
                const iconColor = isCritical
                  ? 'text-[color:var(--status-critical)]'
                  : 'text-[color:var(--status-attention)]';
                const textColor = isCritical
                  ? 'text-[color:var(--status-critical)]'
                  : 'text-[color:var(--status-attention)]';
                return (
                  <div className={`flex items-start gap-3 px-3 py-3 rounded-lg border ${bannerBg}`}>
                    <Icon name="alert-triangle" className={`w-5 h-5 mt-0.5 shrink-0 ${iconColor}`} />
                    <div className="min-w-0 flex-1">
                      <div className={`text-xs font-semibold ${textColor}`}>
                        Pickup überfällig seit {label}
                      </div>
                      <div className={`mt-0.5 text-[11px] ${textColor} opacity-90`}>
                        Geplant war {start.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}.
                        Noch kein Übergabeprotokoll erfasst — entweder Pickup nachtragen oder als No-Show markieren.
                      </div>
                    </div>
                    <button
                      onClick={(e) => confirmNoShow(detailBooking.id, e)}
                      className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        'sq-tone-critical border border-current/30'
                      }`}
                    >
                      <Icon name="user-x" className="w-3.5 h-3.5" />
                      Kunde nicht erschienen
                    </button>
                  </div>
                );
              })()}
              {/* V4.6.76 Rental Health V1 — if the vehicle currently fails the
                  rental_blocked gate (TÜV überfällig, Limp Mode aktiv, Bremsen
                  kritisch, etc.), surface it above the action row and disable
                  "Pickup bestätigen". This keeps the UI and the backend gate
                  in BookingsService.create / handover flows in agreement. */}
              {detailHealth?.rental_blocked ? (
                <div className={`flex items-start gap-3 px-3 py-3 rounded-lg border ${
                  'sq-tone-critical border border-current/20'
                }`}>
                  <Icon name="alert-triangle" className={`w-5 h-5 mt-0.5 shrink-0 text-[color:var(--status-critical)]`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold ${'text-[color:var(--status-critical)]'}`}>
                        Fahrzeug ist aktuell nicht vermietbar
                      </span>
                      <RentalHealthBadge
                        health={detailHealth}
                        size="sm"
                        showBlockingLabel
                      />
                    </div>
                    <div className={`mt-1 text-xs ${'text-[color:var(--status-critical)]/90'}`}>
                      {detailHealth.blocking_reasons.join(' · ')}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className={`flex items-center justify-between px-3 py-3 rounded-lg border ${
                'sq-tone-warning border border-current/20'
              }`}>
                <div className="flex items-center gap-3">
                  <Icon name="info" className={`w-5 h-5 text-[color:var(--status-attention)]`} />
                  <span className={`text-xs ${'text-[color:var(--status-attention)]'}`}>
                    Diese Buchung ist noch bevorstehend und kann bearbeitet oder storniert werden.
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  {/* V4.6.75 — Primary call-to-action when a confirmed booking
                      hasn't been picked up yet. Opens the Übergabeprotokoll
                      dialog via HandoverProvider; on success the booking
                      transitions to ACTIVE server-side.
                      V4.6.76 Rental Health V1 — disable if rental_blocked. */}
                  <button
                    disabled={detailHealth?.rental_blocked === true}
                    onClick={() => {
                      if (detailHealth?.rental_blocked) {
                        toast.error('Fahrzeug nicht vermietbar', {
                          description: detailHealth.blocking_reasons.join(' · '),
                          duration: 8000,
                        });
                        return;
                      }
                      openHandover({
                        bookingId: detailBooking.id,
                        kind: 'PICKUP',
                        booking: {
                          id: detailBooking.id,
                          vehicleId: detailBooking.vehicleId ?? '',
                          vehicleName: detailBooking.vehicle,
                          plate: detailBooking.plate,
                          customerName: detailBooking.customer,
                          startDate: (detailBooking._raw as any)?.startDate ?? '',
                          endDate: (detailBooking._raw as any)?.endDate ?? '',
                          pickupLocation: detailBooking.pickupLocation,
                          status: detailBooking.status,
                          includedKm: detailBooking.includedKm,
                        },
                      });
                    }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 shadow-sm ${
                      detailHealth?.rental_blocked
                        ? 'bg-muted text-muted-foreground cursor-not-allowed border border-border'
                        : 'bg-[color:var(--brand)] text-[color:var(--brand-foreground)] hover:opacity-90'
                    }`}
                  >
                    <Icon name="file-signature" className="w-3.5 h-3.5" />
                    Pickup bestätigen
                  </button>
                  <button
                    onClick={() => enterEditMode(detailBooking)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-200 ${
                      'sq-tone-brand border border-current/30'
                    }`}
                  >
                    <Icon name="pencil" className="w-3.5 h-3.5" />
                    Bearbeiten
                  </button>
                  <button
                    onClick={(e) => confirmCancel(detailBooking.id, e)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-200 ${
                      'sq-tone-critical border border-current/30'
                    }`}
                  >
                    <Icon name="trash-2" className="w-3.5 h-3.5" />
                    Stornieren
                  </button>
                </div>
              </div>
            </div>
          ) : detailBooking.status === 'active' ? (
            <div className="col-span-12">
              <div className={`flex items-center justify-between px-3 py-3 rounded-lg border ${
                'sq-tone-brand border border-current/20'
              }`}>
                <div className="flex items-center gap-3">
                  <Icon name="info" className={`w-5 h-5 text-[color:var(--brand)]`} />
                  <span className={`text-xs ${'text-[color:var(--brand)]'}`}>
                    Fahrzeug ist vermietet. Rückgabe per Übergabeprotokoll abschließen.
                  </span>
                </div>
                {/* V4.6.75 — Primary action for active bookings: return handover. */}
                <button
                  onClick={() => openHandover({
                    bookingId: detailBooking.id,
                    kind: 'RETURN',
                    booking: {
                      id: detailBooking.id,
                      vehicleId: detailBooking.vehicleId ?? '',
                      vehicleName: detailBooking.vehicle,
                      plate: detailBooking.plate,
                      customerName: detailBooking.customer,
                      startDate: (detailBooking._raw as any)?.startDate ?? '',
                      endDate: (detailBooking._raw as any)?.endDate ?? '',
                      pickupLocation: detailBooking.pickupLocation,
                      status: detailBooking.status,
                      includedKm: detailBooking.includedKm,
                      pickupOdometerKm: detailBooking.mileageStart,
                    },
                  })}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-all duration-200 shadow-sm"
                >
                  <Icon name="file-signature" className="w-3.5 h-3.5" />
                  Rückgabe bestätigen
                </button>
              </div>
            </div>
          ) : (
            <div className="col-span-12">
              <div className={`flex items-center justify-end px-3 py-2 rounded-lg border ${
                'bg-card/30 border-border/30'
              }`}>
                <button
                  onClick={() => enterEditMode(detailBooking)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-200 ${
                    'sq-tone-brand border border-current/30'
                  }`}
                >
                  <Icon name="pencil" className="w-3.5 h-3.5" />
                  Bearbeiten
                </button>
              </div>
            </div>
          )}

          {/* Left Column - Vehicle & Revenue */}
          <div className="col-span-1 lg:col-span-8 space-y-5">
            {/* Vehicle Card */}
            <div className={`rounded-lg p-8 border shadow-sm ${
              'bg-card border-border'
            }`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${
                  detailStatusColor === 'blue' ? ('sq-tone-brand') :
                  detailStatusColor === 'purple' ? ('sq-tone-warning') :
                  ('sq-tone-success')
                }`}>
                  <Icon name="car" className={`w-5 h-5 ${
                    detailStatusColor === 'blue' ? ('text-[color:var(--brand)]') :
                    detailStatusColor === 'purple' ? ('text-[color:var(--status-attention)]') :
                    ('text-[color:var(--status-success)]')
                  }`} />
                </div>
                <div className="flex-1 relative">
                  {isEditMode ? (
                    <div className="relative" ref={activeDropdown === 'vehicle' ? dropdownRef : undefined}>
                      <button
                        onClick={() => setActiveDropdown(activeDropdown === 'vehicle' ? null : 'vehicle')}
                        className={`flex items-center gap-2 group cursor-pointer`}
                      >
                        <h2 className={`text-base font-bold text-foreground`}>
                          {inlineEdit.vehicle || detailBooking.vehicle}
                        </h2>
                        <Icon name="pencil" className={`w-5 h-5 text-[color:var(--brand)]`} />
                        <Icon name="chevron-down" className={`w-5 h-5 transition-transform text-[color:var(--brand)] ${activeDropdown === 'vehicle' ? 'rotate-180' : ''}`} />
                      </button>
                      <div className={`text-xs text-muted-foreground`}>
                        {inlineEdit.plate || detailBooking.plate}
                      </div>
                      {activeDropdown === 'vehicle' && (
                        <div className={`absolute z-50 mt-2 w-72 rounded-lg border shadow-xl overflow-hidden ${
                          'bg-card border-border'
                        }`}>
                          <div className="max-h-64 overflow-y-auto py-1">
                            {vehicleOptions.length === 0 && (
                              <div className={`px-3 py-4 text-center text-xs text-muted-foreground`}>
                                Keine Fahrzeuge verfügbar
                              </div>
                            )}
                            {vehicleOptions.map(v => {
                              const brandKey = getBrandFromModel({ make: v.make, model: v.model });
                              return (
                                <button
                                  key={v.id || v.plate}
                                  onClick={() => {
                                    setInlineEdit(prev => ({ ...prev, vehicle: v.name, plate: v.plate }));
                                    setActiveDropdown(null);
                                  }}
                                  className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                                    (inlineEdit.vehicle || detailBooking.vehicle) === v.name
                                      ? 'sq-tone-brand'
                                      : 'text-foreground hover:bg-muted'
                                  }`}
                                >
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 p-1 ${
                                    'bg-muted'
                                  }`}>
                                    <BrandLogo brand={brandKey} size={20} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold truncate">{v.name}</div>
                                    {v.plate && (
                                      <div className={`text-xs font-mono text-muted-foreground`}>{v.plate}</div>
                                    )}
                                  </div>
                                  {(inlineEdit.vehicle || detailBooking.vehicle) === v.name && <Icon name="check-circle" className="w-5 h-5 ml-auto shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <h2 className={`text-base font-bold text-foreground`}>
                        {detailBooking.vehicle}
                      </h2>
                      <div className={`text-xs text-muted-foreground`}>
                        {detailBooking.plate}
                      </div>
                    </>
                  )}
                  {!isEditMode && (
                    <button
                      onClick={() => onNavigateToVehicle?.(detailBooking.vehicle)}
                      className={`mt-2 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 hover:border-blue-300'
                      }`}
                    >
                      <Icon name="radio" className="w-3.5 h-3.5" />
                      Live Tracking
                    </button>
                  )}
                </div>
                <div className="text-right">
                  {(() => {
                    const bruttoVal = parseFloat((detailBooking.revenue || '€0').replace('€', '').replace(',', '.')) || 0;
                    const nettoVal = Math.round((bruttoVal / 1.19) * 100) / 100;
                    const taxVal = Math.round((bruttoVal - nettoVal) * 100) / 100;
                    return (
                      <>
                        <div className={`text-xs font-bold text-[color:var(--status-success)]`}>
                          €{bruttoVal.toFixed(2)}
                        </div>
                        <div className={`text-[11px] text-muted-foreground`}>Brutto</div>
                        <div className={`mt-1.5 flex items-center justify-end gap-3`}>
                          <div className="text-right">
                            <div className={`text-xs font-semibold text-foreground`}>€{nettoVal.toFixed(2)}</div>
                            <div className={`text-xs text-muted-foreground`}>Netto</div>
                          </div>
                          <div className={`w-px h-6 bg-border`} />
                          <div className="text-right">
                            <div className={`text-xs font-semibold text-[color:var(--status-attention)]`}>€{taxVal.toFixed(2)}</div>
                            <div className={`text-xs text-muted-foreground`}>19% MwSt.</div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Booking Times, Locations & Duration */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                {/* Abholdatum & Uhrzeit */}
                <div
                  onClick={() => isEditMode && openEditCalendar('pickup')}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 bg-muted/50 ${isEditMode ? 'cursor-pointer ring-1 ring-transparent hover:ring-blue-500/40 group' : ''} ${
                    isEditMode && editCalendarOpen && editCalendarMode === 'pickup' ? ('!ring-[color:var(--brand)]/60') : ''
                  }`}
                >
                  <Icon name="calendar" className={`w-5 h-5 text-[color:var(--brand)]`} />
                  <div className="flex-1">
                    <div className={`text-xs text-muted-foreground`}>Abholdatum & Uhrzeit</div>
                    <div className={`text-xs font-semibold text-foreground`}>
                      {isEditMode ? (inlineEdit.startDate || detailBooking.startDate || 'Datum wählen') : detailBooking.startDate}
                    </div>
                    {isEditMode ? (
                      <input
                        type="time"
                        value={inlineEdit.startTime ?? detailBooking.startTime}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setInlineEdit(prev => ({ ...prev, startTime: e.target.value }))}
                        className={`w-full text-xs font-mono bg-transparent outline-none mt-0.5 text-muted-foreground`}
                      />
                    ) : (
                      <div className={`text-xs font-mono text-muted-foreground`}>{detailBooking.startTime} Uhr</div>
                    )}
                  </div>
                  {isEditMode && <Icon name="pencil" className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-[color:var(--brand)]`} />}
                </div>
                {/* Rückgabedatum & Uhrzeit */}
                <div
                  onClick={() => isEditMode && openEditCalendar('return')}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 bg-muted/50 ${isEditMode ? 'cursor-pointer ring-1 ring-transparent hover:ring-blue-500/40 group' : ''} ${
                    isEditMode && editCalendarOpen && editCalendarMode === 'return' ? ('!ring-[color:var(--status-success)]/60') : ''
                  }`}
                >
                  <Icon name="calendar" className={`w-5 h-5 ${'text-[color:var(--status-success)]'}`} />
                  <div className="flex-1">
                    <div className={`text-xs text-muted-foreground`}>Rückgabedatum & Uhrzeit</div>
                    <div className={`text-xs font-semibold text-foreground`}>
                      {isEditMode ? (inlineEdit.endDate || detailBooking.endDate || 'Datum wählen') : detailBooking.endDate}
                    </div>
                    {isEditMode ? (
                      <input
                        type="time"
                        value={inlineEdit.endTime ?? detailBooking.endTime}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setInlineEdit(prev => ({ ...prev, endTime: e.target.value }))}
                        className={`w-full text-xs font-mono bg-transparent outline-none mt-0.5 text-muted-foreground`}
                      />
                    ) : (
                      <div className={`text-xs font-mono text-muted-foreground`}>{detailBooking.endTime} Uhr</div>
                    )}
                  </div>
                  {isEditMode && <Icon name="pencil" className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-[color:var(--brand)]`} />}
                </div>
                {/* Mietdauer */}
                <div className={`flex items-center gap-3 px-3 py-3 rounded-lg bg-muted/50`}>
                  <Icon name="clock" className={`w-5 h-5 text-[color:var(--status-attention)]`} />
                  <div>
                    <div className={`text-xs text-muted-foreground`}>Mietdauer</div>
                    {(() => {
                      const parseDateLocal = (d: string) => {
                        const parts = d.split(' ');
                        const day = parseInt(parts[0], 10);
                        const months: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
                        const m = months[parts[1]] ?? 0;
                        const y = parseInt(parts[2], 10);
                        return new Date(y, m, day);
                      };
                      const sDate = isEditMode ? (inlineEdit.startDate || detailBooking.startDate) : detailBooking.startDate;
                      const eDate = isEditMode ? (inlineEdit.endDate || detailBooking.endDate) : detailBooking.endDate;
                      if (!sDate || !eDate) return <div className={`text-xs font-semibold text-muted-foreground`}>—</div>;
                      const start = parseDateLocal(sDate);
                      const end = parseDateLocal(eDate);
                      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
                      return (
                        <>
                          <div className={`text-xs font-semibold text-foreground`}>{days} {days === 1 ? 'Tag' : 'Tage'}</div>
                          <div className={`text-xs font-mono text-muted-foreground`}>{days * 24}h gesamt</div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Inline Calendar Popover (synced like NewBookingView) */}
              {isEditMode && editCalendarOpen && (() => {
                const vehicleName = inlineEdit.vehicle || detailBooking.vehicle;
                const blockedInfo = getEditBlockedInfo(vehicleName);
                const blockedDays = Object.keys(blockedInfo).map(Number);
                return (
                  <div ref={calendarPopoverRef} className={`rounded-lg border p-4 mb-3 shadow-xl transition-all duration-200 ${
                    'bg-card border-border/60'
                  }`}>
                    {/* Selection mode toggle */}
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => setEditCalendarMode('pickup')}
                        className={`flex-1 px-3 py-2.5 rounded-lg text-xs text-center transition-all ${
                          editCalendarMode === 'pickup'
                            ? 'sq-tone-brand border border-current/40'
                            : 'bg-muted/50 text-muted-foreground border border-border/40'
                        }`}
                      >
                        <Icon name="calendar" className="w-3.5 h-3.5 mx-auto mb-1" />
                        Abholdatum wählen
                      </button>
                      <button
                        onClick={() => setEditCalendarMode('return')}
                        className={`flex-1 px-3 py-2.5 rounded-lg text-xs text-center transition-all ${
                          editCalendarMode === 'return'
                            ? 'sq-tone-success border border-current/40'
                            : 'bg-muted/50 text-muted-foreground border border-border/40'
                        }`}
                      >
                        <Icon name="calendar" className="w-3.5 h-3.5 mx-auto mb-1" />
                        Rückgabedatum wählen
                      </button>
                    </div>

                    {/* Month navigation */}
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => {
                          if (editCalendarMonth === 0) { setEditCalendarMonth(11); setEditCalendarYear(y => y - 1); }
                          else setEditCalendarMonth(m => m - 1);
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${'hover:bg-muted text-muted-foreground'}`}
                      >
                        <Icon name="chevron-left" className="w-5 h-5" />
                      </button>
                      <span className={`text-xs font-semibold text-foreground`}>
                        {editCalMonthNames[editCalendarMonth]} {editCalendarYear}
                      </span>
                      <button
                        onClick={() => {
                          if (editCalendarMonth === 11) { setEditCalendarMonth(0); setEditCalendarYear(y => y + 1); }
                          else setEditCalendarMonth(m => m + 1);
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${'hover:bg-muted text-muted-foreground'}`}
                      >
                        <Icon name="chevron-right" className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Calendar grid */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                        <div key={d} className={`text-xs py-1 text-muted-foreground`}>{d}</div>
                      ))}
                      {getEditCalendarDays(editCalendarMonth, editCalendarYear).map((day, i) => {
                        const isBlocked = day ? blockedDays.includes(day) : false;
                        const blockInfo = day ? blockedInfo[day] : null;
                        return (
                          <div key={i} className="relative">
                            <button
                              type="button"
                              disabled={!day || isBlocked}
                              onClick={() => day && handleEditCalendarDayClick(day, blockedDays)}
                              onMouseEnter={() => { if (day && isBlocked) setEditHoveredDay(day); }}
                              onMouseLeave={() => setEditHoveredDay(null)}
                              className={`w-full text-xs py-2 rounded-lg transition-all ${
                                !day
                                  ? 'cursor-default'
                                  : isBlocked
                                  ? `cursor-not-allowed ${
                                      blockInfo?.reason === 'maintenance'
                                        ? 'sq-tone-warning'
                                        : 'sq-tone-critical'
                                    }`
                                  : editCalIsStartDay(day)
                                  ? 'bg-blue-600 text-white cursor-pointer hover:bg-blue-700 shadow-sm'
                                  : editCalIsEndDay(day)
                                  ? 'bg-green-600 text-white cursor-pointer hover:bg-green-700 shadow-sm'
                                  : editCalIsInRange(day)
                                  ? `cursor-pointer ${'sq-tone-brand hover:opacity-90'}`
                                  : `cursor-pointer ${'text-foreground hover:bg-muted'}`
                              }`}
                            >
                              {day || ''}
                            </button>
                            {/* Hover tooltip for blocked days */}
                            {editHoveredDay === day && day && blockInfo && (
                              <div className={`absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 rounded-lg border shadow-lg ${
                                'bg-card/95 border-border/60 text-foreground'
                              }`}>
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  {blockInfo.reason === 'maintenance' ? (
                                    <Icon name="clock" className={`w-3 h-3 ${'text-[color:var(--status-attention)]'}`} />
                                  ) : (
                                    <Icon name="car" className={`w-3 h-3 text-[color:var(--status-critical)]`} />
                                  )}
                                  <span className={`text-xs ${
                                    blockInfo.reason === 'maintenance'
                                      ? 'text-[color:var(--status-attention)]'
                                      : 'text-[color:var(--status-critical)]'
                                  }`}>
                                    {blockInfo.reason === 'maintenance' ? 'Wartung' : 'Vermietet'}
                                  </span>
                                </div>
                                <div className={`text-xs mb-1 text-foreground`}>
                                  <span className="flex items-center gap-1">
                                    <Icon name="calendar" className="w-3 h-3" />
                                    {blockInfo.startDay}. – {blockInfo.endDay}. {editCalMonthNames[editCalendarMonth]}
                                  </span>
                                </div>
                                {blockInfo.reason !== 'maintenance' && (
                                  <div className={`text-xs text-muted-foreground`}>
                                    <span className="flex items-center gap-1">
                                      <Icon name="user" className="w-3 h-3" />
                                      {blockInfo.customer}
                                    </span>
                                  </div>
                                )}
                                <div className={`absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 -mt-1 border-r border-b ${
                                  'bg-card/95 border-border/60'
                                }`}></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Legend */}
                    <div className={`flex items-center gap-3 mt-3 pt-3 border-t ${'border-border/40'}`}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-blue-600"></div>
                        <span className={`text-xs text-muted-foreground`}>Abholung</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-green-600"></div>
                        <span className={`text-xs text-muted-foreground`}>Rückgabe</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded ${'sq-tone-brand'}`}></div>
                        <span className={`text-xs text-muted-foreground`}>Zeitraum</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded ${'sq-tone-critical'}`}></div>
                        <span className={`text-xs text-muted-foreground`}>Gebucht</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded ${'sq-tone-warning'}`}></div>
                        <span className={`text-xs text-muted-foreground`}>Wartung</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <EditableDropdown
                  fieldKey="pickupLocation"
                  icon={MapPin}
                  label="Abholort"
                  value={detailBooking.pickupLocation}
                  options={locationOptions}
                  iconColor={'text-[color:var(--brand)]'}
                />
                <EditableDropdown
                  fieldKey="returnLocation"
                  icon={MapPin}
                  label="Rückgabeort"
                  value={detailBooking.returnLocation}
                  options={locationOptions}
                  iconColor={'text-[color:var(--status-success)]'}
                />
                {/* Kilometer frei — editable via km package */}
                <div className="relative" ref={activeDropdown === 'includedKm' ? dropdownRef : undefined}>
                  <div
                    onClick={() => isEditMode && setActiveDropdown(activeDropdown === 'includedKm' ? null : 'includedKm')}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 ${
                      'bg-muted/50'
                    } ${isEditMode ? 'cursor-pointer ring-1 ring-transparent hover:ring-blue-500/40 group' : ''}`}
                  >
                    <Icon name="arrow-up-down" className={`w-5 h-5 text-[color:var(--status-attention)]`} />
                    <div className="flex-1">
                      <div className={`text-xs text-muted-foreground`}>Kilometer frei</div>
                      <div className={`text-xs font-semibold text-foreground`}>
                        {(() => {
                          const km = isEditMode ? (inlineEdit.includedKm ?? detailBooking.includedKm) : detailBooking.includedKm;
                          return km != null ? `${km.toLocaleString('de-DE')} km` : '—';
                        })()}
                      </div>
                    </div>
                    {isEditMode && (
                      <div className={`flex items-center gap-1 text-[color:var(--brand)]`}>
                        <Icon name="pencil" className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <Icon name="chevron-down" className={`w-5 h-5 transition-transform ${activeDropdown === 'includedKm' ? 'rotate-180' : ''}`} />
                      </div>
                    )}
                  </div>
                  {activeDropdown === 'includedKm' && (
                    <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
                      'bg-card border-border'
                    }`}>
                      <div className="py-1">
                        {kmPackageOptions.map(pkg => (
                          <button
                            key={pkg.km}
                            onClick={() => { setInlineEdit(prev => ({ ...prev, includedKm: pkg.km })); setActiveDropdown(null); }}
                            className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between transition-colors ${
                              (inlineEdit.includedKm ?? detailBooking.includedKm) === pkg.km
                                ? 'sq-tone-brand'
                                : 'text-foreground hover:bg-muted'
                            }`}
                          >
                            <span>{pkg.label} — {pkg.km.toLocaleString('de-DE')} km</span>
                            {(inlineEdit.includedKm ?? detailBooking.includedKm) === pkg.km && <Icon name="check-circle" className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Übergabe & Kilometer Box */}
            <div className={`rounded-lg px-3 py-3 border shadow-sm ${
              'bg-card border-border'
            }`}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Pickup durch */}
                <div className="relative" ref={activeDropdown === 'pickupHandoverByBox' ? dropdownRef : undefined}>
                  <div
                    onClick={() => isEditMode && setActiveDropdown(activeDropdown === 'pickupHandoverByBox' ? null : 'pickupHandoverByBox')}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 bg-muted/50 ${isEditMode ? 'cursor-pointer ring-1 ring-transparent hover:ring-blue-500/40 group' : ''}`}
                  >
                    <Icon name="users" className={`w-5 h-5 shrink-0 text-[color:var(--brand)]`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs leading-tight whitespace-nowrap text-muted-foreground`}>Pickup durch</div>
                      <div className={`text-xs font-semibold truncate text-foreground`}>
                        {isEditMode ? (inlineEdit.pickupHandoverBy || detailBooking.pickupHandoverBy || '—') : (detailBooking.pickupHandoverBy || '—')}
                      </div>
                    </div>
                    {isEditMode && <Icon name="chevron-down" className={`w-3.5 h-3.5 shrink-0 transition-transform text-[color:var(--brand)] ${activeDropdown === 'pickupHandoverByBox' ? 'rotate-180' : ''}`} />}
                  </div>
                  {activeDropdown === 'pickupHandoverByBox' && (
                    <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
                      'bg-card border-border'
                    }`}>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {['—', ...employeeOptions].map(opt => (
                          <button
                            key={opt}
                            onClick={() => { setInlineEdit(prev => ({ ...prev, pickupHandoverBy: opt === '—' ? '' : opt })); setActiveDropdown(null); }}
                            className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between transition-colors ${
                              (inlineEdit.pickupHandoverBy ?? detailBooking.pickupHandoverBy ?? '') === (opt === '—' ? '' : opt)
                                ? 'sq-tone-brand'
                                : 'text-foreground hover:bg-muted'
                            }`}
                          >
                            <span>{opt}</span>
                            {(inlineEdit.pickupHandoverBy ?? detailBooking.pickupHandoverBy ?? '') === (opt === '—' ? '' : opt) && <Icon name="check-circle" className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Rückgabe durch */}
                <div className="relative" ref={activeDropdown === 'returnHandoverByBox' ? dropdownRef : undefined}>
                  <div
                    onClick={() => isEditMode && setActiveDropdown(activeDropdown === 'returnHandoverByBox' ? null : 'returnHandoverByBox')}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 bg-muted/50 ${isEditMode ? 'cursor-pointer ring-1 ring-transparent hover:ring-blue-500/40 group' : ''}`}
                  >
                    <Icon name="users" className={`w-5 h-5 shrink-0 ${'text-[color:var(--status-success)]'}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs leading-tight whitespace-nowrap text-muted-foreground`}>Rückgabe durch</div>
                      <div className={`text-xs font-semibold truncate text-foreground`}>
                        {isEditMode ? (inlineEdit.returnHandoverBy || detailBooking.returnHandoverBy || '—') : (detailBooking.returnHandoverBy || '—')}
                      </div>
                    </div>
                    {isEditMode && <Icon name="chevron-down" className={`w-3.5 h-3.5 shrink-0 transition-transform ${'text-[color:var(--status-success)]'} ${activeDropdown === 'returnHandoverByBox' ? 'rotate-180' : ''}`} />}
                  </div>
                  {activeDropdown === 'returnHandoverByBox' && (
                    <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
                      'bg-card border-border'
                    }`}>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {['—', ...employeeOptions].map(opt => (
                          <button
                            key={opt}
                            onClick={() => { setInlineEdit(prev => ({ ...prev, returnHandoverBy: opt === '—' ? '' : opt })); setActiveDropdown(null); }}
                            className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between transition-colors ${
                              (inlineEdit.returnHandoverBy ?? detailBooking.returnHandoverBy ?? '') === (opt === '—' ? '' : opt)
                                ? 'sq-tone-brand'
                                : 'text-foreground hover:bg-muted'
                            }`}
                          >
                            <span>{opt}</span>
                            {(inlineEdit.returnHandoverBy ?? detailBooking.returnHandoverBy ?? '') === (opt === '—' ? '' : opt) && <Icon name="check-circle" className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* KM Übergabe */}
                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 ${
                  detailBooking.pickupHandoverBy
                    ? 'bg-muted/50'
                    : 'bg-muted/30 opacity-60'
                }`}>
                  <Icon name="car" className={`w-5 h-5 shrink-0 text-[color:var(--status-attention)]`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs leading-tight whitespace-nowrap text-muted-foreground`}>KM Übergabe</div>
                    <div className={`text-xs font-semibold truncate text-foreground`}>
                      {detailBooking.pickupHandoverBy
                        ? detailBooking.mileageStart != null ? `${detailBooking.mileageStart.toLocaleString('de-DE')} km` : '—'
                        : 'Bei Pickup'}
                    </div>
                  </div>
                </div>

                {/* KM gefahren */}
                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 ${
                  detailBooking.drivenKm != null && detailBooking.includedKm != null && detailBooking.drivenKm > detailBooking.includedKm
                    ? 'sq-tone-critical border border-current/30'
                    : 'bg-muted/50'
                }`}>
                  <Icon name="gauge" className={`w-5 h-5 shrink-0 ${
                    detailBooking.drivenKm != null && detailBooking.includedKm != null && detailBooking.drivenKm > detailBooking.includedKm
                      ? 'text-[color:var(--status-critical)]'
                      : 'text-[color:var(--status-attention)]'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs leading-tight whitespace-nowrap text-muted-foreground`}>KM gefahren</div>
                    <div className={`text-xs font-semibold truncate ${
                      detailBooking.drivenKm != null && detailBooking.includedKm != null && detailBooking.drivenKm > detailBooking.includedKm
                        ? 'text-[color:var(--status-critical)]'
                        : 'text-foreground'
                    }`}>
                      {detailBooking.drivenKm != null ? `${detailBooking.drivenKm.toLocaleString('de-DE')} km` : '—'}
                      {detailBooking.drivenKm != null && detailBooking.includedKm != null && detailBooking.drivenKm > detailBooking.includedKm && (
                        <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${'sq-tone-critical'}`}>
                          +{(detailBooking.drivenKm - detailBooking.includedKm).toLocaleString('de-DE')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Packages & Extras + Buchungsdetails — Two Boxes Side by Side */}
            <div className="grid grid-cols-2 gap-3">
              {/* Box 1: Pakete & Extras */}
              <div className={`rounded-lg p-8 border shadow-sm ${
                'bg-card border-border'
              }`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>
                  Pakete & Extras
                </div>

                {/* Kilometerpaket */}
                <div className="mb-3">
                  <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 text-muted-foreground`}>
                    Kilometerpaket
                  </div>
                  <div className="relative" ref={activeDropdown === 'kmPackage' ? dropdownRef : undefined}>
                    <div
                      onClick={() => isEditMode && setActiveDropdown(activeDropdown === 'kmPackage' ? null : 'kmPackage')}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg border transition-all duration-200 ${'bg-muted/50 border-border/40'} ${isEditMode ? 'cursor-pointer hover:border-blue-500/40 group' : ''}`}
                    >
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${'sq-tone-warning'}`}>
                        <Icon name="gauge" className={`w-5 h-5 text-[color:var(--status-attention)]`} />
                      </div>
                      <div className="flex-1">
                        {(() => {
                          const km = isEditMode ? (inlineEdit.includedKm ?? detailBooking.includedKm) : detailBooking.includedKm;
                          return (
                            <>
                              <div className={`text-xs font-semibold text-foreground`}>
                                {km != null ? (
                                  km >= 2000 ? 'Unlimited' :
                                  km >= 1500 ? 'Premium' :
                                  km >= 1000 ? 'Komfort' :
                                  km >= 750 ? 'Standard' : 'Basis'
                                ) : 'Standard'}
                              </div>
                              <div className={`text-xs text-muted-foreground`}>
                                {km != null ? `${km.toLocaleString('de-DE')} km inkl.` : '—'}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      {isEditMode ? (
                        <div className={`flex items-center gap-1 text-[color:var(--brand)]`}>
                          <Icon name="pencil" className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <Icon name="chevron-down" className={`w-5 h-5 transition-transform ${activeDropdown === 'kmPackage' ? 'rotate-180' : ''}`} />
                        </div>
                      ) : (
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${'sq-tone-warning'}`}>
                          Aktiv
                        </div>
                      )}
                    </div>
                    {activeDropdown === 'kmPackage' && (
                      <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
                        'bg-card border-border'
                      }`}>
                        <div className="py-1">
                          {kmPackageOptions.map(pkg => (
                            <button
                              key={pkg.km}
                              onClick={() => { setInlineEdit(prev => ({ ...prev, includedKm: pkg.km })); setActiveDropdown(null); }}
                              className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between transition-colors ${
                                (inlineEdit.includedKm ?? detailBooking.includedKm) === pkg.km
                                  ? 'sq-tone-brand'
                                  : 'text-foreground hover:bg-muted'
                              }`}
                            >
                              <span>{pkg.label} — {pkg.km.toLocaleString('de-DE')} km</span>
                              {(inlineEdit.includedKm ?? detailBooking.includedKm) === pkg.km && <Icon name="check-circle" className="w-3.5 h-3.5" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Versicherungspaket */}
                <div className="mb-3">
                  <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 text-muted-foreground`}>
                    Versicherungspaket
                  </div>
                  <div className="relative" ref={activeDropdown === 'insurance' ? dropdownRef : undefined}>
                    <div
                      onClick={() => isEditMode && setActiveDropdown(activeDropdown === 'insurance' ? null : 'insurance')}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg border transition-all duration-200 ${'bg-muted/50 border-border/40'} ${isEditMode ? 'cursor-pointer hover:border-blue-500/40 group' : ''}`}
                    >
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${'sq-tone-brand'}`}>
                        <Icon name="shield" className={`w-5 h-5 text-[color:var(--brand)]`} />
                      </div>
                      <div className="flex-1">
                        {(() => {
                          const ins = isEditMode ? (inlineEdit.insurance || detailBooking.insurance) : detailBooking.insurance;
                          return (
                            <>
                              <div className={`text-xs font-semibold text-foreground`}>{ins}</div>
                              <div className={`text-xs text-muted-foreground`}>
                                {ins === 'Premium Vollkasko' ? 'Keine SB • Glas • Reifen • Unterboden' :
                                 ins === 'Vollkasko' ? 'SB €500 • Glas inkl.' :
                                 ins === 'Teilkasko' ? 'SB €1.000 • Basis' : 'Gesetzlicher Standard'}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      {isEditMode ? (
                        <div className={`flex items-center gap-1 text-[color:var(--brand)]`}>
                          <Icon name="pencil" className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <Icon name="chevron-down" className={`w-5 h-5 transition-transform ${activeDropdown === 'insurance' ? 'rotate-180' : ''}`} />
                        </div>
                      ) : (
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                          detailBooking.insurance === 'Premium Vollkasko'
                            ? 'sq-tone-warning'
                            : 'sq-tone-brand'
                        }`}>
                          {detailBooking.insurance === 'Premium Vollkasko' ? 'Premium' : 'Aktiv'}
                        </div>
                      )}
                    </div>
                    {activeDropdown === 'insurance' && (
                      <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
                        'bg-card border-border'
                      }`}>
                        <div className="py-1">
                          {insuranceOptions.map(opt => (
                            <button
                              key={opt}
                              onClick={() => { setInlineEdit(prev => ({ ...prev, insurance: opt })); setActiveDropdown(null); }}
                              className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between transition-colors ${
                                (inlineEdit.insurance || detailBooking.insurance) === opt
                                  ? 'sq-tone-brand'
                                  : 'text-foreground hover:bg-muted'
                              }`}
                            >
                              <div>
                                <div className="font-semibold">{opt}</div>
                                <div className={`text-xs text-muted-foreground`}>
                                  {opt === 'Premium Vollkasko' ? 'Keine SB • Glas • Reifen • Unterboden' :
                                   opt === 'Vollkasko' ? 'SB €500 • Glas inkl.' :
                                   opt === 'Teilkasko' ? 'SB €1.000 • Basis' : 'Gesetzlicher Standard'}
                                </div>
                              </div>
                              {(inlineEdit.insurance || detailBooking.insurance) === opt && <Icon name="check-circle" className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Extras */}
                <div>
                  <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 text-muted-foreground`}>
                    Extras
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const extrasFromNotes: { icon: typeof Wifi; label: string; detail: string }[] = [];
                      const notes = detailBooking.notes || '';
                      if (notes.includes('Navigationssystem')) extrasFromNotes.push({ icon: Wifi, label: 'Navigationssystem', detail: 'GPS Premium' });
                      if (notes.includes('Kindersitz')) extrasFromNotes.push({ icon: Baby, label: 'Kindersitz', detail: 'Gruppe I/II' });
                      if (notes.includes('Winterreifen')) extrasFromNotes.push({ icon: Snowflake, label: 'Winterreifen', detail: 'Bereits montiert' });
                      if (extrasFromNotes.length === 0) {
                        return (
                          <div className={`flex items-center justify-center py-3 rounded-lg border border-dashed ${
                            'border-border bg-muted/20'
                          }`}>
                            <div className="text-center">
                              <Icon name="package" className={`w-5 h-5 mx-auto mb-1.5 ${'text-muted-foreground'}`} />
                              <p className={`text-xs text-muted-foreground`}>Keine Extras gebucht</p>
                            </div>
                          </div>
                        );
                      }
                      return extrasFromNotes.map((extra, idx) => (
                        <div key={idx} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${'bg-muted/50 border-border/40'}`}>
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${'sq-tone-success'}`}>
                            <extra.icon className={`w-5 h-5 ${'text-[color:var(--status-success)]'}`} />
                          </div>
                          <div className="flex-1">
                            <div className={`text-xs font-semibold text-foreground`}>{extra.label}</div>
                            <div className={`text-xs text-muted-foreground`}>{extra.detail}</div>
                          </div>
                          <Icon name="check-circle" className={`w-5 h-5 ${'text-[color:var(--status-success)]'}`} />
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>

              {/* Box 2: Buchungsdetails */}
              <div className={`rounded-lg p-8 border shadow-sm ${
                'bg-card border-border'
              }`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>
                  Buchungsdetails
                </div>

                <div className="space-y-3">
                  {/* Zahlungsart */}
                  <EditableDropdown
                    fieldKey="paymentMethod"
                    icon={CreditCard}
                    label="Zahlungsart"
                    value={detailBooking.paymentMethod}
                    options={paymentOptions}
                  />
                  {/* Buchungsherkunft */}
                  <EditableDropdown
                    fieldKey="bookingSource"
                    icon={Globe}
                    label="Buchungsherkunft"
                    value={detailBooking.bookingSource}
                    options={sourceOptions}
                  />
                  {/* Aufgenommen durch */}
                  <EditableDropdown
                    fieldKey="bookedBy"
                    icon={UserCheck}
                    label="Aufgenommen durch"
                    value={detailBooking.bookedBy}
                    options={employeeOptions}
                  />
                </div>
              </div>
            </div>

            {/* Documents — Booking Document Lifecycle (central document engine).
                Live bundle: booking invoice, deposit receipt, rental contract,
                AGB/Widerruf, handover protocols, final invoice — with download,
                regenerate and missing-legal warnings. */}
            <BookingDocumentsSection
              orgId={orgId}
              bookingId={detailBooking.id}
              isDarkMode={systemDark}
            />

            {/* Booking Tasks — operative action layer for this booking
                (preparation, cleaning, pickup, return, invoicing). Read model
                comes straight from the central Task service. */}
            {orgId && (
              <EntityTasksSection
                isDark={systemDark}
                title="Booking Tasks"
                emptyHint="Keine Tasks für diese Buchung. Vorbereitungs-, Pickup- und Rückgabe-Tasks werden automatisch erzeugt, sobald sich der Buchungsstatus ändert."
                fetchTasks={() => api.tasks.forBooking(orgId, detailBooking.id)}
                deps={[orgId, detailBooking.id]}
              />
            )}
          </div>

          {/* Right Column - Customer Info & Notes */}
          <div className="col-span-1 lg:col-span-4 space-y-5">
            {/* Customer Card */}
            {(() => {
              // V4.6.68 — Customer details are resolved from real backend data
              // (api.customers.list) rather than a hardcoded Kunde A/B/C map.
              const currentCustomerName = isEditMode ? (inlineEdit.customer || detailBooking.customer) : detailBooking.customer;
              const cDetail = customerDetailByName.get(currentCustomerName) || {
                email: '',
                phone: '',
                address: '',
                city: '',
                customerId: '',
                license: '',
                licenseExpiry: '',
                since: '',
                bookingsCount: 0,
              };
              return (
            <div className={`rounded-lg p-8 border shadow-sm ${
              'bg-card border-border'
            }`}>
              <div className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center justify-between text-muted-foreground`}>
                Kunde
                {isEditMode && <Icon name="pencil" className={`w-3.5 h-3.5 text-[color:var(--brand)]`} />}
              </div>
              <div className="relative" ref={activeDropdown === 'customer' ? dropdownRef : undefined}>
                <div
                  onClick={() => isEditMode && setActiveDropdown(activeDropdown === 'customer' ? null : 'customer')}
                  className={`flex items-center gap-3 ${isEditMode ? 'cursor-pointer rounded-lg p-2 -m-2 transition-all hover:ring-1 hover:ring-blue-500/40 group' : ''}`}
                >
                  <div className={`w-14 h-14 rounded-lg flex items-center justify-center ${'sq-tone-brand'}`}>
                    <Icon name="user" className={`w-7 h-7 text-[color:var(--brand)]`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`text-xs font-bold truncate text-foreground`}>
                        {currentCustomerName}
                      </div>
                      {cDetail.customerId && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono shrink-0 ${'bg-muted text-muted-foreground'}`}>
                          {cDetail.customerId}
                        </span>
                      )}
                    </div>
                    <div className={`text-xs mt-0.5 text-muted-foreground`}>
                      {cDetail.since ? `Kunde seit ${cDetail.since} · ` : ''}{cDetail.bookingsCount} Buchungen
                    </div>
                  </div>
                  {isEditMode && (
                    <Icon name="chevron-down" className={`w-5 h-5 transition-transform shrink-0 text-[color:var(--brand)] ${activeDropdown === 'customer' ? 'rotate-180' : ''}`} />
                  )}
                </div>
                {activeDropdown === 'customer' && (
                  <div className={`absolute z-50 mt-2 w-full rounded-lg border shadow-xl overflow-hidden ${
                    'bg-card border-border'
                  }`}>
                    <div className="py-1">
                      {customerOptions.length === 0 && (
                        <div className={`px-3 py-4 text-center text-xs text-muted-foreground`}>
                          Keine Kunden verfügbar
                        </div>
                      )}
                      {customerOptions.map(c => (
                        <button
                          key={c.id || c.name}
                          onClick={() => {
                            setInlineEdit(prev => ({ ...prev, customer: c.name, customerPhone: c.phone }));
                            setActiveDropdown(null);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                            currentCustomerName === c.name
                              ? 'sq-tone-brand'
                              : 'text-foreground hover:bg-muted'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${'bg-muted'}`}>
                            <Icon name="user" className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold">{c.name}</div>
                            {c.phone && (
                              <div className={`text-xs text-muted-foreground`}>{c.phone}</div>
                            )}
                          </div>
                          {currentCustomerName === c.name && <Icon name="check-circle" className="w-5 h-5 ml-auto shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Detail Grid */}
              <div className={`mt-5 pt-5 border-t grid grid-cols-2 gap-x-6 gap-y-4 ${'border-border/40'}`}>
                <div className="flex items-start gap-2.5">
                  <Icon name="phone" className={`w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground`} />
                  <div>
                    <div className={`text-xs uppercase tracking-wider mb-0.5 text-muted-foreground`}>Telefon</div>
                    <div className={`text-xs text-foreground`}>
                      {isEditMode ? (inlineEdit.customerPhone || detailBooking.customerPhone || '—') : (detailBooking.customerPhone || '—')}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Icon name="mail" className={`w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground`} />
                  <div>
                    <div className={`text-xs uppercase tracking-wider mb-0.5 text-muted-foreground`}>E-Mail</div>
                    <div className={`text-xs truncate text-foreground`}>{cDetail.email || '—'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Icon name="map-pin" className={`w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground`} />
                  <div>
                    <div className={`text-xs uppercase tracking-wider mb-0.5 text-muted-foreground`}>Adresse</div>
                    <div className={`text-xs text-foreground`}>{cDetail.address || '—'}</div>
                    {cDetail.city && (
                      <div className={`text-xs text-muted-foreground`}>{cDetail.city}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Icon name="id-card" className={`w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground`} />
                  <div>
                    <div className={`text-xs uppercase tracking-wider mb-0.5 text-muted-foreground`}>Führerschein</div>
                    <div className={`text-xs text-foreground`}>
                      {cDetail.license ? `Klasse ${cDetail.license}` : '—'}
                    </div>
                    {cDetail.licenseExpiry && (
                      <div className={`text-xs text-muted-foreground`}>gültig bis {cDetail.licenseExpiry}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
              );
            })()}

            {/* Booking Summary Card for upcoming */}
            {(detailBooking.status === 'confirmed' || detailBooking.status === 'pending') && (
              <div className={`rounded-lg p-8 border shadow-sm ${
                'bg-card border-border'
              }`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>
                  Buchungsübersicht
                </div>
                <div className="space-y-3">
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50`}>
                    <span className={`text-xs text-muted-foreground`}>Status</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      detailBooking.status === 'pending'
                        ? ('sq-tone-warning')
                        : ('sq-tone-success')
                    }`}>
                      {detailBooking.status === 'pending' ? 'Ausstehend' : 'Bestätigt'}
                    </span>
                  </div>
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50`}>
                    <span className={`text-xs text-muted-foreground`}>Versicherung</span>
                    <span className={`text-xs font-semibold text-foreground`}>{detailBooking.insurance || '—'}</span>
                  </div>
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50`}>
                    <span className={`text-xs text-muted-foreground`}>Zahlungsart</span>
                    <span className={`text-xs font-semibold text-foreground`}>{detailBooking.paymentMethod || '—'}</span>
                  </div>
                  {detailBooking.includedKm != null && (
                    <div className={`flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50`}>
                      <span className={`text-xs text-muted-foreground`}>Freikilometer</span>
                      <span className={`text-xs font-semibold text-foreground`}>{detailBooking.includedKm.toLocaleString('de-DE')} km</span>
                    </div>
                  )}
                  <div className={`px-3 py-2 rounded-lg border ${
                    'sq-tone-success border border-current/20'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold text-[color:var(--status-success)]`}>Gesamtbetrag</span>
                      <span className={`text-xs font-bold text-[color:var(--status-success)]`}>{detailBooking.revenue}</span>
                    </div>
                    {(() => {
                      const bruttoVal = parseFloat((detailBooking.revenue || '€0').replace('€', '').replace(',', '.')) || 0;
                      const nettoVal = Math.round((bruttoVal / 1.19) * 100) / 100;
                      const taxVal = Math.round((bruttoVal - nettoVal) * 100) / 100;
                      return (
                        <div className={`flex items-center justify-end gap-3 pt-2 border-t ${'border-[color:var(--status-success)]/20'}`}>
                          <div className="text-right">
                            <div className={`text-xs text-muted-foreground`}>Netto</div>
                            <div className={`text-xs font-semibold text-foreground`}>€{nettoVal.toFixed(2)}</div>
                          </div>
                          <div className={`w-px h-6 ${'sq-tone-success'}`} />
                          <div className="text-right">
                            <div className={`text-xs text-muted-foreground`}>19% MwSt.</div>
                            <div className={`text-xs font-semibold text-[color:var(--status-attention)]`}>€{taxVal.toFixed(2)}</div>
                          </div>
                          <div className={`w-px h-6 ${'sq-tone-success'}`} />
                          <div className="text-right">
                            <div className={`text-xs text-muted-foreground`}>Brutto</div>
                            <div className={`text-xs font-semibold text-[color:var(--status-success)]`}>€{bruttoVal.toFixed(2)}</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* V4.6.95 — Booking Driving Analysis card.
                  Wired to the canonical RentalDrivingAnalysis row for this
                  booking. Replaces the previous dead UI which was tied to
                  mock `drivingBehavior` / `abuseDetection` arrays that
                  mappers always set to null. Backend is source of truth;
                  this UI only formats the payload.

                  States:
                    - loading        → skeleton card
                    - no analysis    → neutral empty state
                    - analysis ok    → full card with style/safety/risk
                    - low confidence → "Not enough scored trip data" notice */}
            {(() => {
              const isCompleted = detailBooking.status === 'completed';
              const showCard =
                bookingAnalysisLoading || bookingAnalysis != null || isCompleted;
              if (!showCard) return null;

              const cardWrapper = `rounded-lg p-8 border shadow-sm ${
                'bg-card border-border'
              }`;

              if (bookingAnalysisLoading) {
                return (
                  <div className={cardWrapper}>
                    <div className={`text-xs font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>
                      Booking Driving Analysis
                    </div>
                    <div
                      className={`text-xs text-muted-foreground`}
                    >
                      Loading analysis…
                    </div>
                  </div>
                );
              }

              if (!bookingAnalysis) {
                return (
                  <div className={cardWrapper}>
                    <div className={`text-xs font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>
                      Booking Driving Analysis
                    </div>
                    <div
                      className={`flex items-start gap-2 text-xs text-muted-foreground`}
                    >
                      <Icon name="info" className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>
                        No booking driving analysis yet. The analysis is
                        generated automatically when this booking is marked
                        completed.
                      </span>
                    </div>
                  </div>
                );
              }

              const payload = (bookingAnalysis.payload ?? {}) as any;
              const behavior = (payload.drivingBehavior ?? {}) as any;
              const eventSummary = (payload.eventSummary ?? {}) as any;
              const riskAnalysis = (payload.riskAnalysis ?? {}) as any;
              const wear = (payload.wearImpactAssessment ?? {}) as any;
              const meta = (payload.analysisMeta ?? {}) as any;

              const styleScore =
                typeof behavior.drivingStyleScore === 'number'
                  ? behavior.drivingStyleScore
                  : typeof behavior.drivingScore === 'number'
                    ? behavior.drivingScore
                    : typeof bookingAnalysis.drivingScore === 'number'
                      ? bookingAnalysis.drivingScore
                      : null;
              const safetyScore =
                typeof behavior.safetyScore === 'number'
                  ? behavior.safetyScore
                  : null;
              const riskLevel = String(
                bookingAnalysis.riskLevel ?? riskAnalysis.level ?? 'low',
              ).toLowerCase();
              const dataConfidence =
                meta.dataConfidence ??
                (bookingAnalysis as any).dataConfidence ??
                null;
              const hasEnoughData =
                typeof meta.hasEnoughData === 'boolean'
                  ? meta.hasEnoughData
                  : true;
              const scoredTripCount =
                typeof meta.scoredTripCount === 'number'
                  ? meta.scoredTripCount
                  : null;
              const totalDistanceKm =
                typeof meta.totalDistanceKm === 'number'
                  ? meta.totalDistanceKm
                  : null;
              const drivingEventsCount =
                typeof eventSummary.drivingEventsCount === 'number'
                  ? eventSummary.drivingEventsCount
                  : typeof bookingAnalysis.drivingEventsCount === 'number'
                    ? bookingAnalysis.drivingEventsCount
                    : null;
              const abuseDetectionCount =
                typeof eventSummary.abuseDetectionCount === 'number'
                  ? eventSummary.abuseDetectionCount
                  : typeof bookingAnalysis.abuseDetectionCount === 'number'
                    ? bookingAnalysis.abuseDetectionCount
                    : null;

              const scoreTone = (s: number | null) => {
                if (s == null) {
                  return {
                    stroke: 'var(--border)',
                    bg: 'bg-muted/50',
                    text: 'text-muted-foreground',
                    border: 'border-border',
                  };
                }
                if (s >= 80)
                  return {
                    stroke: '#22c55e',
                    bg: 'sq-tone-success',
                    text: 'text-[color:var(--status-success)]',
                    border: 'border-[color:var(--status-success)]/30',
                  };
                if (s >= 60)
                  return {
                    stroke: '#f59e0b',
                    bg: 'sq-tone-warning',
                    text: 'text-[color:var(--status-attention)]',
                    border: 'border-[color:var(--status-attention)]/30',
                  };
                return {
                  stroke: '#ef4444',
                  bg: 'sq-tone-critical',
                  text: 'text-[color:var(--status-critical)]',
                  border: 'border-[color:var(--status-critical)]/30',
                };
              };
              const styleLabel =
                styleScore == null
                  ? 'Not available'
                  : styleScore >= 90
                    ? 'Excellent'
                    : styleScore >= 75
                      ? 'Smooth'
                      : styleScore >= 60
                        ? 'Balanced'
                        : styleScore >= 40
                          ? 'Aggressive'
                          : 'Critical';
              const safetyLabel =
                safetyScore == null
                  ? 'No speed-limit data'
                  : safetyScore >= 90
                    ? 'Very Safe'
                    : safetyScore >= 75
                      ? 'Safe'
                      : safetyScore >= 60
                        ? 'Moderate'
                        : safetyScore >= 40
                          ? 'Risky'
                          : 'Critical';
              const styleTone = scoreTone(hasEnoughData ? styleScore : null);
              const safetyTone = scoreTone(hasEnoughData ? safetyScore : null);

              const riskTone =
                riskLevel === 'high'
                  ? {
                      bg: 'sq-tone-critical',
                      text: 'text-[color:var(--status-critical)]',
                      border: 'border-[color:var(--status-critical)]/30',
                    }
                  : riskLevel === 'medium'
                    ? {
                        bg: 'sq-tone-warning',
                        text: 'text-[color:var(--status-attention)]',
                        border: 'border-[color:var(--status-attention)]/30',
                      }
                    : {
                        bg: 'sq-tone-success',
                        text: 'text-[color:var(--status-success)]',
                        border: 'border-[color:var(--status-success)]/30',
                      };

              const renderScoreDial = (
                score: number | null,
                tone: ReturnType<typeof scoreTone>,
              ) => (
                <div className="relative w-16 h-16 flex-shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke='var(--border)'
                      strokeWidth="5"
                      fill="none"
                    />
                    {score != null && hasEnoughData && (
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        stroke={tone.stroke}
                        strokeWidth="5"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 28}`}
                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - (score as number) / 100)}`}
                        strokeLinecap="round"
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span
                      className={`text-xs font-bold ${
                        score != null && hasEnoughData
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {score != null && hasEnoughData
                        ? Math.round(score as number)
                        : '\u2014'}
                    </span>
                  </div>
                </div>
              );

              return (
                <div className={cardWrapper}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground`}>
                      Booking Driving Analysis
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg bg-muted`}>
                      <Icon name="hash" className={`w-3 h-3 text-muted-foreground`} />
                      <span className={`text-xs font-mono font-semibold text-foreground`}>
                        {detailBooking.bookingRef}
                      </span>
                    </div>
                    {dataConfidence && (
                      <span
                        className={`ml-auto inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${
                          'bg-muted text-muted-foreground border-border'
                        }`}
                      >
                        Confidence: {String(dataConfidence)}
                      </span>
                    )}
                  </div>

                  {!hasEnoughData && (
                    <div
                      className={`flex items-start gap-2 mb-4 px-3 py-2 rounded-lg border text-xs ${
                        'sq-tone-warning border border-current/20'
                      }`}
                    >
                      <Icon name="alert-triangle" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>Not enough scored trip data for this booking.</span>
                    </div>
                  )}

                  {/* Driving Style + Safety Score */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        'bg-muted/40 border-border'
                      }`}
                      title="Bewertet das Fahrverhalten in Bezug auf Verschleiß, Bremsen, Reifen und Antriebsbelastung. Geschwindigkeitsüberschreitungen sind hier nicht enthalten."
                    >
                      {renderScoreDial(styleScore, styleTone)}
                      <div className="min-w-0">
                        <div className={`text-[10px] font-semibold uppercase tracking-wider ${'text-muted-foreground'}`}>
                          Driving Style
                        </div>
                        <div className={`text-sm font-bold text-foreground`}>
                          {styleScore != null && hasEnoughData
                            ? `${Math.round(styleScore)} / 100`
                            : '\u2014'}
                        </div>
                        <span
                          className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${styleTone.bg} ${styleTone.text} ${styleTone.border}`}
                        >
                          {styleLabel}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`flex items-center gap-3 p-3 rounded-lg border ${
                        'bg-muted/40 border-border'
                      }`}
                      title="Bewertet sicherheitsrelevantes Geschwindigkeitsverhalten anhand von Speed-Limit-Analyse, Überschreitungsanteil und Überschreitungsschwere."
                    >
                      {renderScoreDial(safetyScore, safetyTone)}
                      <div className="min-w-0">
                        <div className={`text-[10px] font-semibold uppercase tracking-wider ${'text-muted-foreground'}`}>
                          Safety
                        </div>
                        <div className={`text-sm font-bold text-foreground`}>
                          {safetyScore != null && hasEnoughData
                            ? `${Math.round(safetyScore)} / 100`
                            : '\u2014'}
                        </div>
                        <span
                          className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${safetyTone.bg} ${safetyTone.text} ${safetyTone.border}`}
                        >
                          {safetyLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Risk + meta strip */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div
                      className={`p-3 rounded-lg border ${riskTone.bg} ${riskTone.border}`}
                    >
                      <div className={`text-[10px] font-semibold uppercase tracking-wider ${riskTone.text}`}>
                        Rental Risk
                      </div>
                      <div className={`text-sm font-bold mt-0.5 ${riskTone.text}`}>
                        {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}
                      </div>
                      {riskAnalysis.summary && (
                        <p className={`text-[11px] mt-1 text-muted-foreground`}>
                          {riskAnalysis.summary}
                        </p>
                      )}
                    </div>
                    <div
                      className={`p-3 rounded-lg border ${
                        'bg-muted/40 border-border'
                      }`}
                    >
                      <div className={`text-[10px] font-semibold uppercase tracking-wider ${'text-muted-foreground'}`}>
                        Coverage
                      </div>
                      <div className={`text-sm font-bold mt-0.5 text-foreground`}>
                        {scoredTripCount != null
                          ? `${scoredTripCount} scored trip${scoredTripCount === 1 ? '' : 's'}`
                          : '\u2014'}
                      </div>
                      <p className={`text-[11px] mt-1 text-muted-foreground`}>
                        {totalDistanceKm != null
                          ? `${Math.round(totalDistanceKm).toLocaleString('de-DE')} km`
                          : 'Distance unavailable'}
                      </p>
                    </div>
                  </div>

                  {/* Event totals */}
                  <div
                    className={`grid grid-cols-3 gap-3 px-3 py-2.5 rounded-lg border ${
                      'bg-muted/40 border-border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon name="trending-up" className={`w-3.5 h-3.5 text-muted-foreground`} />
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider ${'text-muted-foreground'}`}>
                          Driving Events
                        </div>
                        <div className={`text-xs font-bold text-foreground`}>
                          {drivingEventsCount ?? '\u2014'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon name="alert-triangle" className={`w-3.5 h-3.5 text-muted-foreground`} />
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider ${'text-muted-foreground'}`}>
                          Abuse Flags
                        </div>
                        <div className={`text-xs font-bold text-foreground`}>
                          {abuseDetectionCount ?? '\u2014'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon name="activity" className={`w-3.5 h-3.5 text-muted-foreground`} />
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider ${'text-muted-foreground'}`}>
                          Wear Impact
                        </div>
                        <div className={`text-xs font-bold text-foreground`}>
                          {wear.overallWearImpact
                            ? String(wear.overallWearImpact).replace(/_/g, ' ')
                            : bookingAnalysis.wearImpact
                              ? String(bookingAnalysis.wearImpact).replace(/_/g, ' ')
                              : '\u2014'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Inspection recommendation derived from risk */}
                  {riskLevel === 'high' && (
                    <div
                      className={`mt-3 flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${
                        'bg-red-50 text-red-700 border-red-200'
                      }`}
                    >
                      <Icon name="clipboard-check" className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        Inspection recommended on return — high-risk driving
                        profile detected.
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Notes */}
            {(detailBooking.notes || isEditMode) && (
              <div className={`rounded-lg p-8 border shadow-sm ${
                'bg-card border-border'
              }`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center justify-between text-muted-foreground`}>
                  Notizen
                  {isEditMode && <Icon name="pencil" className={`w-3.5 h-3.5 text-[color:var(--brand)]`} />}
                </div>
                {isEditMode ? (
                  <textarea
                    value={inlineEdit.notes ?? detailBooking.notes ?? ''}
                    onChange={e => setInlineEdit(prev => ({ ...prev, notes: e.target.value }))}
                    rows={4}
                    placeholder="Notizen zur Buchung..."
                    className={`w-full px-3 py-3 rounded-lg text-xs resize-none outline-none border transition-colors ${
                      'border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] placeholder:text-muted-foreground'
                    }`}
                  />
                ) : (
                  <div className={`px-3 py-3 rounded-lg ${
                    'bg-muted/50 text-foreground border border-border/30'
                  }`}>
                    {detailBooking.notes}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Cancel Confirmation Dialog (Detail View) */}
      {cancelConfirmId && (() => {
        const allBk = [...activeBookings, ...upcomingBookings, ...completedBookings];
        const booking = allBk.find(b => b.id === cancelConfirmId);
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setCancelConfirmId(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              onClick={(e) => e.stopPropagation()}
              className={`relative w-full max-w-md mx-4 rounded-lg shadow-2xl border overflow-hidden ${
                'bg-card/95 border-border'
              }`}
            >
              <div className="p-8 text-center">
                <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center sq-tone-critical`}>
                  <Icon name="alert-triangle" className={`w-5 h-5 text-[color:var(--status-critical)]`} />
                </div>
                <h3 className={`text-base mb-2 text-foreground`}>Buchung stornieren?</h3>
                <p className={`text-xs mb-1 text-muted-foreground`}>
                  Möchten Sie diese Buchung wirklich stornieren?
                </p>
                {booking && (
                  <div className={`rounded-lg p-3 my-4 text-left text-xs space-y-1.5 bg-muted`}>
                    <div className="flex justify-between">
                      <span className={'text-muted-foreground'}>Kunde</span>
                      <span className={'text-foreground'}>{booking.customer}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={'text-muted-foreground'}>Fahrzeug</span>
                      <span className={'text-foreground'}>{booking.vehicle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={'text-muted-foreground'}>Zeitraum</span>
                      <span className={'text-foreground'}>{booking.startDate} – {booking.endDate}</span>
                    </div>
                    <div className={`flex justify-between pt-1.5 border-t border-border`}>
                      <span className={'text-muted-foreground'}>Betrag</span>
                      <span className={'text-[color:var(--status-critical)]'}>{booking.revenue}</span>
                    </div>
                  </div>
                )}
                <p className={`text-xs mb-3 ${'text-[color:var(--status-critical)]/80'}`}>
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCancelConfirmId(null)}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-xs border transition-all ${
                      'bg-card border-border text-foreground hover:bg-muted'
                    }`}
                  >
                    Zurück
                  </button>
                  <button
                    onClick={executeCancel}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg"
                  >
                    <Icon name="trash-2" className="w-3.5 h-3.5" />
                    Stornieren
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* V4.6.81 — No-Show Confirmation Dialog (Detail View).
          Distinct from the generic cancel dialog: this writes a
          status transition to NO_SHOW (not CANCELLED), sets
          cancelledAt, releases the vehicle to AVAILABLE, and
          optionally persists a free-text reason into booking.notes. */}
      {noShowConfirmId && (() => {
        const allBk = [...activeBookings, ...upcomingBookings, ...completedBookings];
        const booking = allBk.find(b => b.id === noShowConfirmId);
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => { if (!noShowSubmitting) { setNoShowConfirmId(null); setNoShowReason(''); } }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              onClick={(e) => e.stopPropagation()}
              className={`relative w-full max-w-md mx-4 rounded-lg shadow-2xl border overflow-hidden ${
                'bg-card/95 border-border'
              }`}
            >
              <div className="p-8 text-center">
                <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center sq-tone-critical`}>
                  <Icon name="user-x" className={`w-6 h-6 text-[color:var(--status-critical)]`} />
                </div>
                <h3 className={`text-base mb-2 text-foreground`}>Kunde nicht erschienen?</h3>
                <p className={`text-xs mb-1 text-muted-foreground`}>
                  Die Buchung wird auf <strong>No-Show</strong> gesetzt und das Fahrzeug wieder freigegeben.
                </p>
                {booking && (
                  <div className={`rounded-lg p-3 my-4 text-left text-xs space-y-1.5 bg-muted`}>
                    <div className="flex justify-between">
                      <span className={'text-muted-foreground'}>Kunde</span>
                      <span className={'text-foreground'}>{booking.customer}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={'text-muted-foreground'}>Fahrzeug</span>
                      <span className={'text-foreground'}>{booking.vehicle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={'text-muted-foreground'}>Geplanter Pickup</span>
                      <span className={'text-foreground'}>{booking.startDate}</span>
                    </div>
                  </div>
                )}
                <div className="text-left mb-3">
                  <label className={`block text-[11px] font-semibold mb-1 text-foreground`}>
                    Grund (optional)
                  </label>
                  <textarea
                    value={noShowReason}
                    onChange={(e) => setNoShowReason(e.target.value)}
                    rows={3}
                    placeholder="z. B. Kunde telefonisch nicht erreichbar, keine Rückmeldung auf E-Mail …"
                    className={`w-full px-2.5 py-2 rounded-md border text-xs outline-none resize-none ${
                      'border border-border bg-[color:var(--input-background)] text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)]'
                    }`}
                  />
                </div>
                <p className={`text-xs mb-3 ${'text-[color:var(--status-critical)]/80'}`}>
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
                <div className="flex gap-3">
                  <button
                    disabled={noShowSubmitting}
                    onClick={() => { setNoShowConfirmId(null); setNoShowReason(''); }}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-xs border transition-all ${
                      'bg-card border-border text-foreground hover:bg-muted'
                    } ${noShowSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Zurück
                  </button>
                  <button
                    disabled={noShowSubmitting}
                    onClick={executeNoShow}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs bg-rose-600 text-white hover:bg-rose-700 transition-all shadow-lg ${
                      noShowSubmitting ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                  >
                    <Icon name="user-x" className="w-3.5 h-3.5" />
                    {noShowSubmitting ? 'Wird gesetzt …' : 'Als No-Show markieren'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto relative space-y-5">
      <PageHeader
        title="Bookings"
        actions={
          <button
            onClick={onCreateNewBooking}
            className="sq-press flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border"
          >
            <Icon name="plus" className="w-4 h-4 text-[color:var(--brand)]" />
            Create New Booking
          </button>
        }
      />

      {!apiLoaded ? (
        <SkeletonMetricGrid count={4} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {bookingMetricCards.map((card) => {
            const isActive = activeTab === card.tab;
            return (
              <MetricCard
                key={card.label}
                label={card.label}
                value={card.value}
                icon={<Icon name={card.icon} className="w-4 h-4" />}
                status={metricToneToStatus(card.tone)}
                onClick={() => setActiveTab(isActive && card.tab !== null ? null : card.tab)}
                className={isActive ? 'ring-2 ring-[color:var(--brand)]' : undefined}
              />
            );
          })}
        </div>
      )}

      <DataCard className="rounded-2xl shadow-[var(--shadow-1)]" bodyClassName="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative min-w-[220px] flex-1 max-w-[420px]">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search bookings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border/70 bg-card text-xs text-foreground placeholder:text-muted-foreground transition-all duration-200 outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]"
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-muted/40 p-1">
            <button
              onClick={goToPrevMonth}
              className="p-1.5 rounded-lg text-muted-foreground transition-all hover:bg-card hover:text-foreground"
            >
              <Icon name="chevron-left" className="w-4 h-4" />
            </button>
            <button
              onClick={goToCurrentMonth}
              className="px-3 py-1.5 rounded-lg min-w-[150px] text-center text-[11px] font-semibold text-foreground transition-all hover:bg-card"
            >
              {monthNamesDE[displayMonth]} {displayYear}
            </button>
            <button
              onClick={goToNextMonth}
              className="p-1.5 rounded-lg text-muted-foreground transition-all hover:bg-card hover:text-foreground"
            >
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>
            {!isCurrentMonth && (
              <button
                onClick={goToCurrentMonth}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold sq-tone-brand"
              >
                Today
              </button>
            )}
          </div>
        </div>

        {(selectedDate !== null || searchQuery.trim()) && (
          <div className="flex items-center gap-1.5 flex-wrap mt-3">
            {selectedDate !== null && (
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="px-2 py-1 rounded-full text-[10px] font-semibold sq-tone-brand"
              >
                {selectedDate}. {monthNamesDE[displayMonth]} active ×
              </button>
            )}
            {searchQuery.trim() && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="px-2 py-1 rounded-full text-[10px] font-semibold sq-tone-neutral"
              >
                Search: {searchQuery} ×
              </button>
            )}
          </div>
        )}
      </DataCard>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* Bookings List - Left Side */}
        <div className="col-span-1 lg:col-span-2 sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
          <SectionHeader
            title={listSectionTitle}
            description={`${filteredBookings.length} ${filteredBookings.length === 1 ? 'booking' : 'bookings'}`}
            as="label"
          />

          <div className="max-h-[600px] overflow-y-auto">
            <DataTable
              columns={bookingTableColumns}
              rows={filteredBookings}
              getRowKey={(row) => row.id}
              loading={!apiLoaded}
              dense
              card={false}
              onRowClick={(booking) => {
                handleBookingClick(booking.id);
                setPopupBookingId(booking.id);
              }}
              rowActions={(booking) =>
                booking.status === 'confirmed' || booking.status === 'pending' ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailBookingId(booking.id);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold sq-tone-brand hover:opacity-90"
                      title="Buchung bearbeiten"
                    >
                      <Icon name="pencil" className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => confirmCancel(booking.id, e)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold sq-tone-critical hover:opacity-90"
                      title="Buchung stornieren"
                    >
                      <Icon name="trash-2" className="w-3 h-3" />
                    </button>
                  </div>
                ) : null
              }
              empty={
                <EmptyState
                  icon={<Icon name="search" className="w-5 h-5" />}
                  title={
                    searchQuery.trim()
                      ? `Keine Buchungen für „${searchQuery}" gefunden`
                      : 'Keine Buchungen vorhanden'
                  }
                  action={
                    searchQuery.trim() ? (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="text-xs font-semibold px-3 py-1 rounded-lg transition-colors sq-tone-brand"
                      >
                        Suche zurücksetzen
                      </button>
                    ) : undefined
                  }
                  compact
                />
              }
            />
          </div>
        </div>

        {/* Calendar - Right Side */}
        <div className="col-span-1 lg:col-span-3 sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">
              {monthNamesDE[displayMonth]} {displayYear}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevMonth}
                className="p-2 rounded-lg transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Icon name="chevron-left" className="w-5 h-5" />
              </button>
              {!isCurrentMonth && (
                <button
                  onClick={goToCurrentMonth}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 sq-tone-brand"
                >
                  Today
                </button>
              )}
              <button
                onClick={goToNextMonth}
                className="p-2 rounded-lg transition-all duration-200 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Icon name="chevron-right" className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="mb-3">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'].map((day) => (
                <div
                  key={day}
                  className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day, index) => {
                const isToday = day === today.getDate() && isCurrentMonth;
                const dayBookings = day ? getDayBookings(day) : [];
                const hasBooking = dayBookings.length > 0;
                const isInHoveredBooking = day ? isDayInHoveredBooking(day) : false;
                const isSelected = selectedDate === day;
                const dayStatuses = day ? getDayBookingsByStatus(day) : { active: [], upcoming: [], completed: [] };
                const hasActive = dayStatuses.active.length > 0;
                const hasUpcoming = dayStatuses.upcoming.length > 0;
                const hasCompleted = dayStatuses.completed.length > 0;
                const inSelectedBooking = day ? isDayInSelectedBooking(day) : false;
                const bookingColor = getSelectedBookingColor();
                const hasSelectedBooking = selectedBookingId !== null;
                const hoveredColor = getHoveredBookingColor();
                const inActiveTab = day ? isDayInActiveTab(day) : false;
                const tabColor = activeTab === 'active' ? 'blue' : activeTab === 'upcoming' ? 'purple' : 'green';

                  // Determine background based on dominant status
                const getDayBg = () => {
                  if (!day) return '';

                  // When a booking is selected from the list (click)
                  if (hasSelectedBooking) {
                    if (inSelectedBooking) {
                      return bookingColor === 'green'
                        ? 'sq-tone-success shadow-[var(--shadow-1)] ring-2 ring-[color:var(--status-success-soft)] scale-105'
                        : bookingColor === 'purple'
                          ? 'sq-tone-warning shadow-[var(--shadow-1)] ring-2 ring-[color:var(--status-attention-soft)] scale-105'
                          : 'sq-tone-brand shadow-[var(--shadow-1)] ring-2 ring-[color:var(--brand-soft)] scale-105';
                    }
                    if (isToday) return 'sq-tone-brand opacity-60';
                    return 'text-muted-foreground opacity-40';
                  }

                  if (!hasBooking) return '';

                  // When hovering a booking card - use status-based colors
                  if (isInHoveredBooking) {
                    return hoveredColor === 'green'
                      ? 'sq-tone-success shadow-[var(--shadow-1)] ring-2 ring-[color:var(--status-success-soft)] scale-105'
                      : hoveredColor === 'purple'
                        ? 'sq-tone-warning shadow-[var(--shadow-1)] ring-2 ring-[color:var(--status-attention-soft)] scale-105'
                        : 'sq-tone-brand shadow-[var(--shadow-1)] ring-2 ring-[color:var(--brand-soft)] scale-105';
                  }

                  if (isToday) return 'bg-[color:var(--brand)] text-[color:var(--brand-foreground)] shadow-[var(--shadow-1)] ring-2 ring-[color:var(--brand-soft)]';
                  if (isSelected) return 'bg-muted text-foreground ring-2 ring-border shadow-[var(--shadow-1)]';

                  // Tab-based highlighting: emphasize days matching the active tab, dim others
                  if (activeTab !== null && inActiveTab) {
                    return tabColor === 'green'
                      ? 'sq-tone-success border border-current shadow-sm'
                      : tabColor === 'purple'
                        ? 'sq-tone-warning border border-current shadow-sm'
                        : 'sq-tone-brand border border-current shadow-sm';
                  }

                  // No tab selected - show original status-based colors for all booking days
                  if (activeTab === null) {
                    if (hasActive) return 'sq-tone-brand border border-current hover:opacity-90';
                    if (hasUpcoming) return 'sq-tone-warning border border-current hover:opacity-90';
                    if (hasCompleted) return 'sq-tone-success border border-current hover:opacity-90';
                    return '';
                  }

                  // Days with bookings but not matching active tab - subtle/dimmed
                  return 'text-muted-foreground bg-muted/30 border border-border/40';
                };
                
                return (
                  <button
                    key={index}
                    onClick={() => day && handleDayClick(day)}
                    disabled={!day}
                    className={`aspect-square rounded-lg text-xs font-medium transition-all duration-200 relative ${
                      !day 
                        ? '' 
                        : hasSelectedBooking || hasBooking
                        ? getDayBg()
                        : isToday
                        ? 'bg-[color:var(--brand)] text-[color:var(--brand-foreground)] shadow-[var(--shadow-1)] ring-2 ring-[color:var(--brand-soft)]'
                        : isSelected
                        ? 'bg-muted text-foreground'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    {day}
                    {hasBooking && day && !isInHoveredBooking && !isToday && !hasSelectedBooking && (
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                        {hasActive && (
                          <div className={`w-1.5 h-1.5 rounded-full bg-[color:var(--brand)] ${isSelected ? 'ring-1 ring-white' : ''}`} />
                        )}
                        {hasUpcoming && (
                          <div className={`w-1.5 h-1.5 rounded-full bg-[color:var(--status-attention)] ${isSelected ? 'ring-1 ring-white' : ''}`} />
                        )}
                        {hasCompleted && (
                          <div className={`w-1.5 h-1.5 rounded-full bg-[color:var(--status-success)] ${isSelected ? 'ring-1 ring-white' : ''}`} />
                        )}
                      </div>
                    )}
                    {hasBooking && day && !isInHoveredBooking && isToday && !hasSelectedBooking && (
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                        {hasActive && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        {hasUpcoming && <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--status-attention)]" />}
                        {hasCompleted && <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--status-success)]" />}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendar Legend */}
          <div className="pt-4 border-t border-border/60">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--brand)]"></div>
                <span className="text-xs text-muted-foreground">Active</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--status-attention)]"></div>
                <span className="text-xs text-muted-foreground">Upcoming</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--status-success)]"></div>
                <span className="text-xs text-muted-foreground">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-foreground"></div>
                <span className="text-xs text-muted-foreground">Today</span>
              </div>
            </div>
          </div>
        </div>
      </div>


      <DetailDrawer
        open={!!popupBooking}
        onOpenChange={(open) => {
          if (!open) handleClosePopup();
        }}
        title={popupBooking?.vehicle ?? 'Booking'}
        eyebrow={popupBooking ? `${popupBooking.plate} • ${popupBooking.bookingRef}` : undefined}
        description={popupBooking ? popupBooking.customer : undefined}
        status={
          popupBooking ? (
            <StatusChip tone={bookingStatusTone(popupBooking.status)} dot={popupBooking.status === 'active'}>
              {bookingStatusLabel(popupBooking.status)}
            </StatusChip>
          ) : undefined
        }
        footer={
          popupBooking ? (
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-xs font-bold text-[color:var(--status-success)]">{popupBooking.revenue}</span>
              <button
                type="button"
                onClick={() => {
                  setDetailBookingId(popupBooking.id);
                  handleClosePopup();
                }}
                className="sq-press flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold sq-tone-brand"
              >
                <Icon name="maximize-2" className="w-4 h-4" />
                Full detail
              </button>
            </div>
          ) : undefined
        }
        widthClassName="sm:max-w-2xl"
      >
        {popupBooking && (
          <div className="space-y-5">
                              {/* Customer & Booking - Side by Side */}
                              <div className="grid grid-cols-2 gap-3">
                                {/* Customer Info */}
                                <div>
                                  <div className={`text-xs font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>
                                    Kunde
                                  </div>
                                  <div className="space-y-3">
                                    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50`}>
                                      <Icon name="user" className={`w-5 h-5 text-muted-foreground`} />
                                      <div>
                                        <div className={`text-xs text-muted-foreground`}>Name</div>
                                        <div className={`text-xs font-semibold text-foreground`}>{popupBooking.customer}</div>
                                      </div>
                                    </div>
                                    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50`}>
                                      <Icon name="phone" className={`w-5 h-5 text-muted-foreground`} />
                                      <div>
                                        <div className={`text-xs text-muted-foreground`}>Telefon</div>
                                        <div className={`text-xs font-semibold text-foreground`}>{popupBooking.customerPhone}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
          
                                {/* Booking Times */}
                                <div>
                                  <div className={`text-xs font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>
                                    Buchungsdetails
                                  </div>
                                  <div className="space-y-3">
                                    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50`}>
                                      <Icon name="calendar" className={`w-5 h-5 text-muted-foreground`} />
                                      <div>
                                        <div className={`text-xs text-muted-foreground`}>Zeitraum</div>
                                        <div className={`text-xs font-semibold text-foreground`}>{popupBooking.startDate} – {popupBooking.endDate}</div>
                                      </div>
                                    </div>
                                    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50`}>
                                      <Icon name="clock" className={`w-5 h-5 text-muted-foreground`} />
                                      <div>
                                        <div className={`text-xs text-muted-foreground`}>Uhrzeit</div>
                                        <div className={`text-xs font-semibold text-foreground`}>{popupBooking.startTime} – {popupBooking.endTime}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
          
                              {/* Locations */}
                              <div>
                                <div className={`text-xs font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>
                                  Standorte
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50`}>
                                    <Icon name="map-pin" className={`w-5 h-5 text-[color:var(--brand)]`} />
                                    <div>
                                      <div className={`text-xs text-muted-foreground`}>Abholung</div>
                                      <div className={`text-xs font-semibold text-foreground`}>{popupBooking.pickupLocation}</div>
                                    </div>
                                  </div>
                                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50`}>
                                    <Icon name="map-pin" className={`w-5 h-5 ${'text-[color:var(--status-success)]'}`} />
                                    <div>
                                      <div className={`text-xs text-muted-foreground`}>Rückgabe</div>
                                      <div className={`text-xs font-semibold text-foreground`}>{popupBooking.returnLocation}</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
          
                              {/* Vehicle & Payment - 4 columns */}
                              <div>
                                <div className={`text-xs font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>
                                  Fahrzeug & Zahlung
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50`}>
                                    <Icon name="shield" className={`w-5 h-5 text-muted-foreground`} />
                                    <div>
                                      <div className={`text-xs text-muted-foreground`}>Versicherung</div>
                                      <div className={`text-xs font-semibold text-foreground`}>{popupBooking.insurance}</div>
                                    </div>
                                  </div>
                                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50`}>
                                    <Icon name="credit-card" className={`w-5 h-5 text-muted-foreground`} />
                                    <div>
                                      <div className={`text-xs text-muted-foreground`}>Zahlungsart</div>
                                      <div className={`text-xs font-semibold text-foreground`}>{popupBooking.paymentMethod}</div>
                                    </div>
                                  </div>
                                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50`}>
                                    <Icon name="fuel" className={`w-5 h-5 text-muted-foreground`} />
                                    <div>
                                      <div className={`text-xs text-muted-foreground`}>Tankstand</div>
                                      <div className={`text-xs font-semibold text-foreground`}>{popupBooking.fuelLevel}</div>
                                    </div>
                                  </div>
                                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/50`}>
                                    <Icon name="car" className={`w-5 h-5 text-muted-foreground`} />
                                    <div>
                                      <div className={`text-xs text-muted-foreground`}>Kilometerstand</div>
                                      <div className={`text-xs font-semibold text-foreground`}>
                                        {/* V4.6.72 — `mileageStart` / `mileageEnd` are always null for
                                            bookings returned from the API (the fields are not persisted
                                            on the Booking model; mapApiBooking assigns null). Without
                                            this guard the expanded booking card crashes on
                                            `.toLocaleString` the moment the user clicks any booking. */}
                                        {popupBooking.mileageStart != null ? `${popupBooking.mileageStart.toLocaleString('de-DE')} km` : '—'}
                                        {popupBooking.mileageStart != null && popupBooking.mileageEnd != null && (
                                          <span className={`ml-1 text-muted-foreground`}>
                                            → {popupBooking.mileageEnd.toLocaleString('de-DE')} km
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
          
                              {/* Mileage Summary for completed */}
                              {popupBooking.status === 'completed' && popupBooking.mileageEnd != null && popupBooking.mileageStart != null && (
                                <div className={`flex items-center gap-3 px-3 py-3 rounded-lg ${
                                  'sq-tone-success border border-current/30'
                                }`}>
                                  <Icon name="car" className="w-5 h-5" />
                                  <span className="font-semibold">Gefahrene Kilometer:</span> {(popupBooking.mileageEnd - popupBooking.mileageStart).toLocaleString('de-DE')} km
                                </div>
                              )}
          
                              {/* Notes */}
                              {popupBooking.notes && (
                                <div className={`px-3 py-3 rounded-lg ${
                                  'bg-muted/50 text-muted-foreground border border-border/30'
                                }`}>
                                  <span className="font-semibold">Notiz:</span> {popupBooking.notes}
                                </div>
                              )}
          
                              {/* Documents Section */}
                              {(popupBooking.pickupProtocol || popupBooking.returnProtocol) && (
                                <div>
                                  <div className={`text-xs font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>
                                    Dokumente
                                  </div>
                                  <div className="space-y-2">
                                    {popupBooking.pickupProtocol && (
                                      <div className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all duration-200 ${
                                        'bg-card border-border/60 hover:border-[color:var(--brand)] hover:bg-muted/50'
                                      }`}>
                                        <div className="flex items-center gap-3">
                                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center sq-tone-brand`}>
                                            <Icon name="clipboard-check" className={`w-5 h-5 text-[color:var(--brand)]`} />
                                          </div>
                                          <div>
                                            <div className={`text-xs font-semibold text-foreground`}>
                                              Pickup-Protokoll
                                            </div>
                                            <div className={`text-xs font-mono text-muted-foreground`}>
                                              HO-PICKUP-{(popupBooking.bookingRef || '').replace('BK-', '')}.pdf
                                            </div>
                                            {popupBooking.pickupProtocol?.performedByName || popupBooking.pickupProtocol?.performedAt ? (
                                              <div className={`text-[10px] mt-0.5 text-muted-foreground`}>
                                                {[
                                                  popupBooking.pickupProtocol?.performedByName || null,
                                                  popupBooking.pickupProtocol?.performedAt
                                                    ? new Date(popupBooking.pickupProtocol.performedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
                                                    : null,
                                                ].filter(Boolean).join(' · ')}
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            className={`p-2 rounded-lg transition-all duration-200 ${
                                              'hover:bg-muted text-muted-foreground hover:text-[color:var(--brand)]'
                                            }`}
                                            title="Ansehen"
                                          >
                                            <Icon name="eye" className="w-5 h-5" />
                                          </button>
                                          <button
                                            className={`p-2 rounded-lg transition-all duration-200 ${
                                              'hover:bg-muted text-muted-foreground hover:text-[color:var(--brand)]'
                                            }`}
                                            title="Herunterladen"
                                          >
                                            <Icon name="download" className="w-5 h-5" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                    {popupBooking.returnProtocol && (
                                      <div className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all duration-200 ${
                                        'bg-card border-border/60 hover:border-[color:var(--status-success)] hover:bg-muted/50'
                                      }`}>
                                        <div className="flex items-center gap-3">
                                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${
                                            'sq-tone-success'
                                          }`}>
                                            <Icon name="file-text" className={`w-5 h-5 text-[color:var(--status-success)]`} />
                                          </div>
                                          <div>
                                            <div className={`text-xs font-semibold text-foreground`}>
                                              Return-Protokoll
                                            </div>
                                            <div className={`text-xs font-mono text-muted-foreground`}>
                                              HO-RETURN-{(popupBooking.bookingRef || '').replace('BK-', '')}.pdf
                                            </div>
                                            {popupBooking.returnProtocol?.performedByName || popupBooking.returnProtocol?.performedAt ? (
                                              <div className={`text-[10px] mt-0.5 text-muted-foreground`}>
                                                {[
                                                  popupBooking.returnProtocol?.performedByName || null,
                                                  popupBooking.returnProtocol?.performedAt
                                                    ? new Date(popupBooking.returnProtocol.performedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
                                                    : null,
                                                ].filter(Boolean).join(' · ')}
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            className={`p-2 rounded-lg transition-all duration-200 ${
                                              'hover:bg-muted text-muted-foreground hover:text-[color:var(--status-success)]'
                                            }`}
                                            title="Ansehen"
                                          >
                                            <Icon name="eye" className="w-5 h-5" />
                                          </button>
                                          <button
                                            className={`p-2 rounded-lg transition-all duration-200 ${
                                              'hover:bg-muted text-muted-foreground hover:text-[color:var(--status-success)]'
                                            }`}
                                            title="Herunterladen"
                                          >
                                            <Icon name="download" className="w-5 h-5" />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
          </div>
        )}
      </DetailDrawer>

      {/* Edit Booking Modal */}
      {editingBooking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setEditingBooking(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-2xl mx-4 rounded-lg shadow-2xl border overflow-hidden ${
              'bg-card/95 border-border'
            } max-h-[90vh] flex flex-col`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-3 py-3 border-b shrink-0 border-border`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg sq-tone-brand`}>
                  <Icon name="pencil" className={`w-5 h-5 text-[color:var(--brand)]`} />
                </div>
                <div>
                  <h3 className={`text-base text-foreground`}>Buchung bearbeiten</h3>
                  <p className={`text-xs text-muted-foreground`}>Ref: {editingBooking.bookingRef}</p>
                </div>
              </div>
              <button onClick={() => setEditingBooking(null)} className={`p-1.5 rounded-lg transition-colors hover:bg-muted text-muted-foreground`}>
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form */}
            <div className="overflow-y-auto flex-1 px-3 py-3 space-y-5">
              {/* Section: Kunde & Fahrzeug */}
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>Kunde & Fahrzeug</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={`text-xs mb-1 block text-muted-foreground`}>Kunde</label>
                    <input type="text" value={editForm.customer} onChange={(e) => setEditForm(f => ({ ...f, customer: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none`} />
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block text-muted-foreground`}>Fahrzeug</label>
                    <input type="text" value={editForm.vehicle} onChange={(e) => setEditForm(f => ({ ...f, vehicle: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none`} />
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block text-muted-foreground`}>Kennzeichen</label>
                    <input type="text" value={editForm.plate} onChange={(e) => setEditForm(f => ({ ...f, plate: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none`} />
                  </div>
                </div>
              </div>

              {/* Section: Zeitraum */}
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>Zeitraum</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className={`text-xs mb-1 block text-muted-foreground`}>Startdatum</label>
                    <input type="text" value={editForm.startDate} onChange={(e) => setEditForm(f => ({ ...f, startDate: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none`} />
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block text-muted-foreground`}>Abholzeit</label>
                    <input type="text" value={editForm.startTime} onChange={(e) => setEditForm(f => ({ ...f, startTime: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none`} />
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block text-muted-foreground`}>Enddatum</label>
                    <input type="text" value={editForm.endDate} onChange={(e) => setEditForm(f => ({ ...f, endDate: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none`} />
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block text-muted-foreground`}>Rückgabezeit</label>
                    <input type="text" value={editForm.endTime} onChange={(e) => setEditForm(f => ({ ...f, endTime: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none`} />
                  </div>
                </div>
              </div>

              {/* Section: Stationen */}
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>Stationen</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-xs mb-1 block text-muted-foreground`}>Abholstation</label>
                    <select value={editForm.pickupLocation} onChange={(e) => setEditForm(f => ({ ...f, pickupLocation: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none`}>
                      {locationOptions.length === 0 ? (
                        <option value="">Keine Stationen verfügbar</option>
                      ) : (
                        locationOptions.map((loc) => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block text-muted-foreground`}>Rückgabestation</label>
                    <select value={editForm.returnLocation} onChange={(e) => setEditForm(f => ({ ...f, returnLocation: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none`}>
                      {locationOptions.length === 0 ? (
                        <option value="">Keine Stationen verfügbar</option>
                      ) : (
                        locationOptions.map((loc) => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section: Versicherung & Zahlung */}
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>Versicherung & Zahlung</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-xs mb-1 block text-muted-foreground`}>Versicherung</label>
                    <select value={editForm.insurance} onChange={(e) => setEditForm(f => ({ ...f, insurance: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none`}>
                      <option value="Vollkasko">Vollkasko</option>
                      <option value="Teilkasko">Teilkasko</option>
                      <option value="Haftpflicht">Haftpflicht</option>
                      <option value="Premium Vollkasko">Premium Vollkasko</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block text-muted-foreground`}>Zahlungsmethode</label>
                    <select value={editForm.paymentMethod} onChange={(e) => setEditForm(f => ({ ...f, paymentMethod: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none`}>
                      <option value="Kreditkarte">Kreditkarte</option>
                      <option value="PayPal">PayPal</option>
                      <option value="Überweisung">Überweisung</option>
                      <option value="Lastschrift">Lastschrift</option>
                      <option value="Bar">Bar</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section: Notizen */}
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wider mb-3 text-muted-foreground`}>Notizen</div>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Optionale Anmerkungen zur Buchung..."
                  className={`w-full px-3 py-2 rounded-lg text-xs border transition-all resize-none border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] placeholder:text-muted-foreground outline-none`}
                />
              </div>
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-end gap-3 px-3 py-3 border-t shrink-0 border-border`}>
              <button
                onClick={() => setEditingBooking(null)}
                className={`px-3 py-2 rounded-lg text-xs transition-all ${
                  'text-foreground hover:bg-muted'
                }`}
              >
                Abbrechen
              </button>
              <button
                onClick={saveEdit}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl"
              >
                <Icon name="save" className="w-3.5 h-3.5" />
                Änderungen speichern
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Dialog */}
      {cancelConfirmId && (() => {
        const allBk = [...activeBookings, ...upcomingBookings, ...completedBookings];
        const booking = allBk.find(b => b.id === cancelConfirmId);
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setCancelConfirmId(null)}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
              onClick={(e) => e.stopPropagation()}
              className={`relative w-full max-w-md mx-4 rounded-lg shadow-2xl border overflow-hidden ${
                'bg-card/95 border-border'
              }`}
            >
              <div className="p-8 text-center">
                <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center sq-tone-critical`}>
                  <Icon name="alert-triangle" className={`w-5 h-5 text-[color:var(--status-critical)]`} />
                </div>
                <h3 className={`text-base mb-2 text-foreground`}>Buchung stornieren?</h3>
                <p className={`text-xs mb-1 text-muted-foreground`}>
                  Möchten Sie diese Buchung wirklich stornieren?
                </p>
                {booking && (
                  <div className={`rounded-lg p-3 my-4 text-left text-xs space-y-1.5 bg-muted`}>
                    <div className="flex justify-between">
                      <span className={'text-muted-foreground'}>Kunde</span>
                      <span className={'text-foreground'}>{booking.customer}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={'text-muted-foreground'}>Fahrzeug</span>
                      <span className={'text-foreground'}>{booking.vehicle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={'text-muted-foreground'}>Zeitraum</span>
                      <span className={'text-foreground'}>{booking.startDate} – {booking.endDate}</span>
                    </div>
                    <div className={`flex justify-between pt-1.5 border-t border-border`}>
                      <span className={'text-muted-foreground'}>Betrag</span>
                      <span className={'text-[color:var(--status-critical)]'}>{booking.revenue}</span>
                    </div>
                  </div>
                )}
                <p className={`text-xs mb-3 ${'text-[color:var(--status-critical)]/80'}`}>
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCancelConfirmId(null)}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-xs border transition-all ${
                      'bg-card border-border text-foreground hover:bg-muted'
                    }`}
                  >
                    Zurück
                  </button>
                  <button
                    onClick={executeCancel}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg"
                  >
                    <Icon name="trash-2" className="w-3.5 h-3.5" />
                    Stornieren
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}