
import { Baby, CheckCircle, Clock, CreditCard, Globe, MapPin, Snowflake, UserCheck, Wifi, Zap } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { useRentalOrg } from '../RentalContext';
import { useFleetVehicles } from '../FleetContext';
import { useHandover } from '../HandoverContext';
import { api } from '../../lib/api';
import { mapApiBooking, type BookingUiRow } from '../lib/entityMappers';
import {
  applyBookingFieldUpdates,
  bookingVersionConflictMessage,
} from '../lib/bookingUpdateCommands';
import { BrandLogoMark, getBrandFromModel } from './BrandLogo';
import { EntityTasksSection } from './EntityTasksSection';
import { MisuseCasesPanel } from './MisuseCasesPanel';
import { BookingsPage } from './bookings/BookingsPage';
import { BookingDossier } from './booking-detail/BookingDossier';
import { StationSelectFields } from './stations/StationSelectFields';
import { bookingStatusLabel as plannerStatusLabel, bookingStatusTone as plannerStatusTone } from './bookings/bookingStatus';
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
  FormDialog,
  ConfirmDialog,
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

const bookingStatusTone = (status: string): StatusTone => plannerStatusTone(status as any);

const bookingStatusLabel = (status: string): string => plannerStatusLabel(status as any) || status;

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
  onBookingCancelled?: (bookingId: string, meta?: { vehicleId?: string | null }) => void;
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
  const [apiError, setApiError] = useState<string | null>(null);
  const [rawApiBookings, setRawApiBookings] = useState<any[]>([]);
  const [apiCustomers, setApiCustomers] = useState<any[]>([]);
  const [apiUsers, setApiUsers] = useState<any[]>([]);
  const [apiStations, setApiStations] = useState<any[]>([]);

  const loadBookings = useCallback(() => {
    if (!orgId) return;
    setApiError(null);
    api.bookings
      .list(orgId, { limit: 500 })
      .then((res: any) => {
        const list = Array.isArray(res) ? res : res?.data ?? res?.items ?? [];
        setRawApiBookings(list);
        setApiBookings(list.map(mapApiBooking));
        setApiLoaded(true);
      })
      .catch(() => {
        setApiError('Buchungen konnten nicht geladen werden.');
        setApiLoaded(true);
      });
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
  const [editForm, setEditForm] = useState({
    startDate: '', endDate: '', startTime: '', endTime: '',
    pickupLocation: '', returnLocation: '',
    pickupStationId: '', returnStationId: '',
    insurance: '', paymentMethod: '', notes: '', customer: '', vehicle: '', plate: '',
  });
  const [editSameReturnStation, setEditSameReturnStation] = useState(true);
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

  const saveInlineEdit = async (booking: BookingUiRow) => {
    if (!orgId) return;
    const { _bookingId: _omitBookingId, ...cleanEdit } = inlineEdit;
    const patch: Record<string, unknown> = {};

    const parseDateToISO = (dateStr: string, timeStr?: string): string | undefined => {
      if (!dateStr) return undefined;
      const m = dateStr.match(/(\d+)\s+(\w+)\s+(\d+)/);
      if (m) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mi = months.indexOf(m[2]);
        if (mi >= 0) {
          const d = new Date(parseInt(m[3], 10), mi, parseInt(m[1], 10));
          const [hh, mm] = (timeStr || '10:00').split(':');
          d.setHours(parseInt(hh, 10) || 10, parseInt(mm, 10) || 0, 0, 0);
          return d.toISOString();
        }
      }
      const direct = new Date(dateStr);
      if (!Number.isNaN(direct.getTime())) return direct.toISOString();
      return undefined;
    };

    const startIso = parseDateToISO(
      cleanEdit.startDate || booking.startDate,
      cleanEdit.startTime ?? booking.startTime,
    );
    const endIso = parseDateToISO(cleanEdit.endDate || booking.endDate, cleanEdit.endTime ?? booking.endTime);
    if (startIso) patch.startDate = startIso;
    if (endIso) patch.endDate = endIso;
    if (cleanEdit.notes !== undefined) patch.notes = cleanEdit.notes;

    const selectedVehicle = fleetVehicles.find(
      (v) =>
        `${v.make ?? ''} ${v.model}`.trim() === cleanEdit.vehicle ||
        v.license === cleanEdit.plate,
    );
    if (selectedVehicle && selectedVehicle.id !== booking.vehicleId) {
      patch.vehicleId = selectedVehicle.id;
    }

    const selectedCustomer = apiCustomers.find((c: any) => {
      const label = c.name || [c.firstName, c.lastName].filter(Boolean).join(' ');
      return label === cleanEdit.customer;
    });
    if (selectedCustomer?.id && selectedCustomer.id !== booking.customerId) {
      patch.customerId = selectedCustomer.id;
    }

    if (cleanEdit.includedKm != null) patch.kmIncluded = Number(cleanEdit.includedKm);

    if (Object.keys(patch).length === 0) {
      toast.error('Keine speicherbaren Änderungen');
      return;
    }

    if (!booking.updatedAt) {
      toast.error('Buchungsversion unbekannt — bitte neu laden');
      return;
    }

    try {
      await applyBookingFieldUpdates(
        orgId,
        booking.id,
        booking.updatedAt,
        {
          startDate: patch.startDate as string | undefined,
          endDate: patch.endDate as string | undefined,
          notes: patch.notes as string | undefined,
          kmIncluded: patch.kmIncluded as number | undefined,
          vehicleId: patch.vehicleId as string | undefined,
          customerId: patch.customerId as string | undefined,
        },
        {
          startDate: booking.startDateIso,
          endDate: booking.endDateIso,
          notes: booking.notes,
          kmIncluded: booking.includedKm,
          vehicleId: booking.vehicleId,
          customerId: booking.customerId,
        },
      );
      await loadBookings();
      onBookingUpdated?.({
        ...booking,
        ...cleanEdit,
        vehicleId: selectedVehicle?.id ?? booking.vehicleId,
        previousVehicleId:
          selectedVehicle && selectedVehicle.id !== booking.vehicleId
            ? booking.vehicleId
            : undefined,
      });
      toast.success('Buchung gespeichert', {
        description: `${cleanEdit.vehicle || booking.vehicle} · ${cleanEdit.customer || booking.customer}`,
      });
      setIsEditMode(false);
      setInlineEdit({});
      setActiveDropdown(null);
    } catch (err: unknown) {
      const msg = bookingVersionConflictMessage(err);
      toast.error('Buchung konnte nicht gespeichert werden', { description: msg });
    }
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
            'surface-premium border-border'
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
    const raw = booking._raw as { pickupStationId?: string; returnStationId?: string } | undefined;
    const pickupId = raw?.pickupStationId ?? booking.pickupStationId ?? '';
    const returnId = raw?.returnStationId ?? booking.returnStationId ?? '';
    setEditSameReturnStation(!pickupId || !returnId || pickupId === returnId);
    setEditForm({
      startDate: booking.startDate,
      endDate: booking.endDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      pickupLocation: booking.pickupLocation,
      returnLocation: booking.returnLocation,
      pickupStationId: pickupId,
      returnStationId: returnId || pickupId,
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
      if (editForm.pickupStationId) patch.pickupStationId = editForm.pickupStationId;
      const effectiveReturnId = editSameReturnStation
        ? editForm.pickupStationId
        : editForm.returnStationId;
      if (effectiveReturnId) patch.returnStationId = effectiveReturnId;
      if (Array.isArray(editForm.insurance)) patch.insuranceOptions = editForm.insurance;
      else if (typeof editForm.insurance === 'string' && editForm.insurance) patch.insuranceOptions = [editForm.insurance];

      // Only call API for bookings that exist server-side (UUID-like id)
      const isPersistedId = typeof editingBooking.id === 'string' && !editingBooking.id.startsWith('new-');
      if (isPersistedId && Object.keys(patch).length > 0) {
        if (!editingBooking.updatedAt) {
          toast.error('Buchungsversion unbekannt — bitte neu laden');
          return;
        }
        await applyBookingFieldUpdates(
          orgId,
          editingBooking.id,
          editingBooking.updatedAt,
          {
            startDate: patch.startDate,
            endDate: patch.endDate,
            notes: patch.notes,
            pickupStationId: patch.pickupStationId,
            returnStationId: patch.returnStationId,
          },
          {
            startDate: editingBooking.startDateIso,
            endDate: editingBooking.endDateIso,
            notes: editingBooking.notes,
            pickupStationId: editingBooking.pickupStationId,
            returnStationId: editingBooking.returnStationId,
          },
        );
      }

      setLocalEdits(prev => ({ ...prev, [editingBooking.id]: editForm }));
      onBookingUpdated?.(updatedBooking);
      toast.success('Buchung aktualisiert', {
        description: `${editForm.vehicle || editingBooking.vehicle} • ${editForm.customer || editingBooking.customer}`,
        duration: 3000,
      });
      setEditingBooking(null);
      loadBookings();
    } catch (err: unknown) {
      const msg = bookingVersionConflictMessage(err);
      toast.error('Fehler beim Speichern', { description: msg });
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
      onBookingCancelled?.(noShowConfirmId, { vehicleId: booking?.vehicleId ?? null });
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
      onBookingCancelled?.(cancelConfirmId, { vehicleId: booking?.vehicleId ?? null });
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

  const plannerBookings = useMemo(() => {
    const apiIds = new Set(apiBookings.map((b) => b.id));
    const extraRows = additionalBookings
      .filter((b) => b?.id && !apiIds.has(b.id))
      .map((b) => (b.bookingRef ? (b as BookingUiRow) : mapApiBooking(b)));
    return applyEdits([...apiBookings, ...extraRows]);
  }, [apiBookings, additionalBookings, localCancelled, localEdits]);

  // V4.6.76 Rental Health V1 — derive the detail booking's vehicle at the
  // top level so we can unconditionally call useVehicleHealth (hooks MUST
  // run on every render). Passing a null vehicleId short-circuits the fetch.
  const detailVehicleId = useMemo(() => {
    if (!detailBookingId) return null;
    const b = plannerBookings.find((x) => x.id === detailBookingId) as BookingUiRow | undefined;
    const raw = b?._raw as { vehicleId?: string } | undefined;
    return (b?.vehicleId ?? raw?.vehicleId ?? null) as string | null;
  }, [detailBookingId, plannerBookings]);
  const { data: detailHealth } = useVehicleHealth(orgId, detailVehicleId);

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
        cell: (booking: BookingUiRow) => {
          const fleetVehicle = booking.vehicleId
            ? fleetVehicles.find((v) => v.id === booking.vehicleId)
            : undefined;
          const brand = fleetVehicle
            ? getBrandFromModel({ make: fleetVehicle.make, model: fleetVehicle.model })
            : getBrandFromModel(booking.vehicle);
          return (
            <div className="flex items-center gap-2 text-xs">
              <BrandLogoMark brand={brand} isDarkMode={systemDark} />
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">{booking.vehicle}</div>
                <div className="text-muted-foreground">{booking.plate}</div>
              </div>
            </div>
          );
        },
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
    [fleetVehicles, systemDark],
  );

  const popupBooking = useMemo(() => {
    if (!popupBookingId) return null;
    return plannerBookings.find((b) => b.id === popupBookingId) ?? null;
  }, [popupBookingId, plannerBookings]);

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

  if (detailBookingId) {
    return (
      <BookingDossier
        bookingId={detailBookingId}
        onBack={() => { setDetailBookingId(null); cancelEditMode(); }}
        isDarkMode={systemDark}
        onRefreshList={loadBookings}
        onBookingCancelled={onBookingCancelled}
        onOpenVehicle={(vehicleId) => {
          const vehicle = fleetVehicles.find((v) => v.id === vehicleId);
          if (vehicle) onNavigateToVehicle?.(vehicle.model);
        }}
      />
    );
  }

  return (
    <>
      <BookingsPage
        bookings={plannerBookings}
        loading={!apiLoaded && !apiError}
        error={apiError}
        onRetry={loadBookings}
        fleetVehicles={fleetVehicles}
        stations={apiStations.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))}
        onCreateNewBooking={onCreateNewBooking}
        onOpenDetail={(id) => setDetailBookingId(id)}
        onOpenDrawer={(id) => {
          setPopupBookingId(id);
          setSelectedBookingId(id);
        }}
        onCancelBooking={(id) => setCancelConfirmId(id)}
      />


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
                                        'surface-premium border-border/60 hover:border-[color:var(--brand)] hover:bg-muted/50'
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
                                        'surface-premium border-border/60 hover:border-[color:var(--status-success)] hover:bg-muted/50'
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

      <FormDialog
        open={!!editingBooking}
        onOpenChange={(open) => { if (!open) setEditingBooking(null); }}
        maxWidthClassName="sm:max-w-2xl"
        title="Buchung bearbeiten"
        description={editingBooking ? `Ref: ${editingBooking.bookingRef}` : undefined}
        bodyClassName="p-0"
        footer={(
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditingBooking(null)}
              className="rounded-lg px-3 py-2 text-xs text-foreground transition-all hover:bg-muted"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={saveEdit}
              className="sq-cta flex items-center gap-1.5 px-3 py-2 text-xs font-semibold"
            >
              <Icon name="save" className="w-3.5 h-3.5" />
              Änderungen speichern
            </button>
          </div>
        )}
      >
        {editingBooking && (
            <div className="max-h-[min(70vh,100dvh-14rem)] overflow-y-auto px-3 py-3 space-y-5">
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
                    <div className="flex items-center gap-2">
                      <BrandLogoMark
                        brand={getBrandFromModel(editForm.vehicle)}
                        isDarkMode={systemDark}
                      />
                      <select
                        value={editForm.vehicle}
                        onChange={(e) => {
                          const selected = vehicleOptions.find((v) => v.name === e.target.value);
                          setEditForm((f) => ({
                            ...f,
                            vehicle: e.target.value,
                            plate: selected?.plate ?? f.plate,
                          }));
                        }}
                        className={`min-w-0 flex-1 px-3 py-2 rounded-lg text-xs border transition-all border border-border bg-[color:var(--input-background)] text-foreground focus:border-[color:var(--brand)] outline-none`}
                      >
                        {vehicleOptions.length === 0 ? (
                          <option value="">Keine Fahrzeuge verfügbar</option>
                        ) : (
                          vehicleOptions.map((v) => (
                            <option key={v.id} value={v.name}>
                              {v.name} · {v.plate}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
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
                <StationSelectFields
                  stations={apiStations}
                  pickupStationId={editForm.pickupStationId}
                  returnStationId={editForm.returnStationId}
                  sameReturnStation={editSameReturnStation}
                  onPickupChange={(id) => {
                    setEditForm((f) => ({
                      ...f,
                      pickupStationId: id,
                      returnStationId: editSameReturnStation ? id : f.returnStationId,
                    }));
                  }}
                  onReturnChange={(id) => setEditForm((f) => ({ ...f, returnStationId: id }))}
                  onSameReturnChange={setEditSameReturnStation}
                  compact
                />
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
        )}
      </FormDialog>

      <ConfirmDialog
        open={!!cancelConfirmId}
        onOpenChange={(open) => { if (!open) setCancelConfirmId(null); }}
        title="Buchung stornieren?"
        description="Möchten Sie diese Buchung wirklich stornieren? Diese Aktion kann nicht rückgängig gemacht werden."
        confirmLabel="Stornieren"
        cancelLabel="Zurück"
        tone="critical"
        onConfirm={executeCancel}
      >
        {(() => {
        const allBk = [...activeBookings, ...upcomingBookings, ...completedBookings];
        const booking = allBk.find(b => b.id === cancelConfirmId);
        return booking ? (
                  <div className={`rounded-lg p-3 my-2 text-left text-xs space-y-1.5 bg-muted`}>
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
        ) : null;
        })()}
      </ConfirmDialog>
    </>
  );
}