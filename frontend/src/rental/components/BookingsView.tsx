import { Calendar, Clock, User, MapPin, DollarSign, Search, Plus, CheckCircle, TrendingUp, Euro, ChevronLeft, ChevronRight, ChevronDown, Zap, FileText, Shield, Car, Phone, CreditCard, Hash, Fuel, ClipboardCheck, Download, Eye, X, BookOpen, Maximize2, Minimize2, ArrowLeft, Globe, UserCheck, Users, ArrowUpDown, TrendingDown, AlertTriangle, Navigation, Activity, ThermometerSun, Wind, Gauge, Info, Radio, Pencil, Trash2, Save, Package, Snowflake, Baby, Wifi, CircleDot, Mail, IdCard, Building2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';

interface BookingsViewProps {
  isDarkMode: boolean;
  onActiveBookingRefChange?: (ref: string | null) => void;
  onNavigateToVehicle?: (vehicleName: string) => void;
  onCreateNewBooking?: () => void;
  additionalBookings?: any[];
  onBookingUpdated?: (updatedBooking: any) => void;
  onBookingCancelled?: (bookingId: string) => void;
}

export function BookingsView({ isDarkMode, onActiveBookingRefChange, onNavigateToVehicle, onCreateNewBooking, additionalBookings = [], onBookingUpdated, onBookingCancelled }: BookingsViewProps) {
  const { orgId } = useRentalOrg();
  const [apiBookings, setApiBookings] = useState<any[]>([]);
  const [apiLoaded, setApiLoaded] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    api.bookings.list(orgId)
      .then((res: any) => {
        const list = Array.isArray(res) ? res : res?.data ?? [];
        setApiBookings(list);
        setApiLoaded(true);
      })
      .catch(() => setApiLoaded(true));
  }, [orgId]);

  const [activeTab, setActiveTab] = useState<'active' | 'upcoming' | 'completed' | null>('active');
  const [selectedDate, setSelectedDate] = useState<number | null>(null);
  const [hoveredBookingId, setHoveredBookingId] = useState<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const [popupBookingId, setPopupBookingId] = useState<string | null>(null);
  const [popupAnimating, setPopupAnimating] = useState(false);
  const [popupClosing, setPopupClosing] = useState(false);
  const [popupFullView, setPopupFullView] = useState(false);
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Edit & Cancel state
  const [editingBooking, setEditingBooking] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ startDate: '', endDate: '', startTime: '', endTime: '', pickupLocation: '', returnLocation: '', insurance: '', paymentMethod: '', notes: '', customer: '', vehicle: '', plate: '' });
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [localCancelled, setLocalCancelled] = useState<string[]>([]);
  const [localEdits, setLocalEdits] = useState<Record<string, any>>({});

  // Inline edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<Record<string, any>>({});
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Inline calendar state (for edit mode date picking)
  const [editCalendarOpen, setEditCalendarOpen] = useState(false);
  const [editCalendarMonth, setEditCalendarMonth] = useState(2); // March 2026
  const [editCalendarYear, setEditCalendarYear] = useState(2026);
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

  const vehicleOptions = [
    { name: 'Mercedes AMG GT', plate: 'KS-MG-2020' },
    { name: 'VW Touareg', plate: 'KS-VT-2021' },
    { name: 'Hyundai Tucson', plate: 'KS-HT-2024' },
    { name: 'Tesla Model S', plate: 'KS-TS-2020' },
    { name: 'BMW X5', plate: 'KS-BX-2023' },
    { name: 'Audi A6 Avant', plate: 'KS-AA-2022' },
  ];
  const customerOptions = [
    { name: 'Kunde A', phone: '+49 151 1234 5678' },
    { name: 'Kunde B', phone: '+49 170 9876 5432' },
    { name: 'Kunde C', phone: '+49 162 3456 7890' },
  ];
  const locationOptions: string[] = [];
  const insuranceOptions = ['Vollkasko', 'Teilkasko', 'Haftpflicht', 'Premium Vollkasko'];
  const paymentOptions = ['Kreditkarte', 'EC-Karte', 'PayPal', 'Lastschrift', 'Rechnung', 'Bar'];
  const sourceOptions = ['Website', 'App', 'Telefon', 'Walk-in', 'Partner'];
  const employeeOptions = ['Max Müller', 'Sarah Schmidt', 'Tom Weber', 'Lisa Klein', 'Jan Fischer'];
  const kmPackageOptions = [
    { km: 500, label: 'Basis' },
    { km: 750, label: 'Standard' },
    { km: 1000, label: 'Komfort' },
    { km: 1500, label: 'Premium' },
    { km: 2000, label: 'Unlimited' },
  ];

  // Calendar helper functions for inline edit
  const editCalMonthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const editCalMonthNamesShortEN: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const editCalMonthShortEN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Parse "DD Mon YYYY" â†’ ISO "YYYY-MM-DD"
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

  // ISO "YYYY-MM-DD" â†’ "DD Mon YYYY"
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

  const editVehicleBookings: Record<string, { startDay: number; endDay: number; startMonth: number; endMonth: number; customer: string; reason: 'booking' | 'maintenance' }[]> = {
    'Mercedes AMG GT': [
      { startDay: 1, endDay: 15, startMonth: 2, endMonth: 2, customer: 'Max Mustermann', reason: 'booking' },
      { startDay: 22, endDay: 28, startMonth: 2, endMonth: 2, customer: 'Anna Schmidt', reason: 'booking' },
    ],
    'VW Touareg': [
      { startDay: 5, endDay: 9, startMonth: 2, endMonth: 2, customer: 'Thomas Weber', reason: 'booking' },
    ],
    'Hyundai Tucson': [
      { startDay: 12, endDay: 16, startMonth: 2, endMonth: 2, customer: 'Lisa Becker', reason: 'booking' },
    ],
    'Tesla Model S': [],
    'BMW X5': [
      { startDay: 1, endDay: 5, startMonth: 2, endMonth: 2, customer: 'Maintenance', reason: 'maintenance' },
      { startDay: 20, endDay: 25, startMonth: 2, endMonth: 2, customer: 'Hanna Weber', reason: 'booking' },
    ],
    'Audi A6 Avant': [
      { startDay: 1, endDay: 8, startMonth: 2, endMonth: 2, customer: 'Maintenance', reason: 'maintenance' },
    ],
  };

  const getEditBlockedInfo = (vehicleName: string) => {
    const bookings = editVehicleBookings[vehicleName] || [];
    const info: Record<number, { customer: string; startDay: number; endDay: number; reason: 'booking' | 'maintenance' }> = {};
    bookings.forEach(b => {
      if (b.startMonth === editCalendarMonth || b.endMonth === editCalendarMonth) {
        for (let d = b.startDay; d <= b.endDay; d++) {
          info[d] = { customer: b.customer, startDay: b.startDay, endDay: b.endDay, reason: b.reason };
        }
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
    const updatedBooking = { ...booking, ...inlineEdit };
    setLocalEdits(prev => ({ ...prev, [booking.id]: inlineEdit }));
    onBookingUpdated?.(updatedBooking);
    toast.success('Buchung aktualisiert', {
      description: `${inlineEdit.vehicle || booking.vehicle} â€¢ ${inlineEdit.customer || booking.customer}`,
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
            isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'
          } ${isEditMode ? 'cursor-pointer ring-1 ring-transparent hover:ring-blue-500/40 group' : ''}`}
        >
          <Icon className={`w-5 h-5 ${iconColor || (isDarkMode ? 'text-gray-500' : 'text-gray-400')}`} />
          <div className="flex-1 min-w-0">
            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</div>
            <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
              {isEditMode ? (inlineEdit[fieldKey] || value) : value}
            </div>
          </div>
          {isEditMode && (
            <div className={`flex items-center gap-1 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>
              <Pencil className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          )}
        </div>
        {isOpen && (
          <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
            isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'
          }`}>
            <div className="max-h-48 overflow-y-auto py-1">
              {options.map(opt => (
                <button
                  key={opt}
                  onClick={() => { setInlineEdit(prev => ({ ...prev, [fieldKey]: opt })); setActiveDropdown(null); }}
                  className={`w-full text-left px-3 py-2.5 text-xs transition-colors ${
                    (inlineEdit[fieldKey] || value) === opt
                      ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                      : isDarkMode ? 'text-gray-300 hover:bg-neutral-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {renderOption ? renderOption(opt) : opt}
                  {(inlineEdit[fieldKey] || value) === opt && <CheckCircle className="w-3.5 h-3.5 inline ml-2" />}
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
      isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'
    } ${isEditMode ? 'ring-1 ring-transparent hover:ring-blue-500/40 group' : ''}`}>
      <Icon className={`w-5 h-5 ${iconColor || (isDarkMode ? 'text-gray-500' : 'text-gray-400')}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</div>
        {isEditMode ? (
          <input
            type={type}
            value={inlineEdit[fieldKey] ?? value}
            onChange={(e) => setInlineEdit(prev => ({ ...prev, [fieldKey]: e.target.value }))}
            className={`w-full text-xs font-semibold bg-transparent outline-none border-b transition-colors ${
              isDarkMode ? 'text-white border-neutral-600 focus:border-blue-500' : 'text-gray-900 border-gray-300 focus:border-blue-500'
            }`}
          />
        ) : (
          <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{value}</div>
        )}
      </div>
      {isEditMode && !isEditMode ? null : isEditMode && (
        <Pencil className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
      )}
    </div>
  );

  useEffect(() => {
    if (popupBookingId) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPopupAnimating(true));
      });
    } else {
      setPopupAnimating(false);
      setPopupClosing(false);
    }
  }, [popupBookingId]);

  const handleClosePopup = () => {
    setPopupClosing(true);
    setPopupAnimating(false);
    setTimeout(() => {
      setPopupBookingId(null);
      setSelectedBookingId(null);
      setPopupClosing(false);
      setPopupFullView(false);
    }, 300);
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

  const saveEdit = () => {
    if (!editingBooking) return;
    const updatedBooking = { ...editingBooking, ...editForm };
    // Save locally
    setLocalEdits(prev => ({ ...prev, [editingBooking.id]: editForm }));
    // Notify parent if it's an additional booking
    onBookingUpdated?.(updatedBooking);
    toast.success('Buchung aktualisiert', {
      description: `${editForm.vehicle || editingBooking.vehicle} â€¢ ${editForm.customer || editingBooking.customer}`,
      duration: 3000,
    });
    setEditingBooking(null);
  };

  const confirmCancel = (bookingId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCancelConfirmId(bookingId);
  };

  const executeCancel = () => {
    if (!cancelConfirmId) return;
    setLocalCancelled(prev => [...prev, cancelConfirmId]);
    const allBk = [...activeBookings, ...upcomingBookings, ...completedBookings];
    const booking = allBk.find(b => b.id === cancelConfirmId);
    onBookingCancelled?.(cancelConfirmId);
    toast.success('Buchung storniert', {
      description: booking ? `${booking.vehicle} â€¢ ${booking.customer}` : undefined,
      duration: 3000,
    });
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

  // Merge additional bookings (created via NewBookingView) into correct category for current month
  const monthNamesShortEN_lookup = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const additionalForMonth = additionalBookings.filter(b => {
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

  // KPI data derived from bookings
  const kpis = [
    { label: 'Active Bookings', value: String(activeBookings.length), icon: Zap, color: 'blue', change: 'Currently running', tab: 'active' as const },
    { label: 'Upcoming', value: String(upcomingBookings.length), icon: Clock, color: 'purple', change: 'Scheduled', tab: 'upcoming' as const },
    { label: 'Completed', value: String(completedBookings.length), icon: CheckCircle, color: 'green', change: `${monthNamesDE[displayMonth]}`, tab: 'completed' as const },
  ];

  // Calendar logic
  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(displayYear, displayMonth, 1).getDay();
  
  // Helper function to parse date string and extract day
  const parseDateDay = (dateStr: string): number | null => {
    const match = dateStr.match(/(\d+)\s+\w+\s+\d+/);
    return match ? parseInt(match[1], 10) : null;
  };

  // Helper function to get all days in a booking range
  const getBookingDays = (startDate: string, endDate: string): number[] => {
    const startDay = parseDateDay(startDate);
    const endDay = parseDateDay(endDate);
    if (!startDay || !endDay) return [];
    
    const days = [];
    for (let day = startDay; day <= endDay; day++) {
      days.push(day);
    }
    return days;
  };

  // Get all bookings with their day ranges
  const allBookingsWithDays = [...activeBookings, ...upcomingBookings, ...completedBookings].map(booking => ({
    ...booking,
    days: getBookingDays(booking.startDate, booking.endDate)
  }));

  // Check if a day has any bookings
  const getDayBookings = (day: number) => {
    return allBookingsWithDays.filter(booking => booking.days.includes(day));
  };

  // Check if a day is part of the hovered booking
  const isDayInHoveredBooking = (day: number): boolean => {
    if (!hoveredBookingId) return false;
    const hovered = allBookingsWithDays.find(b => b.id === hoveredBookingId);
    return hovered ? hovered.days.includes(day) : false;
  };

  // Get the hovered booking's status color
  const getHoveredBookingColor = (): 'blue' | 'purple' | 'green' => {
    if (!hoveredBookingId) return 'blue';
    const hovered = allBookingsWithDays.find(b => b.id === hoveredBookingId);
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
    const source = tab === 'active' ? activeBookings : tab === 'upcoming' ? upcomingBookings : completedBookings;
    return source.filter(b => {
      if (!matchesSearch(b)) return false;
      if (selectedDate === null) return true;
      const bWithDays = allBookingsWithDays.find(ab => ab.id === b.id);
      return bWithDays ? bWithDays.days.includes(selectedDate) : false;
    });
  };

  // When activeTab is null, show all bookings combined
  const getAllFilteredBookings = () => {
    const all = [...activeBookings, ...upcomingBookings, ...completedBookings];
    return all.filter(b => {
      if (!matchesSearch(b)) return false;
      if (selectedDate === null) return true;
      const bWithDays = allBookingsWithDays.find(ab => ab.id === b.id);
      return bWithDays ? bWithDays.days.includes(selectedDate) : false;
    });
  };

  const filteredBookings = activeTab !== null ? getFilteredBookings(activeTab) : getAllFilteredBookings();

  // Counts for day-filtered tabs (respects search + date)
  const dayFilteredCounts = {
    active: getFilteredBookings('active').length,
    upcoming: getFilteredBookings('upcoming').length,
    completed: getFilteredBookings('completed').length,
  };
  
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
              isDarkMode
                ? 'hover:bg-neutral-800 text-gray-400 hover:text-white'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
            }`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              isDarkMode ? 'bg-neutral-800' : 'bg-gray-100/80'
            }`}>
              <Hash className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
              <span className={`text-xs font-mono font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {detailBooking.bookingRef}
              </span>
            </div>
            <h1 className={`text-lg font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Booking Details
            </h1>
            <span className={`text-xs px-3 py-1.5 rounded-full font-semibold flex items-center gap-1.5 ${
              detailStatusColor === 'blue' ? (isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700') :
              detailStatusColor === 'purple' ? (detailBooking.status === 'pending' ? (isDarkMode ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700') : (isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700')) :
              (isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700')
            }`}>
              {detailBooking.status === 'active' && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>}
              {detailBooking.status === 'completed' && <CheckCircle className="w-5 h-5" />}
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
                isDarkMode ? 'bg-blue-900/15 border-blue-700/30' : 'bg-blue-50/60 border-blue-200/60'
              }`}>
                <div className="flex items-center gap-3">
                  <Pencil className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                  <span className={`text-xs font-semibold ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                    Bearbeitungsmodus aktiv â€â€ÂÂÂ Klicke auf ein Feld zum Ändern
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={cancelEditMode}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-200 ${
                      isDarkMode
                        ? 'bg-neutral-800 text-gray-300 hover:bg-neutral-700 border border-neutral-700'
                        : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                    Abbrechen
                  </button>
                  <button
                    onClick={() => saveInlineEdit(detailBooking)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-blue-600 text-white hover:bg-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Änderungen speichern
                  </button>
                </div>
              </div>
            </div>
          ) : (detailBooking.status === 'confirmed' || detailBooking.status === 'pending') ? (
            <div className="col-span-12">
              <div className={`flex items-center justify-between px-3 py-3 rounded-lg border ${
                isDarkMode ? 'bg-purple-900/15 border-purple-700/30' : 'bg-purple-50/60 border-purple-200/60'
              }`}>
                <div className="flex items-center gap-3">
                  <Info className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                  <span className={`text-xs ${isDarkMode ? 'text-purple-300' : 'text-purple-700'}`}>
                    Diese Buchung ist noch bevorstehend und kann bearbeitet oder storniert werden.
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => enterEditMode(detailBooking)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-200 ${
                      isDarkMode
                        ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 border border-blue-500/30'
                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Bearbeiten
                  </button>
                  <button
                    onClick={(e) => confirmCancel(detailBooking.id, e)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-200 ${
                      isDarkMode
                        ? 'bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-500/30'
                        : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Stornieren
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="col-span-12">
              <div className={`flex items-center justify-end px-3 py-2 rounded-lg border ${
                isDarkMode ? 'bg-neutral-900/30 border-neutral-700/30' : 'bg-white/30 border-gray-200/30'
              }`}>
                <button
                  onClick={() => enterEditMode(detailBooking)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all duration-200 ${
                    isDarkMode
                      ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 border border-blue-500/30'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                  }`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Bearbeiten
                </button>
              </div>
            </div>
          )}

          {/* Left Column - Vehicle & Revenue */}
          <div className="col-span-1 lg:col-span-8 space-y-5">
            {/* Vehicle Card */}
            <div className={`rounded-lg p-8 border shadow-sm ${
              isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
            }`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${
                  detailStatusColor === 'blue' ? (isDarkMode ? 'bg-blue-900/50' : 'bg-blue-100') :
                  detailStatusColor === 'purple' ? (isDarkMode ? 'bg-purple-900/50' : 'bg-purple-100') :
                  (isDarkMode ? 'bg-green-900/50' : 'bg-green-100')
                }`}>
                  <Car className={`w-5 h-5 ${
                    detailStatusColor === 'blue' ? (isDarkMode ? 'text-blue-400' : 'text-blue-600') :
                    detailStatusColor === 'purple' ? (isDarkMode ? 'text-purple-400' : 'text-purple-600') :
                    (isDarkMode ? 'text-green-400' : 'text-green-600')
                  }`} />
                </div>
                <div className="flex-1 relative">
                  {isEditMode ? (
                    <div className="relative" ref={activeDropdown === 'vehicle' ? dropdownRef : undefined}>
                      <button
                        onClick={() => setActiveDropdown(activeDropdown === 'vehicle' ? null : 'vehicle')}
                        className={`flex items-center gap-2 group cursor-pointer`}
                      >
                        <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {inlineEdit.vehicle || detailBooking.vehicle}
                        </h2>
                        <Pencil className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                        <ChevronDown className={`w-5 h-5 transition-transform ${isDarkMode ? 'text-blue-400' : 'text-blue-500'} ${activeDropdown === 'vehicle' ? 'rotate-180' : ''}`} />
                      </button>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {inlineEdit.plate || detailBooking.plate}
                      </div>
                      {activeDropdown === 'vehicle' && (
                        <div className={`absolute z-50 mt-2 w-72 rounded-lg border shadow-xl overflow-hidden ${
                          isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'
                        }`}>
                          <div className="max-h-64 overflow-y-auto py-1">
                            {vehicleOptions.map(v => (
                              <button
                                key={v.plate}
                                onClick={() => {
                                  setInlineEdit(prev => ({ ...prev, vehicle: v.name, plate: v.plate }));
                                  setActiveDropdown(null);
                                }}
                                className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                                  (inlineEdit.vehicle || detailBooking.vehicle) === v.name
                                    ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                                    : isDarkMode ? 'text-gray-300 hover:bg-neutral-700' : 'text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                <Car className="w-5 h-5 shrink-0" />
                                <div>
                                  <div className="text-xs font-semibold">{v.name}</div>
                                  <div className={`text-xs font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{v.plate}</div>
                                </div>
                                {(inlineEdit.vehicle || detailBooking.vehicle) === v.name && <CheckCircle className="w-5 h-5 ml-auto shrink-0" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {detailBooking.vehicle}
                      </h2>
                      <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {detailBooking.plate}
                      </div>
                    </>
                  )}
                  {!isEditMode && (
                    <button
                      onClick={() => onNavigateToVehicle?.(detailBooking.vehicle)}
                      className={`mt-2 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        isDarkMode
                          ? 'bg-blue-900/40 text-blue-400 border border-blue-700/50 hover:bg-blue-900/60 hover:border-blue-600/60'
                          : 'bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 hover:border-blue-300'
                      }`}
                    >
                      <Radio className="w-3.5 h-3.5" />
                      Live Tracking
                    </button>
                  )}
                </div>
                <div className="text-right">
                  {(() => {
                    const bruttoVal = parseFloat((detailBooking.revenue || 'â‚¬0').replace('â‚¬', '').replace(',', '.')) || 0;
                    const nettoVal = Math.round((bruttoVal / 1.19) * 100) / 100;
                    const taxVal = Math.round((bruttoVal - nettoVal) * 100) / 100;
                    return (
                      <>
                        <div className={`text-xs font-bold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                          â‚¬{bruttoVal.toFixed(2)}
                        </div>
                        <div className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Brutto</div>
                        <div className={`mt-1.5 flex items-center justify-end gap-3`}>
                          <div className="text-right">
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>â‚¬{nettoVal.toFixed(2)}</div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>Netto</div>
                          </div>
                          <div className={`w-px h-6 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                          <div className="text-right">
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>â‚¬{taxVal.toFixed(2)}</div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>19% MwSt.</div>
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
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'} ${isEditMode ? 'cursor-pointer ring-1 ring-transparent hover:ring-blue-500/40 group' : ''} ${
                    isEditMode && editCalendarOpen && editCalendarMode === 'pickup' ? (isDarkMode ? '!ring-blue-500/60' : '!ring-blue-400/60') : ''
                  }`}
                >
                  <Calendar className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                  <div className="flex-1">
                    <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Abholdatum & Uhrzeit</div>
                    <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {isEditMode ? (inlineEdit.startDate || detailBooking.startDate || 'Datum wählen') : detailBooking.startDate}
                    </div>
                    {isEditMode ? (
                      <input
                        type="time"
                        value={inlineEdit.startTime ?? detailBooking.startTime}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setInlineEdit(prev => ({ ...prev, startTime: e.target.value }))}
                        className={`w-full text-xs font-mono bg-transparent outline-none mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
                      />
                    ) : (
                      <div className={`text-xs font-mono ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{detailBooking.startTime} Uhr</div>
                    )}
                  </div>
                  {isEditMode && <Pencil className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />}
                </div>
                {/* Rückgabedatum & Uhrzeit */}
                <div
                  onClick={() => isEditMode && openEditCalendar('return')}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'} ${isEditMode ? 'cursor-pointer ring-1 ring-transparent hover:ring-blue-500/40 group' : ''} ${
                    isEditMode && editCalendarOpen && editCalendarMode === 'return' ? (isDarkMode ? '!ring-green-500/60' : '!ring-green-400/60') : ''
                  }`}
                >
                  <Calendar className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-500'}`} />
                  <div className="flex-1">
                    <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Rückgabedatum & Uhrzeit</div>
                    <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {isEditMode ? (inlineEdit.endDate || detailBooking.endDate || 'Datum wählen') : detailBooking.endDate}
                    </div>
                    {isEditMode ? (
                      <input
                        type="time"
                        value={inlineEdit.endTime ?? detailBooking.endTime}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setInlineEdit(prev => ({ ...prev, endTime: e.target.value }))}
                        className={`w-full text-xs font-mono bg-transparent outline-none mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
                      />
                    ) : (
                      <div className={`text-xs font-mono ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{detailBooking.endTime} Uhr</div>
                    )}
                  </div>
                  {isEditMode && <Pencil className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />}
                </div>
                {/* Mietdauer */}
                <div className={`flex items-center gap-3 px-3 py-3 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                  <Clock className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                  <div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Mietdauer</div>
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
                      if (!sDate || !eDate) return <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>â€â€ÂÂÂ</div>;
                      const start = parseDateLocal(sDate);
                      const end = parseDateLocal(eDate);
                      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
                      return (
                        <>
                          <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{days} {days === 1 ? 'Tag' : 'Tage'}</div>
                          <div className={`text-xs font-mono ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{days * 24}h gesamt</div>
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
                    isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200/60'
                  }`}>
                    {/* Selection mode toggle */}
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => setEditCalendarMode('pickup')}
                        className={`flex-1 px-3 py-2.5 rounded-lg text-xs text-center transition-all ${
                          editCalendarMode === 'pickup'
                            ? isDarkMode ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40' : 'bg-blue-50 text-blue-600 border border-blue-200'
                            : isDarkMode ? 'bg-neutral-800 text-gray-400 border border-neutral-700/40' : 'bg-gray-50/60 text-gray-500 border border-gray-200/40'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5 mx-auto mb-1" />
                        Abholdatum wählen
                      </button>
                      <button
                        onClick={() => setEditCalendarMode('return')}
                        className={`flex-1 px-3 py-2.5 rounded-lg text-xs text-center transition-all ${
                          editCalendarMode === 'return'
                            ? isDarkMode ? 'bg-green-600/20 text-green-400 border border-green-500/40' : 'bg-green-50 text-green-600 border border-green-200'
                            : isDarkMode ? 'bg-neutral-800 text-gray-400 border border-neutral-700/40' : 'bg-gray-50/60 text-gray-500 border border-gray-200/40'
                        }`}
                      >
                        <Calendar className="w-3.5 h-3.5 mx-auto mb-1" />
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
                        className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <span className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {editCalMonthNames[editCalendarMonth]} {editCalendarYear}
                      </span>
                      <button
                        onClick={() => {
                          if (editCalendarMonth === 11) { setEditCalendarMonth(0); setEditCalendarYear(y => y + 1); }
                          else setEditCalendarMonth(m => m + 1);
                        }}
                        className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Calendar grid */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                        <div key={d} className={`text-xs py-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{d}</div>
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
                                        ? isDarkMode ? 'bg-amber-900/20 text-amber-500/60' : 'bg-amber-50 text-amber-400'
                                        : isDarkMode ? 'bg-red-900/20 text-red-400/60' : 'bg-red-50 text-red-400'
                                    }`
                                  : editCalIsStartDay(day)
                                  ? 'bg-blue-600 text-white cursor-pointer hover:bg-blue-700 shadow-sm'
                                  : editCalIsEndDay(day)
                                  ? 'bg-green-600 text-white cursor-pointer hover:bg-green-700 shadow-sm'
                                  : editCalIsInRange(day)
                                  ? `cursor-pointer ${isDarkMode ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`
                                  : `cursor-pointer ${isDarkMode ? 'text-gray-300 hover:bg-neutral-700' : 'text-gray-700 hover:bg-gray-100'}`
                              }`}
                            >
                              {day || ''}
                            </button>
                            {/* Hover tooltip for blocked days */}
                            {editHoveredDay === day && day && blockInfo && (
                              <div className={`absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 rounded-lg border shadow-lg ${
                                isDarkMode ? 'bg-neutral-900/95 border-neutral-700/60 text-white' : 'bg-white/95 border-gray-200/60 text-gray-900'
                              }`}>
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  {blockInfo.reason === 'maintenance' ? (
                                    <Clock className={`w-3 h-3 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} />
                                  ) : (
                                    <Car className={`w-3 h-3 ${isDarkMode ? 'text-red-400' : 'text-red-500'}`} />
                                  )}
                                  <span className={`text-xs ${
                                    blockInfo.reason === 'maintenance'
                                      ? isDarkMode ? 'text-amber-400' : 'text-amber-600'
                                      : isDarkMode ? 'text-red-400' : 'text-red-600'
                                  }`}>
                                    {blockInfo.reason === 'maintenance' ? 'Wartung' : 'Vermietet'}
                                  </span>
                                </div>
                                <div className={`text-xs mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                  <span className="flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {blockInfo.startDay}. â€“ {blockInfo.endDay}. {editCalMonthNames[editCalendarMonth]}
                                  </span>
                                </div>
                                {blockInfo.reason !== 'maintenance' && (
                                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <span className="flex items-center gap-1">
                                      <User className="w-3 h-3" />
                                      {blockInfo.customer}
                                    </span>
                                  </div>
                                )}
                                <div className={`absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 -mt-1 border-r border-b ${
                                  isDarkMode ? 'bg-neutral-900/95 border-neutral-700/60' : 'bg-white/95 border-gray-200/60'
                                }`}></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Legend */}
                    <div className={`flex items-center gap-3 mt-3 pt-3 border-t ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-200/40'}`}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-blue-600"></div>
                        <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Abholung</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-green-600"></div>
                        <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Rückgabe</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded ${isDarkMode ? 'bg-blue-600/20' : 'bg-blue-100'}`}></div>
                        <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Zeitraum</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded ${isDarkMode ? 'bg-red-900/40' : 'bg-red-50'}`}></div>
                        <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Gebucht</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-3 h-3 rounded ${isDarkMode ? 'bg-amber-900/40' : 'bg-amber-50'}`}></div>
                        <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Wartung</span>
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
                  iconColor={isDarkMode ? 'text-blue-400' : 'text-blue-500'}
                />
                <EditableDropdown
                  fieldKey="returnLocation"
                  icon={MapPin}
                  label="Rückgabeort"
                  value={detailBooking.returnLocation}
                  options={locationOptions}
                  iconColor={isDarkMode ? 'text-green-400' : 'text-green-500'}
                />
                {/* Kilometer frei â€â€ÂÂÂ editable via km package */}
                <div className="relative" ref={activeDropdown === 'includedKm' ? dropdownRef : undefined}>
                  <div
                    onClick={() => isEditMode && setActiveDropdown(activeDropdown === 'includedKm' ? null : 'includedKm')}
                    className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 ${
                      isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'
                    } ${isEditMode ? 'cursor-pointer ring-1 ring-transparent hover:ring-blue-500/40 group' : ''}`}
                  >
                    <ArrowUpDown className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                    <div className="flex-1">
                      <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Kilometer frei</div>
                      <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {(() => {
                          const km = isEditMode ? (inlineEdit.includedKm ?? detailBooking.includedKm) : detailBooking.includedKm;
                          return km != null ? `${km.toLocaleString('de-DE')} km` : 'â€â€ÂÂÂ';
                        })()}
                      </div>
                    </div>
                    {isEditMode && (
                      <div className={`flex items-center gap-1 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>
                        <Pencil className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <ChevronDown className={`w-5 h-5 transition-transform ${activeDropdown === 'includedKm' ? 'rotate-180' : ''}`} />
                      </div>
                    )}
                  </div>
                  {activeDropdown === 'includedKm' && (
                    <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
                      isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'
                    }`}>
                      <div className="py-1">
                        {kmPackageOptions.map(pkg => (
                          <button
                            key={pkg.km}
                            onClick={() => { setInlineEdit(prev => ({ ...prev, includedKm: pkg.km })); setActiveDropdown(null); }}
                            className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between transition-colors ${
                              (inlineEdit.includedKm ?? detailBooking.includedKm) === pkg.km
                                ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                                : isDarkMode ? 'text-gray-300 hover:bg-neutral-700' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span>{pkg.label} â€â€ÂÂÂ {pkg.km.toLocaleString('de-DE')} km</span>
                            {(inlineEdit.includedKm ?? detailBooking.includedKm) === pkg.km && <CheckCircle className="w-3.5 h-3.5" />}
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
              isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
            }`}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Pickup durch */}
                <div className="relative" ref={activeDropdown === 'pickupHandoverByBox' ? dropdownRef : undefined}>
                  <div
                    onClick={() => isEditMode && setActiveDropdown(activeDropdown === 'pickupHandoverByBox' ? null : 'pickupHandoverByBox')}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'} ${isEditMode ? 'cursor-pointer ring-1 ring-transparent hover:ring-blue-500/40 group' : ''}`}
                  >
                    <Users className={`w-5 h-5 shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs leading-tight whitespace-nowrap ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Pickup durch</div>
                      <div className={`text-xs font-semibold truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {isEditMode ? (inlineEdit.pickupHandoverBy || detailBooking.pickupHandoverBy || 'â€â€ÂÂÂ') : (detailBooking.pickupHandoverBy || 'â€â€ÂÂÂ')}
                      </div>
                    </div>
                    {isEditMode && <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isDarkMode ? 'text-blue-400' : 'text-blue-500'} ${activeDropdown === 'pickupHandoverByBox' ? 'rotate-180' : ''}`} />}
                  </div>
                  {activeDropdown === 'pickupHandoverByBox' && (
                    <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
                      isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'
                    }`}>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {['â€â€ÂÂÂ', ...employeeOptions].map(opt => (
                          <button
                            key={opt}
                            onClick={() => { setInlineEdit(prev => ({ ...prev, pickupHandoverBy: opt === 'â€â€ÂÂÂ' ? '' : opt })); setActiveDropdown(null); }}
                            className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between transition-colors ${
                              (inlineEdit.pickupHandoverBy ?? detailBooking.pickupHandoverBy ?? '') === (opt === 'â€â€ÂÂÂ' ? '' : opt)
                                ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                                : isDarkMode ? 'text-gray-300 hover:bg-neutral-700' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span>{opt}</span>
                            {(inlineEdit.pickupHandoverBy ?? detailBooking.pickupHandoverBy ?? '') === (opt === 'â€â€ÂÂÂ' ? '' : opt) && <CheckCircle className="w-3.5 h-3.5" />}
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
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'} ${isEditMode ? 'cursor-pointer ring-1 ring-transparent hover:ring-blue-500/40 group' : ''}`}
                  >
                    <Users className={`w-5 h-5 shrink-0 ${isDarkMode ? 'text-green-400' : 'text-green-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs leading-tight whitespace-nowrap ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Rückgabe durch</div>
                      <div className={`text-xs font-semibold truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                        {isEditMode ? (inlineEdit.returnHandoverBy || detailBooking.returnHandoverBy || 'â€â€ÂÂÂ') : (detailBooking.returnHandoverBy || 'â€â€ÂÂÂ')}
                      </div>
                    </div>
                    {isEditMode && <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isDarkMode ? 'text-green-400' : 'text-green-500'} ${activeDropdown === 'returnHandoverByBox' ? 'rotate-180' : ''}`} />}
                  </div>
                  {activeDropdown === 'returnHandoverByBox' && (
                    <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
                      isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'
                    }`}>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {['â€â€ÂÂÂ', ...employeeOptions].map(opt => (
                          <button
                            key={opt}
                            onClick={() => { setInlineEdit(prev => ({ ...prev, returnHandoverBy: opt === 'â€â€ÂÂÂ' ? '' : opt })); setActiveDropdown(null); }}
                            className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between transition-colors ${
                              (inlineEdit.returnHandoverBy ?? detailBooking.returnHandoverBy ?? '') === (opt === 'â€â€ÂÂÂ' ? '' : opt)
                                ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                                : isDarkMode ? 'text-gray-300 hover:bg-neutral-700' : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span>{opt}</span>
                            {(inlineEdit.returnHandoverBy ?? detailBooking.returnHandoverBy ?? '') === (opt === 'â€â€ÂÂÂ' ? '' : opt) && <CheckCircle className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* KM Übergabe */}
                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 ${
                  detailBooking.pickupHandoverBy
                    ? isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'
                    : isDarkMode ? 'bg-neutral-800/30 opacity-60' : 'bg-gray-50/40 opacity-60'
                }`}>
                  <Car className={`w-5 h-5 shrink-0 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs leading-tight whitespace-nowrap ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>KM Übergabe</div>
                    <div className={`text-xs font-semibold truncate ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {detailBooking.pickupHandoverBy
                        ? detailBooking.mileageStart != null ? `${detailBooking.mileageStart.toLocaleString('de-DE')} km` : 'â€â€ÂÂÂ'
                        : 'Bei Pickup'}
                    </div>
                  </div>
                </div>

                {/* KM gefahren */}
                <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 ${
                  detailBooking.drivenKm != null && detailBooking.includedKm != null && detailBooking.drivenKm > detailBooking.includedKm
                    ? isDarkMode ? 'bg-red-900/20 border border-red-800/30' : 'bg-red-50/80 border border-red-200'
                    : isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'
                }`}>
                  <Gauge className={`w-5 h-5 shrink-0 ${
                    detailBooking.drivenKm != null && detailBooking.includedKm != null && detailBooking.drivenKm > detailBooking.includedKm
                      ? isDarkMode ? 'text-red-400' : 'text-red-500'
                      : isDarkMode ? 'text-amber-400' : 'text-amber-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs leading-tight whitespace-nowrap ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>KM gefahren</div>
                    <div className={`text-xs font-semibold truncate ${
                      detailBooking.drivenKm != null && detailBooking.includedKm != null && detailBooking.drivenKm > detailBooking.includedKm
                        ? isDarkMode ? 'text-red-400' : 'text-red-600'
                        : isDarkMode ? 'text-gray-200' : 'text-gray-800'
                    }`}>
                      {detailBooking.drivenKm != null ? `${detailBooking.drivenKm.toLocaleString('de-DE')} km` : 'â€â€ÂÂÂ'}
                      {detailBooking.drivenKm != null && detailBooking.includedKm != null && detailBooking.drivenKm > detailBooking.includedKm && (
                        <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${isDarkMode ? 'bg-red-900/40 text-red-400' : 'bg-red-100 text-red-600'}`}>
                          +{(detailBooking.drivenKm - detailBooking.includedKm).toLocaleString('de-DE')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Packages & Extras + Buchungsdetails â€â€ÂÂÂ Two Boxes Side by Side */}
            <div className="grid grid-cols-2 gap-3">
              {/* Box 1: Pakete & Extras */}
              <div className={`rounded-lg p-8 border shadow-sm ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Pakete & Extras
                </div>

                {/* Kilometerpaket */}
                <div className="mb-3">
                  <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                    Kilometerpaket
                  </div>
                  <div className="relative" ref={activeDropdown === 'kmPackage' ? dropdownRef : undefined}>
                    <div
                      onClick={() => isEditMode && setActiveDropdown(activeDropdown === 'kmPackage' ? null : 'kmPackage')}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg border transition-all duration-200 ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700/40' : 'bg-gray-50/80 border-gray-100'} ${isEditMode ? 'cursor-pointer hover:border-blue-500/40 group' : ''}`}
                    >
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-purple-900/40' : 'bg-purple-50'}`}>
                        <Gauge className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
                      </div>
                      <div className="flex-1">
                        {(() => {
                          const km = isEditMode ? (inlineEdit.includedKm ?? detailBooking.includedKm) : detailBooking.includedKm;
                          return (
                            <>
                              <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                {km != null ? (
                                  km >= 2000 ? 'Unlimited' :
                                  km >= 1500 ? 'Premium' :
                                  km >= 1000 ? 'Komfort' :
                                  km >= 750 ? 'Standard' : 'Basis'
                                ) : 'Standard'}
                              </div>
                              <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                {km != null ? `${km.toLocaleString('de-DE')} km inkl.` : 'â€â€ÂÂÂ'}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      {isEditMode ? (
                        <div className={`flex items-center gap-1 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>
                          <Pencil className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <ChevronDown className={`w-5 h-5 transition-transform ${activeDropdown === 'kmPackage' ? 'rotate-180' : ''}`} />
                        </div>
                      ) : (
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${isDarkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
                          Aktiv
                        </div>
                      )}
                    </div>
                    {activeDropdown === 'kmPackage' && (
                      <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
                        isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'
                      }`}>
                        <div className="py-1">
                          {kmPackageOptions.map(pkg => (
                            <button
                              key={pkg.km}
                              onClick={() => { setInlineEdit(prev => ({ ...prev, includedKm: pkg.km })); setActiveDropdown(null); }}
                              className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between transition-colors ${
                                (inlineEdit.includedKm ?? detailBooking.includedKm) === pkg.km
                                  ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                                  : isDarkMode ? 'text-gray-300 hover:bg-neutral-700' : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              <span>{pkg.label} â€â€ÂÂÂ {pkg.km.toLocaleString('de-DE')} km</span>
                              {(inlineEdit.includedKm ?? detailBooking.includedKm) === pkg.km && <CheckCircle className="w-3.5 h-3.5" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Versicherungspaket */}
                <div className="mb-3">
                  <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                    Versicherungspaket
                  </div>
                  <div className="relative" ref={activeDropdown === 'insurance' ? dropdownRef : undefined}>
                    <div
                      onClick={() => isEditMode && setActiveDropdown(activeDropdown === 'insurance' ? null : 'insurance')}
                      className={`flex items-center gap-3 px-3 py-3 rounded-lg border transition-all duration-200 ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700/40' : 'bg-gray-50/80 border-gray-100'} ${isEditMode ? 'cursor-pointer hover:border-blue-500/40 group' : ''}`}
                    >
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-blue-900/40' : 'bg-blue-50'}`}>
                        <Shield className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                      </div>
                      <div className="flex-1">
                        {(() => {
                          const ins = isEditMode ? (inlineEdit.insurance || detailBooking.insurance) : detailBooking.insurance;
                          return (
                            <>
                              <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{ins}</div>
                              <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                {ins === 'Premium Vollkasko' ? 'Keine SB â€¢ Glas â€¢ Reifen â€¢ Unterboden' :
                                 ins === 'Vollkasko' ? 'SB â‚¬500 â€¢ Glas inkl.' :
                                 ins === 'Teilkasko' ? 'SB â‚¬1.000 â€¢ Basis' : 'Gesetzlicher Standard'}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      {isEditMode ? (
                        <div className={`flex items-center gap-1 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>
                          <Pencil className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <ChevronDown className={`w-5 h-5 transition-transform ${activeDropdown === 'insurance' ? 'rotate-180' : ''}`} />
                        </div>
                      ) : (
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                          detailBooking.insurance === 'Premium Vollkasko'
                            ? isDarkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600'
                            : isDarkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {detailBooking.insurance === 'Premium Vollkasko' ? 'Premium' : 'Aktiv'}
                        </div>
                      )}
                    </div>
                    {activeDropdown === 'insurance' && (
                      <div className={`absolute z-50 mt-1 w-full rounded-lg border shadow-xl overflow-hidden ${
                        isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'
                      }`}>
                        <div className="py-1">
                          {insuranceOptions.map(opt => (
                            <button
                              key={opt}
                              onClick={() => { setInlineEdit(prev => ({ ...prev, insurance: opt })); setActiveDropdown(null); }}
                              className={`w-full text-left px-3 py-2.5 text-xs flex items-center justify-between transition-colors ${
                                (inlineEdit.insurance || detailBooking.insurance) === opt
                                  ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                                  : isDarkMode ? 'text-gray-300 hover:bg-neutral-700' : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              <div>
                                <div className="font-semibold">{opt}</div>
                                <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                  {opt === 'Premium Vollkasko' ? 'Keine SB â€¢ Glas â€¢ Reifen â€¢ Unterboden' :
                                   opt === 'Vollkasko' ? 'SB â‚¬500 â€¢ Glas inkl.' :
                                   opt === 'Teilkasko' ? 'SB â‚¬1.000 â€¢ Basis' : 'Gesetzlicher Standard'}
                                </div>
                              </div>
                              {(inlineEdit.insurance || detailBooking.insurance) === opt && <CheckCircle className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Extras */}
                <div>
                  <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
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
                            isDarkMode ? 'border-neutral-700 bg-neutral-800/20' : 'border-gray-200/80 bg-gray-50/30'
                          }`}>
                            <div className="text-center">
                              <Package className={`w-5 h-5 mx-auto mb-1.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                              <p className={`text-xs ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>Keine Extras gebucht</p>
                            </div>
                          </div>
                        );
                      }
                      return extrasFromNotes.map((extra, idx) => (
                        <div key={idx} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700/40' : 'bg-gray-50/80 border-gray-100'}`}>
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-green-900/40' : 'bg-green-50'}`}>
                            <extra.icon className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-500'}`} />
                          </div>
                          <div className="flex-1">
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{extra.label}</div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{extra.detail}</div>
                          </div>
                          <CheckCircle className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-500'}`} />
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>

              {/* Box 2: Buchungsdetails */}
              <div className={`rounded-lg p-8 border shadow-sm ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
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

            {/* Documents */}
            {(detailBooking.pickupProtocol || detailBooking.returnProtocol) && (
              <div className={`rounded-lg p-8 border shadow-sm ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Dokumente
                </div>

                {/* Übergabe Protokolle */}
                <div className="mb-3">
                  <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                    Übergabe Protokolle
                  </div>
                  <div className="space-y-2.5">
                    {detailBooking.pickupProtocol && (
                      <div className={`flex items-center justify-between px-3 py-3 rounded-lg border transition-all duration-200 ${
                        isDarkMode
                          ? 'bg-neutral-800/50 border-neutral-700/40 hover:border-blue-600/50 hover:bg-blue-900/20'
                          : 'bg-white border-gray-200/60 hover:border-blue-300 hover:bg-blue-50/50'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-blue-900/40' : 'bg-blue-100'}`}>
                            <ClipboardCheck className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                          </div>
                          <div>
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Pickup-Protokoll</div>
                            <div className={`text-xs font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{detailBooking.pickupProtocol}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button className={`p-2 rounded-lg transition-all duration-200 ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400 hover:text-blue-400' : 'hover:bg-gray-100 text-gray-500 hover:text-blue-600'}`} title="Ansehen"><Eye className="w-5 h-5" /></button>
                          <button className={`p-2 rounded-lg transition-all duration-200 ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400 hover:text-blue-400' : 'hover:bg-gray-100 text-gray-500 hover:text-blue-600'}`} title="Herunterladen"><Download className="w-5 h-5" /></button>
                        </div>
                      </div>
                    )}
                    {detailBooking.returnProtocol && (
                      <div className={`flex items-center justify-between px-3 py-3 rounded-lg border transition-all duration-200 ${
                        isDarkMode
                          ? 'bg-neutral-800/50 border-neutral-700/40 hover:border-green-600/50 hover:bg-green-900/20'
                          : 'bg-white border-gray-200/60 hover:border-green-300 hover:bg-green-50/50'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-green-900/40' : 'bg-green-100'}`}>
                            <ClipboardCheck className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                          </div>
                          <div>
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Return-Protokoll</div>
                            <div className={`text-xs font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{detailBooking.returnProtocol}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button className={`p-2 rounded-lg transition-all duration-200 ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400 hover:text-green-400' : 'hover:bg-gray-100 text-gray-500 hover:text-green-600'}`} title="Ansehen"><Eye className="w-5 h-5" /></button>
                          <button className={`p-2 rounded-lg transition-all duration-200 ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400 hover:text-green-400' : 'hover:bg-gray-100 text-gray-500 hover:text-green-600'}`} title="Herunterladen"><Download className="w-5 h-5" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Vertragsprotokolle */}
                <div className="mb-3">
                  <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                    Vertragsprotokolle
                  </div>
                  <div className="space-y-2.5">
                    <div className={`flex items-center justify-between px-3 py-3 rounded-lg border transition-all duration-200 ${
                      isDarkMode
                        ? 'bg-neutral-800/50 border-neutral-700/40 hover:border-purple-600/50 hover:bg-purple-900/20'
                        : 'bg-white border-gray-200/60 hover:border-purple-300 hover:bg-purple-50/50'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-purple-900/40' : 'bg-purple-100'}`}>
                          <FileText className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                        </div>
                        <div>
                          <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Mietvertrag</div>
                          <div className={`text-xs font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>MV-{(detailBooking.bookingRef || '').replace('BK-', '')}.pdf</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button className={`p-2 rounded-lg transition-all duration-200 ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400 hover:text-purple-400' : 'hover:bg-gray-100 text-gray-500 hover:text-purple-600'}`} title="Ansehen"><Eye className="w-5 h-5" /></button>
                        <button className={`p-2 rounded-lg transition-all duration-200 ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400 hover:text-purple-400' : 'hover:bg-gray-100 text-gray-500 hover:text-purple-600'}`} title="Herunterladen"><Download className="w-5 h-5" /></button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rechnungsdokumente */}
                <div>
                  <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                    Rechnungsdokumente
                  </div>
                  <div className="space-y-2.5">
                    <div className={`flex items-center justify-between px-3 py-3 rounded-lg border transition-all duration-200 ${
                      isDarkMode
                        ? 'bg-neutral-800/50 border-neutral-700/40 hover:border-amber-600/50 hover:bg-amber-900/20'
                        : 'bg-white border-gray-200/60 hover:border-amber-300 hover:bg-amber-50/50'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-amber-900/40' : 'bg-amber-100'}`}>
                          <Euro className={`w-5 h-5 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                        </div>
                        <div>
                          <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Rechnung</div>
                          <div className={`text-xs font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>RE-{(detailBooking.bookingRef || '').replace('BK-', '')}.pdf</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {detailBooking.status === 'completed' ? (
                          <>
                            <button className={`p-2 rounded-lg transition-all duration-200 ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400 hover:text-amber-400' : 'hover:bg-gray-100 text-gray-500 hover:text-amber-600'}`} title="Ansehen"><Eye className="w-5 h-5" /></button>
                            <button className={`p-2 rounded-lg transition-all duration-200 ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400 hover:text-amber-400' : 'hover:bg-gray-100 text-gray-500 hover:text-amber-600'}`} title="Herunterladen"><Download className="w-5 h-5" /></button>
                          </>
                        ) : (
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${isDarkMode ? 'bg-neutral-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>Ausstehend</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Upcoming: no documents yet placeholder */}
            {(detailBooking.status === 'confirmed' || detailBooking.status === 'pending') && !detailBooking.pickupProtocol && !detailBooking.returnProtocol && (
              <div className={`rounded-lg p-8 border shadow-sm ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Dokumente
                </div>
                <div className={`flex flex-col items-center justify-center py-8 rounded-lg border border-dashed ${
                  isDarkMode ? 'border-neutral-700/60 bg-neutral-800/20' : 'border-gray-200/80 bg-gray-50/30'
                }`}>
                  <FileText className={`w-5 h-5 mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Dokumente werden bei Fahrzeugübergabe erstellt
                  </p>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                    Mietvertrag, Übergabeprotokoll & Rechnung
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Customer Info & Notes */}
          <div className="col-span-1 lg:col-span-4 space-y-5">
            {/* Customer Card */}
            {(() => {
              const customerDetailMap: Record<string, { email: string; address: string; city: string; customerId: string; license: string; licenseExpiry: string; since: string; bookingsCount: number }> = {
                'Kunde A': { email: 'kundea@email.de', address: 'Wilhelmshöher Allee 89', city: '34117 Kassel', customerId: 'KD-2024-001', license: 'B, BE', licenseExpiry: '15.08.2029', since: 'Jan 2023', bookingsCount: 12 },
                'Kunde B': { email: 'kundeb@email.de', address: 'Friedrich-Ebert-Str. 42', city: '34119 Kassel', customerId: 'KD-2024-002', license: 'B', licenseExpiry: '03.11.2027', since: 'Mär 2024', bookingsCount: 5 },
                'Kunde C': { email: 'kundec@email.de', address: 'Königsplatz 15', city: '34117 Kassel', customerId: 'KD-2024-003', license: 'B, C1', licenseExpiry: '22.05.2030', since: 'Sep 2024', bookingsCount: 2 },
              };
              const currentCustomerName = isEditMode ? (inlineEdit.customer || detailBooking.customer) : detailBooking.customer;
              const cDetail = customerDetailMap[currentCustomerName] || customerDetailMap['Kunde A'];
              return (
            <div className={`rounded-lg p-8 border shadow-sm ${
              isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
            }`}>
              <div className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center justify-between ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Kunde
                {isEditMode && <Pencil className={`w-3.5 h-3.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />}
              </div>
              <div className="relative" ref={activeDropdown === 'customer' ? dropdownRef : undefined}>
                <div
                  onClick={() => isEditMode && setActiveDropdown(activeDropdown === 'customer' ? null : 'customer')}
                  className={`flex items-center gap-3 ${isEditMode ? 'cursor-pointer rounded-lg p-2 -m-2 transition-all hover:ring-1 hover:ring-blue-500/40 group' : ''}`}
                >
                  <div className={`w-14 h-14 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-gradient-to-br from-blue-500/20 to-indigo-500/20' : 'bg-gradient-to-br from-blue-50 to-indigo-50'}`}>
                    <User className={`w-7 h-7 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className={`text-xs font-bold truncate ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {currentCustomerName}
                      </div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono shrink-0 ${isDarkMode ? 'bg-neutral-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
                        {cDetail.customerId}
                      </span>
                    </div>
                    <div className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      Kunde seit {cDetail.since} Â· {cDetail.bookingsCount} Buchungen
                    </div>
                  </div>
                  {isEditMode && (
                    <ChevronDown className={`w-5 h-5 transition-transform shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'} ${activeDropdown === 'customer' ? 'rotate-180' : ''}`} />
                  )}
                </div>
                {activeDropdown === 'customer' && (
                  <div className={`absolute z-50 mt-2 w-full rounded-lg border shadow-xl overflow-hidden ${
                    isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'
                  }`}>
                    <div className="py-1">
                      {customerOptions.map(c => (
                        <button
                          key={c.name}
                          onClick={() => {
                            setInlineEdit(prev => ({ ...prev, customer: c.name, customerPhone: c.phone }));
                            setActiveDropdown(null);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                            currentCustomerName === c.name
                              ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                              : isDarkMode ? 'text-gray-300 hover:bg-neutral-700' : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-100'}`}>
                            <User className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold">{c.name}</div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{c.phone}</div>
                          </div>
                          {currentCustomerName === c.name && <CheckCircle className="w-5 h-5 ml-auto shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Detail Grid */}
              <div className={`mt-5 pt-5 border-t grid grid-cols-2 gap-x-6 gap-y-4 ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-200'}`}>
                <div className="flex items-start gap-2.5">
                  <Phone className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                  <div>
                    <div className={`text-xs uppercase tracking-wider mb-0.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>Telefon</div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {isEditMode ? (inlineEdit.customerPhone || detailBooking.customerPhone || 'â€â€ÂÂÂ') : (detailBooking.customerPhone || 'â€â€ÂÂÂ')}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <Mail className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                  <div>
                    <div className={`text-xs uppercase tracking-wider mb-0.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>E-Mail</div>
                    <div className={`text-xs truncate ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{cDetail.email}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <MapPin className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                  <div>
                    <div className={`text-xs uppercase tracking-wider mb-0.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>Adresse</div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{cDetail.address}</div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{cDetail.city}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <IdCard className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                  <div>
                    <div className={`text-xs uppercase tracking-wider mb-0.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>Führerschein</div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Klasse {cDetail.license}</div>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>gültig bis {cDetail.licenseExpiry}</div>
                  </div>
                </div>
              </div>
            </div>
              );
            })()}

            {/* Booking Summary Card for upcoming */}
            {(detailBooking.status === 'confirmed' || detailBooking.status === 'pending') && (
              <div className={`rounded-lg p-8 border shadow-sm ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Buchungsübersicht
                </div>
                <div className="space-y-3">
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Status</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      detailBooking.status === 'pending'
                        ? (isDarkMode ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700')
                        : (isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700')
                    }`}>
                      {detailBooking.status === 'pending' ? 'Ausstehend' : 'Bestätigt'}
                    </span>
                  </div>
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Versicherung</span>
                    <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{detailBooking.insurance || 'â€â€ÂÂÂ'}</span>
                  </div>
                  <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Zahlungsart</span>
                    <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{detailBooking.paymentMethod || 'â€â€ÂÂÂ'}</span>
                  </div>
                  {detailBooking.includedKm != null && (
                    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Freikilometer</span>
                      <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{detailBooking.includedKm.toLocaleString('de-DE')} km</span>
                    </div>
                  )}
                  <div className={`px-3 py-2 rounded-lg border ${
                    isDarkMode ? 'bg-green-900/15 border-green-700/30' : 'bg-green-50/60 border-green-200/60'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>Gesamtbetrag</span>
                      <span className={`text-xs font-bold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>{detailBooking.revenue}</span>
                    </div>
                    {(() => {
                      const bruttoVal = parseFloat((detailBooking.revenue || 'â‚¬0').replace('â‚¬', '').replace(',', '.')) || 0;
                      const nettoVal = Math.round((bruttoVal / 1.19) * 100) / 100;
                      const taxVal = Math.round((bruttoVal - nettoVal) * 100) / 100;
                      return (
                        <div className={`flex items-center justify-end gap-3 pt-2 border-t ${isDarkMode ? 'border-green-700/20' : 'border-green-200/60'}`}>
                          <div className="text-right">
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Netto</div>
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>â‚¬{nettoVal.toFixed(2)}</div>
                          </div>
                          <div className={`w-px h-6 ${isDarkMode ? 'bg-green-700/30' : 'bg-green-200/80'}`} />
                          <div className="text-right">
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>19% MwSt.</div>
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>â‚¬{taxVal.toFixed(2)}</div>
                          </div>
                          <div className={`w-px h-6 ${isDarkMode ? 'bg-green-700/30' : 'bg-green-200/80'}`} />
                          <div className="text-right">
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Brutto</div>
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>â‚¬{bruttoVal.toFixed(2)}</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Driving Behavior */}
            {(detailBooking.drivingStyleScore != null || detailBooking.drivingScore != null || detailBooking.safetyScore != null) && detailBooking.drivingBehavior && detailBooking.abuseDetection && (() => {
              const styleScore = detailBooking.drivingStyleScore ?? detailBooking.drivingScore ?? null;
              const safetyScore = detailBooking.safetyScore ?? null;
              const score = styleScore ?? 0;
              const getScoreColor = (s: number) => {
                if (s >= 80) return { stroke: '#22c55e', bg: isDarkMode ? 'bg-green-900/30' : 'bg-green-50', text: isDarkMode ? 'text-green-400' : 'text-green-600', label: 'Good', border: isDarkMode ? 'border-green-700/50' : 'border-green-200' };
                if (s >= 60) return { stroke: '#f59e0b', bg: isDarkMode ? 'bg-amber-900/30' : 'bg-amber-50', text: isDarkMode ? 'text-amber-400' : 'text-amber-600', label: 'Fair', border: isDarkMode ? 'border-amber-700/50' : 'border-amber-200' };
                return { stroke: '#ef4444', bg: isDarkMode ? 'bg-red-900/30' : 'bg-red-50', text: isDarkMode ? 'text-red-400' : 'text-red-600', label: 'Poor', border: isDarkMode ? 'border-red-700/50' : 'border-red-200' };
              };
              const getSeverity = (count: number): 'success' | 'warning' | 'danger' => {
                if (count <= 5) return 'success';
                if (count <= 15) return 'warning';
                return 'danger';
              };
              const severityColors = {
                success: isDarkMode ? 'bg-green-900/30 border-green-700/50 text-green-400' : 'bg-green-50 border-green-200 text-green-700',
                warning: isDarkMode ? 'bg-yellow-900/30 border-yellow-700/50 text-yellow-400' : 'bg-yellow-50 border-yellow-200 text-yellow-700',
                danger: isDarkMode ? 'bg-red-900/30 border-red-700/50 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
              };
              const scoreStyle = getScoreColor(score);
              const behaviorIcons: Record<string, typeof TrendingUp> = {
                'Harsh Acceleration': TrendingUp,
                'Harsh Cornering': Navigation,
                'Harsh Braking': TrendingDown,
                'Extreme Braking': AlertTriangle,
              };
              const abuseIcons: Record<string, typeof TrendingUp> = {
                'Cold Engine: High RPM': ThermometerSun,
                'Cold Engine: Full Throttle': Wind,
                'Idle Revving': Activity,
                'Kickdown': Zap,
                'Long Idle': Clock,
                'Constant High RPM': Gauge,
              };
              return (
                <div className={`rounded-lg p-8 border shadow-sm ${
                  isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      Driving Behavior
                    </div>
                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-lg ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100/80'}`}>
                      <Hash className={`w-3 h-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <span className={`text-xs font-mono font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {detailBooking.bookingRef}
                      </span>
                    </div>
                  </div>

                  {/* Driving Score */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative w-20 h-20 flex-shrink-0">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="40" cy="40" r="34" stroke={isDarkMode ? '#27272a' : '#e5e7eb'} strokeWidth="6" fill="none" />
                        <circle cx="40" cy="40" r="34" stroke={scoreStyle.stroke} strokeWidth="6" fill="none"
                          strokeDasharray={`${2 * Math.PI * 34}`}
                          strokeDashoffset={`${2 * Math.PI * 34 * (1 - score / 100)}`}
                          strokeLinecap="round" className="transition-all duration-1000" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{score}</span>
                      </div>
                    </div>
                    <div>
                      <div className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Driving Style Score</div>
                      {safetyScore != null && (
                        <div className={`text-[10px] mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          Safety Score: {Math.round(safetyScore)}
                        </div>
                      )}
                      <span className={`inline-block mt-1 text-xs px-2.5 py-1 rounded-full font-semibold border ${scoreStyle.bg} ${scoreStyle.text} ${scoreStyle.border}`}>
                        {scoreStyle.label}
                      </span>
                    </div>
                  </div>

                  {/* Driving Behavior Items */}
                  <div className="space-y-2 mb-3">
                    {detailBooking.drivingBehavior!.map((b: any, idx: number) => {
                      const severity = getSeverity(b.count);
                      const BIcon = behaviorIcons[b.label] || AlertTriangle;
                      return (
                        <div key={idx} className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border ${severityColors[severity]}`}>
                          <div className="flex items-center gap-2">
                            <BIcon className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-semibold">{b.label}</span>
                          </div>
                          <span className="text-[10px] font-bold">{b.count}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Abuse Detection */}
                  <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    Abuse Detection
                  </div>
                  <div className="space-y-2">
                    {detailBooking.abuseDetection!.map((a: any, idx: number) => {
                      const severity = getSeverity(a.count);
                      const AIcon = abuseIcons[a.label] || AlertTriangle;
                      return (
                        <div key={idx} className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg border ${severityColors[severity]}`}>
                          <div className="flex items-center gap-2">
                            <AIcon className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-semibold">{a.label}</span>
                          </div>
                          <span className="text-[10px] font-bold">{a.count}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total Events */}
                  <div className={`mt-4 px-3 py-2 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Total Events</span>
                      <span className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {detailBooking.drivingBehavior!.reduce((s: number, b: any) => s + b.count, 0) +
                          detailBooking.abuseDetection!.reduce((s: number, a: any) => s + a.count, 0)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Notes */}
            {(detailBooking.notes || isEditMode) && (
              <div className={`rounded-lg p-8 border shadow-sm ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}>
                <div className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center justify-between ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  Notizen
                  {isEditMode && <Pencil className={`w-3.5 h-3.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />}
                </div>
                {isEditMode ? (
                  <textarea
                    value={inlineEdit.notes ?? detailBooking.notes ?? ''}
                    onChange={e => setInlineEdit(prev => ({ ...prev, notes: e.target.value }))}
                    rows={4}
                    placeholder="Notizen zur Buchung..."
                    className={`w-full px-3 py-3 rounded-lg text-xs resize-none outline-none border transition-colors ${
                      isDarkMode
                        ? 'bg-neutral-800/50 text-gray-200 border-neutral-700/30 focus:border-blue-500 placeholder:text-gray-600'
                        : 'bg-gray-50 text-gray-700 border-gray-100 focus:border-blue-500 placeholder:text-gray-400'
                    }`}
                  />
                ) : (
                  <div className={`px-3 py-3 rounded-lg ${
                    isDarkMode ? 'bg-neutral-800/50 text-gray-300 border border-neutral-700/30' : 'bg-gray-50 text-gray-700 border border-gray-100'
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
                isDarkMode ? 'bg-neutral-900/95 border-neutral-700' : 'bg-white/95 border-gray-200'
              }`}
            >
              <div className="p-8 text-center">
                <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ${isDarkMode ? 'bg-red-600/20' : 'bg-red-50'}`}>
                  <AlertTriangle className={`w-5 h-5 ${isDarkMode ? 'text-red-400' : 'text-red-500'}`} />
                </div>
                <h3 className={`text-base mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Buchung stornieren?</h3>
                <p className={`text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Möchten Sie diese Buchung wirklich stornieren?
                </p>
                {booking && (
                  <div className={`rounded-lg p-3 my-4 text-left text-xs space-y-1.5 ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
                    <div className="flex justify-between">
                      <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Kunde</span>
                      <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{booking.customer}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Fahrzeug</span>
                      <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{booking.vehicle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Zeitraum</span>
                      <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{booking.startDate} â€“ {booking.endDate}</span>
                    </div>
                    <div className={`flex justify-between pt-1.5 border-t ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
                      <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Betrag</span>
                      <span className={isDarkMode ? 'text-red-400' : 'text-red-600'}>{booking.revenue}</span>
                    </div>
                  </div>
                )}
                <p className={`text-xs mb-3 ${isDarkMode ? 'text-red-400/80' : 'text-red-500/80'}`}>
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCancelConfirmId(null)}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-xs border transition-all ${
                      isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Zurück
                  </button>
                  <button
                    onClick={executeCancel}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Stornieren
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
    <div className="max-w-[1800px] mx-auto relative">
      {/* Top Section: Search, Month Pill and Create Button */}
      <div className="flex items-center justify-between mb-3">
        {/* Search Bar */}
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all duration-200 w-80 ${
          isDarkMode 
            ? 'bg-neutral-900 border-neutral-700 hover:border-neutral-600' 
            : 'bg-white border-gray-200 hover:border-gray-300'
        }`}>
          <Search className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
          <input
            type="text"
            placeholder="Search bookings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`flex-1 bg-transparent outline-none text-xs ${
              isDarkMode ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'
            }`}
          />
        </div>

        {/* Month Selector Pill */}
        <div className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border transition-all duration-200 ${
          isDarkMode
            ? 'bg-neutral-900 border-neutral-700'
            : 'bg-white border-gray-200'
        }`}>
          <button
            onClick={goToPrevMonth}
            className={`p-1.5 rounded-lg transition-all duration-200 ${
              isDarkMode
                ? 'hover:bg-neutral-800 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goToCurrentMonth}
            className={`px-3 py-1 rounded-lg transition-all duration-200 min-w-[160px] text-center ${
              isCurrentMonth
                ? isDarkMode
                  ? 'text-white'
                  : 'text-gray-900'
                : isDarkMode
                  ? 'text-blue-400 hover:bg-neutral-800'
                  : 'text-blue-600 hover:bg-gray-50'
            }`}
          >
            <span className="text-[10px] font-bold">{monthNamesDE[displayMonth]} {displayYear}</span>
          </button>
          <button
            onClick={goToNextMonth}
            className={`p-1.5 rounded-lg transition-all duration-200 ${
              isDarkMode
                ? 'hover:bg-neutral-800 text-gray-400 hover:text-gray-200'
                : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          {!isCurrentMonth && (
            <button
              onClick={goToCurrentMonth}
              className={`ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${
                isDarkMode
                  ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                  : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
            >
              Today
            </button>
          )}
        </div>

        {/* Create New Booking Button */}
        <button onClick={onCreateNewBooking} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg font-semibold text-xs shadow-lg hover:bg-blue-700 transition-all duration-200 hover:shadow-xl">
          <Plus className="w-5 h-5" />
          Create New Booking
        </button>
      </div>

      {/* Main Content: Calendar and Bookings List */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* Bookings List - Left Side */}
        <div className={`col-span-1 lg:col-span-2 rounded-lg p-4 border shadow-sm ${
          isDarkMode 
            ? 'bg-neutral-900 border-neutral-700' 
            : 'bg-white border-gray-200'
        }`}>
          {/* Title */}
          <div className="flex items-center gap-2.5 mb-3">
            <div className={`p-1.5 rounded-lg ${isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
              <BookOpen className="w-5 h-5" />
            </div>
            <h3 className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Bookings
            </h3>
          </div>

          {/* Tabs */}
          <div className="flex items-center justify-between mb-3">
            <div className={`flex rounded-lg p-1 border ${
              isDarkMode 
                ? 'bg-neutral-800 border-neutral-700' 
                : 'bg-gray-100/60 border-gray-200'
            }`}>
              {([
                { key: 'active' as const, label: 'Active', color: 'blue' },
                { key: 'upcoming' as const, label: 'Upcoming', color: 'purple' },
                { key: 'completed' as const, label: 'Completed', color: 'green' },
              ]).map(tab => {
                const count = dayFilteredCounts[tab.key];
                const hasBookingsOnDay = dayFilteredCounts[tab.key] > 0;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(activeTab === tab.key ? null : tab.key)}
                    className={`relative px-3 py-2 rounded-lg font-semibold text-xs transition-all duration-200 ${
                      isActive
                        ? tab.color === 'blue'
                          ? 'bg-blue-600 text-white'
                          : tab.color === 'purple'
                          ? 'bg-purple-600 text-white'
                          : 'bg-green-600 text-white'
                        : selectedDate !== null && hasBookingsOnDay
                        ? tab.color === 'blue'
                          ? isDarkMode ? 'text-blue-400' : 'text-blue-600'
                          : tab.color === 'purple'
                          ? isDarkMode ? 'text-purple-400' : 'text-purple-600'
                          : isDarkMode ? 'text-green-400' : 'text-green-600'
                        : isDarkMode
                          ? 'text-gray-400'
                          : 'text-gray-600'
                    }`}
                  >
                    {tab.label} ({count})
                    {selectedDate !== null && hasBookingsOnDay && !isActive && (
                      <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                        tab.color === 'blue' ? 'bg-blue-500' : tab.color === 'purple' ? 'bg-purple-500' : 'bg-green-500'
                      }`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date/Month filter indicator - always visible */}
          <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between ${
            selectedDate !== null
              ? isDarkMode ? 'bg-blue-900/20 text-blue-400 border border-blue-800/30' : 'bg-blue-50 text-blue-600 border border-blue-100'
              : isDarkMode ? 'bg-neutral-800/50 text-gray-400 border border-neutral-700/30' : 'bg-gray-50 text-gray-500 border border-gray-100'
          }`}>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {selectedDate !== null
                ? <span>Bookings für {selectedDate}. {monthNamesDE[displayMonth]} {displayYear}</span>
                : <span>Bookings für {monthNamesDE[displayMonth]} {displayYear}</span>
              }
            </div>
            {selectedDate !== null && (
              <button
                onClick={() => setSelectedDate(null)}
                className={`ml-2 px-2 py-0.5 rounded text-xs transition-all duration-200 ${
                  isDarkMode ? 'hover:bg-blue-800/30 text-blue-400' : 'hover:bg-blue-100 text-blue-600'
                }`}
              >
                âœ• Tag-Filter
              </button>
            )}
          </div>

          {/* Search Results Indicator */}
          {searchQuery.trim() && (
            <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between ${
              isDarkMode ? 'bg-purple-900/20 text-purple-400 border border-purple-800/30' : 'bg-purple-50 text-purple-600 border border-purple-100'
            }`}>
              <div className="flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5" />
                <span>Results from searching <strong>&quot;{searchQuery}&quot;</strong> â€â€ÂÂÂ {filteredBookings.length} {filteredBookings.length === 1 ? 'Buchung' : 'Buchungen'} gefunden</span>
              </div>
              <button
                onClick={() => setSearchQuery('')}
                className={`ml-2 px-2 py-0.5 rounded text-xs transition-all duration-200 ${
                  isDarkMode ? 'hover:bg-purple-800/30 text-purple-400' : 'hover:bg-purple-100 text-purple-600'
                }`}
              >
                ✕ Suche löschen
              </button>
            </div>
          )}

          {/* Bookings List */}
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            {filteredBookings.length === 0 && (
              <div className={`flex flex-col items-center justify-center py-12 rounded-lg border ${
                isDarkMode ? 'bg-neutral-900/40 border-neutral-800/50' : 'bg-gray-50/50 border-gray-200'
              }`}>
                <Search className={`w-5 h-5 mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {searchQuery.trim() ? `Keine Buchungen für „${searchQuery}" gefunden` : 'Keine Buchungen vorhanden'}
                </p>
                {searchQuery.trim() && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className={`mt-2 text-xs font-medium px-3 py-1 rounded-lg transition-colors ${
                      isDarkMode ? 'text-blue-400 hover:bg-blue-500/10' : 'text-blue-600 hover:bg-blue-50'
                    }`}
                  >
                    Suche zurücksetzen
                  </button>
                )}
              </div>
            )}
            {filteredBookings.map((booking) => (
              <div
                key={booking.id}
                onMouseEnter={() => setHoveredBookingId(booking.id)}
                onMouseLeave={() => setHoveredBookingId(null)}
                onClick={() => {
                  handleBookingClick(booking.id);
                  setPopupBookingId(booking.id);
                }}
                className={`p-4 rounded-lg border transition-all duration-200 cursor-pointer ${
                  selectedBookingId === booking.id
                    ? booking.status === 'active'
                      ? isDarkMode
                        ? 'bg-blue-900/50 border-blue-500 shadow-lg ring-2 ring-blue-500/50'
                        : 'bg-blue-50 border-blue-500 shadow-lg ring-2 ring-blue-400/50'
                      : booking.status === 'confirmed' || booking.status === 'pending'
                      ? isDarkMode
                        ? 'bg-purple-900/50 border-purple-500 shadow-lg ring-2 ring-purple-500/50'
                        : 'bg-purple-50 border-purple-500 shadow-lg ring-2 ring-purple-400/50'
                      : isDarkMode
                        ? 'bg-green-900/50 border-green-500 shadow-lg ring-2 ring-green-500/50'
                        : 'bg-green-50 border-green-500 shadow-lg ring-2 ring-green-400/50'
                    : hoveredBookingId === booking.id
                    ? isDarkMode 
                      ? 'bg-blue-900/40 border-blue-600 shadow-lg ring-2 ring-blue-500/50' 
                      : 'bg-blue-50 border-blue-400 shadow-lg ring-2 ring-blue-400/50'
                    : isDarkMode 
                      ? 'bg-neutral-800/40 border-neutral-700 hover:border-neutral-600' 
                      : 'bg-white/40 border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <User className={`w-5 h-5 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                      <span className={`font-bold text-xs ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {booking.customer}
                      </span>
                      {booking.status === 'active' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                          Active
                        </span>
                      )}
                      {booking.status === 'pending' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isDarkMode ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700'}`}>
                          Pending
                        </span>
                      )}
                      {booking.status === 'confirmed' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'}`}>
                          Confirmed
                        </span>
                      )}
                      {booking.status === 'completed' && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'}`}>
                          <CheckCircle className="w-3 h-3" />
                          Completed
                        </span>
                      )}
                    </div>
                    <div className={`text-xs font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {booking.vehicle} â€¢ {booking.plate}
                    </div>
                    <div className={`text-xs font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      Ref: {booking.bookingRef}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1.5">
                    <div className={`text-xs font-bold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                      {booking.revenue}
                    </div>
                    {/* Edit & Cancel buttons on hover for upcoming bookings */}
                    {(booking.status === 'confirmed' || booking.status === 'pending') && hoveredBookingId === booking.id && (
                      <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-right-2 duration-200">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailBookingId(booking.id);
                          }}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all duration-200 ${
                            isDarkMode
                              ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 border border-blue-500/30'
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                          }`}
                          title="Buchung bearbeiten"
                        >
                          <Pencil className="w-3 h-3" />
                          Bearbeiten
                        </button>
                        <button
                          onClick={(e) => confirmCancel(booking.id, e)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all duration-200 ${
                            isDarkMode
                              ? 'bg-red-600/20 text-red-400 hover:bg-red-600/40 border border-red-500/30'
                              : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                          }`}
                          title="Buchung stornieren"
                        >
                          <Trash2 className="w-3 h-3" />
                          Stornieren
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="flex items-center gap-2">
                    <Calendar className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`} />
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {booking.startDate} - {booking.endDate}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`} />
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {booking.startTime} - {booking.endTime}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`} />
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {booking.pickupLocation}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`} />
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      {booking.insurance}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Booking Detail Popup Modal */}
          {popupBookingId && (() => {
            const allBookings = [...activeBookings, ...upcomingBookings, ...completedBookings];
            const booking = allBookings.find(b => b.id === popupBookingId);
            if (!booking) return null;
            const statusColor = booking.status === 'active' ? 'blue' : booking.status === 'confirmed' || booking.status === 'pending' ? 'purple' : 'green';
            const statusLabel = booking.status === 'active' ? 'Active' : booking.status === 'pending' ? 'Pending' : booking.status === 'confirmed' ? 'Confirmed' : 'Completed';
            return (
              <div 
                className={`z-50 flex items-center justify-center overflow-hidden transition-all duration-500 ease-out ${
                  popupFullView 
                    ? 'fixed inset-0 rounded-none' 
                    : 'absolute inset-0 rounded-3xl'
                }`}
                onClick={handleClosePopup}
              >
                {/* Backdrop */}
                <div className={`absolute inset-0 transition-all duration-500 ease-out ${
                  popupAnimating 
                    ? isDarkMode ? 'bg-black/70 backdrop-blur-[2px]' : 'bg-black/40 backdrop-blur-[2px]' 
                    : 'bg-black/0 backdrop-blur-none'
                }`} />
                
                {/* Modal - fills BookingsView container or full screen */}
                <div 
                  onClick={(e) => e.stopPropagation()}
                  className={`relative flex flex-col border shadow-[0_40px_120px_rgb(0,0,0,0.4)] transition-all duration-500 ease-out ${
                    popupFullView ? 'w-full h-full rounded-none' : 'w-full h-full rounded-3xl'
                  } ${
                    popupAnimating
                      ? 'opacity-100 scale-100 translate-y-0'
                      : 'opacity-0 scale-[0.97] translate-y-4'
                  } ${
                    isDarkMode 
                      ? 'bg-neutral-900 border-neutral-700/60' 
                      : 'bg-[#f5f5f7] border-gray-200/60'
                  }`}
                >
                  {/* Sticky Header */}
                  <div className={`flex-shrink-0 px-8 pt-8 pb-5 border-b ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-200/60'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-14 h-14 rounded-lg flex items-center justify-center ${
                            statusColor === 'blue' ? (isDarkMode ? 'bg-blue-900/50' : 'bg-blue-100') :
                            statusColor === 'purple' ? (isDarkMode ? 'bg-purple-900/50' : 'bg-purple-100') :
                            (isDarkMode ? 'bg-green-900/50' : 'bg-green-100')
                          }`}>
                            <Car className={`w-7 h-7 ${
                              statusColor === 'blue' ? (isDarkMode ? 'text-blue-400' : 'text-blue-600') :
                              statusColor === 'purple' ? (isDarkMode ? 'text-purple-400' : 'text-purple-600') :
                              (isDarkMode ? 'text-green-400' : 'text-green-600')
                            }`} />
                          </div>
                          <div>
                            <h2 className={`text-lg font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                              {booking.vehicle}
                            </h2>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {booking.plate} â€¢ {booking.bookingRef}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-4">
                          <span className={`text-xs px-3 py-1.5 rounded-full font-semibold flex items-center gap-1.5 ${
                            statusColor === 'blue' ? (isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700') :
                            statusColor === 'purple' ? (booking.status === 'pending' ? (isDarkMode ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700') : (isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700')) :
                            (isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700')
                          }`}>
                            {booking.status === 'active' && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>}
                            {booking.status === 'completed' && <CheckCircle className="w-5 h-5" />}
                            {statusLabel}
                          </span>
                          <span className={`text-xs font-bold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                            {booking.revenue}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => {
                            setDetailBookingId(booking.id);
                            setPopupBookingId(null);
                            setPopupAnimating(false);
                            setPopupClosing(false);
                            setPopupFullView(false);
                            setSelectedBookingId(null);
                          }}
                          className={`p-3 rounded-lg transition-all duration-200 ${
                            isDarkMode 
                              ? 'hover:bg-neutral-800 text-gray-400 hover:text-white' 
                              : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
                          }`}
                          title="Detailansicht öffnen"
                        >
                          <Maximize2 className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={handleClosePopup}
                          className={`p-3 rounded-lg transition-all duration-200 ${
                            isDarkMode 
                              ? 'hover:bg-neutral-800 text-gray-400 hover:text-white' 
                              : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
                          }`}
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto px-8 py-3 space-y-5">
                    {/* Customer & Booking - Side by Side */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Customer Info */}
                      <div>
                        <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          Kunde
                        </div>
                        <div className="space-y-3">
                          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                            <User className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                            <div>
                              <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Name</div>
                              <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{booking.customer}</div>
                            </div>
                          </div>
                          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                            <Phone className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                            <div>
                              <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Telefon</div>
                              <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{booking.customerPhone}</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Booking Times */}
                      <div>
                        <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          Buchungsdetails
                        </div>
                        <div className="space-y-3">
                          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                            <Calendar className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                            <div>
                              <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Zeitraum</div>
                              <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{booking.startDate} â€“ {booking.endDate}</div>
                            </div>
                          </div>
                          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                            <Clock className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                            <div>
                              <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Uhrzeit</div>
                              <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{booking.startTime} â€“ {booking.endTime}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Locations */}
                    <div>
                      <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        Standorte
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                          <MapPin className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                          <div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Abholung</div>
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{booking.pickupLocation}</div>
                          </div>
                        </div>
                        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                          <MapPin className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-500'}`} />
                          <div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Rückgabe</div>
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{booking.returnLocation}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Vehicle & Payment - 4 columns */}
                    <div>
                      <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        Fahrzeug & Zahlung
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                          <Shield className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          <div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Versicherung</div>
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{booking.insurance}</div>
                          </div>
                        </div>
                        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                          <CreditCard className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          <div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Zahlungsart</div>
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{booking.paymentMethod}</div>
                          </div>
                        </div>
                        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                          <Fuel className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          <div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Tankstand</div>
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{booking.fuelLevel}</div>
                          </div>
                        </div>
                        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}`}>
                          <Car className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                          <div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Kilometerstand</div>
                            <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                              {booking.mileageStart.toLocaleString('de-DE')} km
                              {booking.mileageEnd && (
                                <span className={`ml-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                  â†’ {booking.mileageEnd.toLocaleString('de-DE')} km
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mileage Summary for completed */}
                    {booking.status === 'completed' && booking.mileageEnd && (
                      <div className={`flex items-center gap-3 px-3 py-3 rounded-lg ${
                        isDarkMode ? 'bg-green-900/20 text-green-400 border border-green-800/30' : 'bg-green-50 text-green-700 border border-green-100'
                      }`}>
                        <Car className="w-5 h-5" />
                        <span className="font-semibold">Gefahrene Kilometer:</span> {(booking.mileageEnd - booking.mileageStart).toLocaleString('de-DE')} km
                      </div>
                    )}

                    {/* Notes */}
                    {booking.notes && (
                      <div className={`px-3 py-3 rounded-lg ${
                        isDarkMode ? 'bg-neutral-800/50 text-gray-400 border border-neutral-700/30' : 'bg-gray-50 text-gray-600 border border-gray-100'
                      }`}>
                        <span className="font-semibold">Notiz:</span> {booking.notes}
                      </div>
                    )}

                    {/* Documents Section */}
                    {(booking.pickupProtocol || booking.returnProtocol) && (
                      <div>
                        <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          Dokumente
                        </div>
                        <div className="space-y-2">
                          {booking.pickupProtocol && (
                            <div className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all duration-200 ${
                              isDarkMode 
                                ? 'bg-neutral-800/50 border-neutral-700/40 hover:border-blue-600/50 hover:bg-blue-900/20' 
                                : 'bg-white border-gray-200/60 hover:border-blue-300 hover:bg-blue-50/50'
                            }`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${
                                  isDarkMode ? 'bg-blue-900/40' : 'bg-blue-100'
                                }`}>
                                  <ClipboardCheck className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                </div>
                                <div>
                                  <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                    Pickup-Protokoll
                                  </div>
                                  <div className={`text-xs font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                    {booking.pickupProtocol}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  className={`p-2 rounded-lg transition-all duration-200 ${
                                    isDarkMode 
                                      ? 'hover:bg-neutral-700 text-gray-400 hover:text-blue-400' 
                                      : 'hover:bg-gray-100 text-gray-500 hover:text-blue-600'
                                  }`}
                                  title="Ansehen"
                                >
                                  <Eye className="w-5 h-5" />
                                </button>
                                <button
                                  className={`p-2 rounded-lg transition-all duration-200 ${
                                    isDarkMode 
                                      ? 'hover:bg-neutral-700 text-gray-400 hover:text-blue-400' 
                                      : 'hover:bg-gray-100 text-gray-500 hover:text-blue-600'
                                  }`}
                                  title="Herunterladen"
                                >
                                  <Download className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                          )}
                          {booking.returnProtocol && (
                            <div className={`flex items-center justify-between px-3 py-2 rounded-lg border transition-all duration-200 ${
                              isDarkMode 
                                ? 'bg-neutral-800/50 border-neutral-700/40 hover:border-green-600/50 hover:bg-green-900/20' 
                                : 'bg-white border-gray-200/60 hover:border-green-300 hover:bg-green-50/50'
                            }`}>
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${
                                  isDarkMode ? 'bg-green-900/40' : 'bg-green-100'
                                }`}>
                                  <FileText className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                                </div>
                                <div>
                                  <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                                    Return-Protokoll
                                  </div>
                                  <div className={`text-xs font-mono ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                    {booking.returnProtocol}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  className={`p-2 rounded-lg transition-all duration-200 ${
                                    isDarkMode 
                                      ? 'hover:bg-neutral-700 text-gray-400 hover:text-green-400' 
                                      : 'hover:bg-gray-100 text-gray-500 hover:text-green-600'
                                  }`}
                                  title="Ansehen"
                                >
                                  <Eye className="w-5 h-5" />
                                </button>
                                <button
                                  className={`p-2 rounded-lg transition-all duration-200 ${
                                    isDarkMode 
                                      ? 'hover:bg-neutral-700 text-gray-400 hover:text-green-400' 
                                      : 'hover:bg-gray-100 text-gray-500 hover:text-green-600'
                                  }`}
                                  title="Herunterladen"
                                >
                                  <Download className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Calendar - Right Side */}
        <div className={`col-span-1 lg:col-span-3 rounded-lg p-4 border shadow-sm ${
          isDarkMode 
            ? 'bg-neutral-900 border-neutral-700' 
            : 'bg-white border-gray-200'
        }`}>
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {monthNamesDE[displayMonth]} {displayYear}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevMonth}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  isDarkMode 
                    ? 'hover:bg-neutral-800 text-gray-400' 
                    : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              {!isCurrentMonth && (
                <button
                  onClick={goToCurrentMonth}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    isDarkMode
                      ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  Today
                </button>
              )}
              <button
                onClick={goToNextMonth}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  isDarkMode 
                    ? 'hover:bg-neutral-800 text-gray-400' 
                    : 'hover:bg-gray-100 text-gray-600'
                }`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="mb-3">
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                <div
                  key={day}
                  className={`text-center text-xs font-semibold ${
                    isDarkMode ? 'text-gray-500' : 'text-gray-600'
                  }`}
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
                      const colorMap = {
                        blue: isDarkMode
                          ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-400/60 scale-105'
                          : 'bg-blue-500 text-white shadow-lg ring-2 ring-blue-300/60 scale-105',
                        purple: isDarkMode
                          ? 'bg-purple-600 text-white shadow-lg ring-2 ring-purple-400/60 scale-105'
                          : 'bg-purple-500 text-white shadow-lg ring-2 ring-purple-300/60 scale-105',
                        green: isDarkMode
                          ? 'bg-green-600 text-white shadow-lg ring-2 ring-green-400/60 scale-105'
                          : 'bg-green-500 text-white shadow-lg ring-2 ring-green-300/60 scale-105',
                      };
                      return colorMap[bookingColor];
                    }
                    if (isToday) return isDarkMode
                      ? 'bg-blue-900/30 text-blue-400/60'
                      : 'bg-blue-100/50 text-blue-400/60';
                    return isDarkMode
                      ? 'text-gray-600 opacity-40'
                      : 'text-gray-300 opacity-50';
                  }

                  if (!hasBooking) return '';

                  // When hovering a booking card - use status-based colors
                  if (isInHoveredBooking) {
                    const hoverColorMap = {
                      blue: isDarkMode
                        ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-400 scale-105'
                        : 'bg-blue-500 text-white shadow-lg ring-2 ring-blue-300 scale-105',
                      purple: isDarkMode
                        ? 'bg-purple-600 text-white shadow-lg ring-2 ring-purple-400 scale-105'
                        : 'bg-purple-500 text-white shadow-lg ring-2 ring-purple-300 scale-105',
                      green: isDarkMode
                        ? 'bg-green-600 text-white shadow-lg ring-2 ring-green-400 scale-105'
                        : 'bg-green-500 text-white shadow-lg ring-2 ring-green-300 scale-105',
                    };
                    return hoverColorMap[hoveredColor];
                  }

                  if (isToday) return isDarkMode
                    ? 'bg-blue-950 text-white shadow-lg ring-2 ring-blue-800/60'
                    : 'bg-blue-950 text-white shadow-lg ring-2 ring-blue-800/60';
                  if (isSelected) return isDarkMode
                    ? 'bg-neutral-600 text-white ring-2 ring-neutral-500 shadow-lg'
                    : 'bg-gray-300 text-gray-900 ring-2 ring-gray-400 shadow-lg';

                  // Tab-based highlighting: emphasize days matching the active tab, dim others
                  if (activeTab !== null && inActiveTab) {
                    const tabHighlight = {
                      blue: isDarkMode
                        ? 'text-white bg-blue-900/40 border border-blue-600/50 shadow-sm'
                        : 'text-gray-900 bg-blue-100 border border-blue-300 shadow-sm',
                      purple: isDarkMode
                        ? 'text-white bg-purple-900/40 border border-purple-600/50 shadow-sm'
                        : 'text-gray-900 bg-purple-100 border border-purple-300 shadow-sm',
                      green: isDarkMode
                        ? 'text-white bg-green-900/40 border border-green-600/50 shadow-sm'
                        : 'text-gray-900 bg-green-100 border border-green-300 shadow-sm',
                    };
                    return tabHighlight[tabColor];
                  }

                  // No tab selected - show original status-based colors for all booking days
                  if (activeTab === null) {
                    if (hasActive) return isDarkMode
                      ? 'text-gray-200 bg-blue-900/25 border border-blue-700/40 hover:bg-blue-900/40'
                      : 'text-gray-900 bg-blue-50 border border-blue-200 hover:bg-blue-100';
                    if (hasUpcoming) return isDarkMode
                      ? 'text-gray-200 bg-purple-900/25 border border-purple-700/40 hover:bg-purple-900/40'
                      : 'text-gray-900 bg-purple-50 border border-purple-200 hover:bg-purple-100';
                    if (hasCompleted) return isDarkMode
                      ? 'text-gray-200 bg-green-900/25 border border-green-700/40 hover:bg-green-900/40'
                      : 'text-gray-900 bg-green-50 border border-green-200 hover:bg-green-100';
                    return '';
                  }

                  // Days with bookings but not matching active tab - subtle/dimmed
                  return isDarkMode
                    ? 'text-gray-400 bg-neutral-800/30 border border-neutral-700/30'
                    : 'text-gray-400 bg-gray-50 border border-gray-200';
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
                        ? isDarkMode
                          ? 'bg-blue-950 text-white shadow-lg ring-2 ring-blue-800/60'
                          : 'bg-blue-950 text-white shadow-lg ring-2 ring-blue-800/60'
                        : isSelected
                        ? isDarkMode
                          ? 'bg-neutral-700 text-white'
                          : 'bg-gray-200 text-gray-900'
                        : isDarkMode
                        ? 'text-gray-300 hover:bg-neutral-800'
                        : 'text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {day}
                    {hasBooking && day && !isInHoveredBooking && !isToday && !hasSelectedBooking && (
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                        {hasActive && (
                          <div className={`w-1.5 h-1.5 rounded-full bg-blue-500 ${isSelected ? 'ring-1 ring-white' : ''}`} />
                        )}
                        {hasUpcoming && (
                          <div className={`w-1.5 h-1.5 rounded-full bg-purple-500 ${isSelected ? 'ring-1 ring-white' : ''}`} />
                        )}
                        {hasCompleted && (
                          <div className={`w-1.5 h-1.5 rounded-full bg-green-500 ${isSelected ? 'ring-1 ring-white' : ''}`} />
                        )}
                      </div>
                    )}
                    {hasBooking && day && !isInHoveredBooking && isToday && !hasSelectedBooking && (
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                        {hasActive && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        {hasUpcoming && <div className="w-1.5 h-1.5 rounded-full bg-purple-200" />}
                        {hasCompleted && <div className="w-1.5 h-1.5 rounded-full bg-green-200" />}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendar Legend */}
          <div className={`pt-4 border-t ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div>
                <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Active</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-500"></div>
                <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Upcoming</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
                <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-950"></div>
                <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Today</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Booking Modal */}
      {editingBooking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => setEditingBooking(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-2xl mx-4 rounded-lg shadow-2xl border overflow-hidden ${
              isDarkMode ? 'bg-neutral-900/95 border-neutral-700' : 'bg-white/95 border-gray-200'
            } max-h-[90vh] flex flex-col`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-3 py-3 border-b shrink-0 ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-blue-600/20' : 'bg-blue-50'}`}>
                  <Pencil className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                </div>
                <div>
                  <h3 className={`text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Buchung bearbeiten</h3>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Ref: {editingBooking.bookingRef}</p>
                </div>
              </div>
              <button onClick={() => setEditingBooking(null)} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form */}
            <div className="overflow-y-auto flex-1 px-3 py-3 space-y-5">
              {/* Section: Kunde & Fahrzeug */}
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Kunde & Fahrzeug</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={`text-xs mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Kunde</label>
                    <input type="text" value={editForm.customer} onChange={(e) => setEditForm(f => ({ ...f, customer: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`} />
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Fahrzeug</label>
                    <input type="text" value={editForm.vehicle} onChange={(e) => setEditForm(f => ({ ...f, vehicle: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`} />
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Kennzeichen</label>
                    <input type="text" value={editForm.plate} onChange={(e) => setEditForm(f => ({ ...f, plate: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`} />
                  </div>
                </div>
              </div>

              {/* Section: Zeitraum */}
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Zeitraum</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className={`text-xs mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Startdatum</label>
                    <input type="text" value={editForm.startDate} onChange={(e) => setEditForm(f => ({ ...f, startDate: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`} />
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Abholzeit</label>
                    <input type="text" value={editForm.startTime} onChange={(e) => setEditForm(f => ({ ...f, startTime: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`} />
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Enddatum</label>
                    <input type="text" value={editForm.endDate} onChange={(e) => setEditForm(f => ({ ...f, endDate: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`} />
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Rückgabezeit</label>
                    <input type="text" value={editForm.endTime} onChange={(e) => setEditForm(f => ({ ...f, endTime: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`} />
                  </div>
                </div>
              </div>

              {/* Section: Stationen */}
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Stationen</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-xs mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Abholstation</label>
                    <select value={editForm.pickupLocation} onChange={(e) => setEditForm(f => ({ ...f, pickupLocation: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`}>
                      {locationOptions.length === 0 ? (
                        <option value="">No stations</option>
                      ) : (
                        locationOptions.map((loc) => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Rückgabestation</label>
                    <select value={editForm.returnLocation} onChange={(e) => setEditForm(f => ({ ...f, returnLocation: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`}>
                      {locationOptions.length === 0 ? (
                        <option value="">No stations</option>
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
                <div className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Versicherung & Zahlung</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={`text-xs mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Versicherung</label>
                    <select value={editForm.insurance} onChange={(e) => setEditForm(f => ({ ...f, insurance: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`}>
                      <option value="Vollkasko">Vollkasko</option>
                      <option value="Teilkasko">Teilkasko</option>
                      <option value="Haftpflicht">Haftpflicht</option>
                      <option value="Premium Vollkasko">Premium Vollkasko</option>
                    </select>
                  </div>
                  <div>
                    <label className={`text-xs mb-1 block ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Zahlungsmethode</label>
                    <select value={editForm.paymentMethod} onChange={(e) => setEditForm(f => ({ ...f, paymentMethod: e.target.value }))} className={`w-full px-3 py-2 rounded-lg text-xs border transition-all ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400'} outline-none`}>
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
                <div className={`text-[11px] font-semibold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Notizen</div>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder="Optionale Anmerkungen zur Buchung..."
                  className={`w-full px-3 py-2 rounded-lg text-xs border transition-all resize-none ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500 placeholder:text-gray-600' : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400 placeholder:text-gray-400'} outline-none`}
                />
              </div>
            </div>

            {/* Footer */}
            <div className={`flex items-center justify-end gap-3 px-3 py-3 border-t shrink-0 ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
              <button
                onClick={() => setEditingBooking(null)}
                className={`px-3 py-2 rounded-lg text-xs transition-all ${
                  isDarkMode ? 'text-gray-300 hover:bg-neutral-800' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Abbrechen
              </button>
              <button
                onClick={saveEdit}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl"
              >
                <Save className="w-3.5 h-3.5" />
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
                isDarkMode ? 'bg-neutral-900/95 border-neutral-700' : 'bg-white/95 border-gray-200'
              }`}
            >
              <div className="p-8 text-center">
                <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center ${isDarkMode ? 'bg-red-600/20' : 'bg-red-50'}`}>
                  <AlertTriangle className={`w-5 h-5 ${isDarkMode ? 'text-red-400' : 'text-red-500'}`} />
                </div>
                <h3 className={`text-base mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Buchung stornieren?</h3>
                <p className={`text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Möchten Sie diese Buchung wirklich stornieren?
                </p>
                {booking && (
                  <div className={`rounded-lg p-3 my-4 text-left text-xs space-y-1.5 ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
                    <div className="flex justify-between">
                      <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Kunde</span>
                      <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{booking.customer}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Fahrzeug</span>
                      <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{booking.vehicle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Zeitraum</span>
                      <span className={isDarkMode ? 'text-white' : 'text-gray-900'}>{booking.startDate} â€“ {booking.endDate}</span>
                    </div>
                    <div className={`flex justify-between pt-1.5 border-t ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
                      <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Betrag</span>
                      <span className={isDarkMode ? 'text-red-400' : 'text-red-600'}>{booking.revenue}</span>
                    </div>
                  </div>
                )}
                <p className={`text-xs mb-3 ${isDarkMode ? 'text-red-400/80' : 'text-red-500/80'}`}>
                  Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setCancelConfirmId(null)}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-xs border transition-all ${
                      isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Zurück
                  </button>
                  <button
                    onClick={executeCancel}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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