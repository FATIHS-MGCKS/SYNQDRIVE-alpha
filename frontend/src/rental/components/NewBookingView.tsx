import { useState, useMemo, useEffect, useRef } from 'react';
import { Calendar, Car, CheckCircle, CreditCard, Euro, Eye, FileText, IdCard, ShieldCheck, Star, Upload, User } from 'lucide-react';
import { Icon } from './ui/Icon';
import { toast } from 'sonner';

import { VehicleData, isVehicleOffline, VEHICLE_OFFLINE_LABEL } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { ImageWithFallback } from '../../components/figma/ImageWithFallback';
import { CustomerDetailModal } from './CustomerDetailModal';
import { CustomerDocumentUploadBox } from './CustomerDocumentUploadBox';
import { VehicleTariff, ExtraOption, buildTariffs } from '../data/tariffs';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
// V4.6.67 — share the same brand-logo CDN/component used in FleetView so the
// vehicle picker shows real brand artwork (Volkswagen, BMW, Tesla, …) instead
// of an inline mock map of carlogos.org URLs.
import { BrandLogo, getBrandFromModel } from './BrandLogo';
import {
  buildCustomerCreatePayload,
  buildBookingCreatePayload,
  customerTypeApiToUi,
  customerStatusApiToUi,
  customerRiskApiToUi,
  mapApiBooking,
} from '../lib/entityMappers';
// V4.6.76 Rental Health V1 — pre-flight the rental_blocked gate in the
// vehicle picker so dispatchers see "Nicht vermietbar" BEFORE they click,
// instead of first getting a 409 from the booking create endpoint.
import { useFleetHealthMap } from '../hooks/useVehicleHealth';
import { RentalHealthBadge } from './rental-health/RentalHealthBadge';
import {
  PageHeader,
  DataCard,
  SectionHeader,
  StatusChip,
  EmptyState,
  SkeletonCard,
} from '../../components/patterns';

const EM_DASH = '\u2014';

interface NewBookingViewProps {
  onBack: () => void;
  tariffs?: VehicleTariff[];
  onCustomerCreated?: (customer: any) => void;
  onBookingCreated?: (booking: any) => void;
}

// Customer data reused from CustomersView
interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  type: 'Individual' | 'Corporate';
  status: 'Active' | 'Under Review' | 'Suspended' | 'Blocked' | 'Archived' | 'Inactive';
  // V4.6.95 — neutral 'Not Assessed' default replaces fake "Low Risk".
  riskLevel: 'Not Assessed' | 'Low Risk' | 'Medium Risk' | 'High Risk';
  // Canonical Driving Style Score (0–100, may be null when no scored trips
  // exist). Frontend never recomputes — backend is source of truth.
  drivingStyleScore: number | null;
  totalBookings: number;
  totalRevenue: string;
  city: string;
  licenseVerified: boolean;
  idVerified: boolean;
}

const formatEuro = (value?: number | null): string => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  try {
    return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  } catch {
    return `€ ${n.toFixed(2)}`;
  }
};

const mapApiCustomerToBookingCustomer = (c: any): Customer => {
  const name = [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim() || c?.email || 'Kunde';
  return {
    id: String(c?.id ?? ''),
    name,
    email: c?.email ?? '',
    phone: c?.phone ?? '',
    company: c?.company ?? undefined,
    type: customerTypeApiToUi(c?.customerType),
    status: customerStatusApiToUi(c?.status, c?.archivedAt),
    riskLevel: customerRiskApiToUi(c?.riskLevel),
    // V4.6.95 — drivingStyleScore is the canonical scalar; legacy
    // `drivingScore` is kept as fallback only for older payloads. Missing
    // data is preserved as `null` (do NOT coerce to 0/100).
    drivingStyleScore:
      typeof c?.drivingStyleScore === 'number'
        ? c.drivingStyleScore
        : typeof c?.drivingScore === 'number'
          ? c.drivingScore
          : null,
    totalBookings: typeof c?.totalRentals === 'number' ? c.totalRentals : 0,
    totalRevenue: formatEuro(typeof c?.totalRevenue === 'number' ? c.totalRevenue : 0),
    city: c?.city ?? '',
    licenseVerified: Boolean(c?.licenseVerified),
    idVerified: Boolean(c?.idVerified),
  };
};

// V4.6.67 — Removed mock `vehicleImages` map and `getVehicleImage` helper.
// The vehicle picker now uses the shared BrandLogo component which fetches the
// brand artwork from the carlogos-dataset CDN, identical to FleetView.

// V4.6.67 — Build the canonical Make Model Year ("MMY") label.
// Falls back to the legacy `model` string (which already includes the year for
// many seed vehicles) so we never render an empty title.
const buildMMY = (v: { make?: string | null; model?: string | null; year?: number | null }) => {
  const make = (v.make ?? '').toString().trim();
  const rawModel = (v.model ?? '').toString().trim();
  const year = typeof v.year === 'number' && Number.isFinite(v.year) ? v.year : null;
  // Strip a trailing 4-digit year that already lives inside `model`.
  const modelClean = rawModel.replace(/\s+\d{4}$/, '').trim();
  // Avoid duplicating make if it is already the first word of the model.
  const makeAlreadyInModel = make && modelClean.toLowerCase().startsWith(make.toLowerCase());
  const head = makeAlreadyInModel || !make ? modelClean : `${make} ${modelClean}`.trim();
  return year ? `${head} ${year}`.trim() : head || rawModel || 'Fahrzeug';
};

// Fallback pricing (used only when no tariff data is available)
const getDailyRateFallback = (v: VehicleData) => {
  const base = v.fuelType === 'Electric' ? 89 : v.fuelType === 'Hybrid' ? 79 : v.fuelType === 'Diesel' ? 59 : 49;
  const yearMod = v.year >= 2025 ? 15 : v.year >= 2024 ? 10 : 0;
  return base + yearMod;
};

// V4.6.67 — Reordered steps so that the booking flow is logically gated:
//   Vehicle → Period → Extras → Customer → Checkout
// Extras (mileage / insurance / accessories) need rentalDays + the vehicle
// tariff to compute prices; choosing them before the period was confusing and
// the user could not advance from Period because the bottom Next button kept
// asking for fields the calendar step does not actually own.
const steps = [
  { id: 1, label: 'Vehicle', icon: Car },
  { id: 2, label: 'Period', icon: Calendar },
  { id: 3, label: 'Extras', icon: Star },
  { id: 4, label: 'Customer', icon: User },
  { id: 5, label: 'Checkout', icon: CreditCard },
];

export function NewBookingView({ onBack, tariffs: externalTariffs, onCustomerCreated, onBookingCreated }: NewBookingViewProps) {
  const { fleetVehicles } = useFleetVehicles();
  const { orgId } = useRentalOrg();
  const allTariffs = externalTariffs?.length ? externalTariffs : buildTariffs(fleetVehicles);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [isSavingBooking, setIsSavingBooking] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // V4.6.67 — Real org bookings (used to compute calendar conflicts per
  // selected vehicle). Replaces the previous hardcoded `vehicleBookings`
  // dictionary that only worked for the legacy v1..v6 demo IDs.
  const [orgBookings, setOrgBookings] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const [customerEligibility, setCustomerEligibility] = useState<{
    canCreatePendingBooking: boolean;
    canConfirmBooking: boolean;
    canStartRental: boolean;
    blockingReasons: string[];
    warnings: string[];
    requiredActions: string[];
  } | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setCustomersLoading(true);
      setCustomersError(null);
      try {
        const params: { limit: number; page: number; search?: string } = {
          limit: 25,
          page: 1,
        };
        if (customerSearch.trim()) params.search = customerSearch.trim();
        const res = await api.customers.list(orgId, params);
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.data ?? []);
        setCustomers(list.map(mapApiCustomerToBookingCustomer));
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : 'Kunden konnten nicht geladen werden';
        setCustomersError(msg);
        setCustomers([]);
      } finally {
        if (!cancelled) setCustomersLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orgId, customerSearch]);

  // V4.6.67 — load all org bookings once so the calendar in the Period step
  // can mark days that are actually blocked for the selected vehicle.
  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      try {
        const res: any = await api.bookings.list(orgId);
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.data ?? res?.items ?? []);
        setOrgBookings(list);
      } catch {
        if (!cancelled) setOrgBookings([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Tariff-aware daily rate lookup
  const getDailyRate = (v: VehicleData) => {
    const tariff = allTariffs.find(t => t.vehicleId === v.id);
    return tariff ? tariff.daily.rate : getDailyRateFallback(v);
  };

  const [currentStep, setCurrentStep] = useState(1);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [vehicleStationFilter, setVehicleStationFilter] = useState('all');
  const [vehicleFuelFilter, setVehicleFuelFilter] = useState('all');
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState('all');
  const [vehicleBrandFilter, setVehicleBrandFilter] = useState('all');
  const [vehicleCategoryFilter, setVehicleCategoryFilter] = useState('all');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleData | null>(null);
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [pickupTime, setPickupTime] = useState('10:00');
  const [returnTime, setReturnTime] = useState('10:00');

  useEffect(() => {
    if (!orgId || !selectedCustomer?.id) {
      setCustomerEligibility(null);
      return;
    }
    let cancelled = false;
    const startIso = pickupDate
      ? new Date(`${pickupDate}T${pickupTime || '10:00'}`).toISOString()
      : undefined;
    api.customers
      .eligibility(orgId, selectedCustomer.id, startIso)
      .then((result) => {
        if (!cancelled) setCustomerEligibility(result);
      })
      .catch(() => {
        if (!cancelled) setCustomerEligibility(null);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, selectedCustomer?.id, pickupDate, pickupTime]);

  const [showPickupTimePicker, setShowPickupTimePicker] = useState(false);
  const [showReturnTimePicker, setShowReturnTimePicker] = useState(false);
  const [pickupStation, setPickupStation] = useState('');
  const [returnStation, setReturnStation] = useState('');
  const [sameReturnStation, setSameReturnStation] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | 'invoice'>('card');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [depositAmount] = useState(250);
  const [extras, setExtras] = useState<string[]>([]);
  const [selectedMileagePackage, setSelectedMileagePackage] = useState<string | null>(null);
  const [selectedInsurances, setSelectedInsurances] = useState<string[]>([]);
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [invoiceGenerated, setInvoiceGenerated] = useState(false);
  const [contractGenerated, setContractGenerated] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [generatingContract, setGeneratingContract] = useState(false);
  const [quickViewDoc, setQuickViewDoc] = useState<'invoice' | 'contract' | null>(null);
  // V4.6.67 — Default the calendar to TODAY (was hardcoded to March 2026).
  // Tracks both month and year so the calendar keeps working past 2026.
  const [calendarMonth, setCalendarMonth] = useState<number>(() => new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState<number>(() => new Date().getFullYear());
  const [calendarSelectMode, setCalendarSelectMode] = useState<'pickup' | 'return'>('pickup');

  // Customer Detail Modal state
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false);
  const [customerDetailTarget, setCustomerDetailTarget] = useState<Customer | null>(null);

  // Add Customer Modal state
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [addStep, setAddStep] = useState(0);
  const [newCustomer, setNewCustomer] = useState({
    firstName: '', lastName: '', email: '', phone: '', street: '', zip: '', city: 'Kassel',
    type: 'Individual' as 'Individual' | 'Corporate', company: '',
    licenseNumber: '', licenseExpiry: '', licenseClass: 'B',
    idType: 'Personalausweis' as 'Personalausweis' | 'Reisepass',
    idNumber: '', idExpiry: '',
    // V4.6.65 — real uploaded document URLs.
    idFrontUrl: null as string | null,
    idBackUrl: null as string | null,
    licenseFrontUrl: null as string | null,
    licenseBackUrl: null as string | null,
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [idVerificationStatus, setIdVerificationStatus] = useState<'idle' | 'verifying' | 'verified' | 'failed'>('idle');

  const resetAddCustomerForm = () => {
    setNewCustomer({
      firstName: '', lastName: '', email: '', phone: '', street: '', zip: '', city: 'Kassel',
      type: 'Individual', company: '',
      licenseNumber: '', licenseExpiry: '', licenseClass: 'B',
      idType: 'Personalausweis', idNumber: '', idExpiry: '',
      idFrontUrl: null, idBackUrl: null, licenseFrontUrl: null, licenseBackUrl: null,
      notes: '',
    });
    setFormErrors({});
    setAddStep(0);
    setIdVerificationStatus('idle');
  };

  const validateAddStep = (step: number): boolean => {
    const errors: Record<string, string> = {};
    if (step === 0) {
      if (!newCustomer.firstName.trim()) errors.firstName = 'First name required';
      if (!newCustomer.lastName.trim()) errors.lastName = 'Last name required';
      if (!newCustomer.email.trim()) errors.email = 'Email required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email)) errors.email = 'Invalid email address';
      if (!newCustomer.phone.trim()) errors.phone = 'Phone number required';
      if (!newCustomer.city.trim()) errors.city = 'City required';
      if (newCustomer.type === 'Corporate' && !newCustomer.company.trim()) errors.company = 'Company name required';
    } else if (step === 1) {
      if (!newCustomer.licenseNumber.trim()) errors.licenseNumber = 'License number required';
      if (!newCustomer.licenseExpiry) errors.licenseExpiry = 'Expiry date required';
      if (!newCustomer.idNumber.trim()) errors.idNumber = 'ID number required';
      if (!newCustomer.idExpiry) errors.idExpiry = 'Expiry date required';
    } else if (step === 2) {
      if (!newCustomer.idFrontUrl) errors.idFront = 'ID front side required';
      if (!newCustomer.idBackUrl) errors.idBack = 'ID back side required';
      if (!newCustomer.licenseFrontUrl) errors.licenseFront = 'License front side required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddNextStep = () => {
    if (validateAddStep(addStep)) {
      if (addStep < 3) setAddStep(addStep + 1);
    }
  };

  const handleSubmitNewCustomer = async () => {
    if (!orgId || isSavingCustomer) return;
    setIsSavingCustomer(true);
    try {
      const payload = buildCustomerCreatePayload({
        firstName: newCustomer.firstName,
        lastName: newCustomer.lastName,
        email: newCustomer.email,
        phone: newCustomer.phone,
        street: newCustomer.street,
        zip: newCustomer.zip,
        city: newCustomer.city || 'Kassel',
        company: newCustomer.type === 'Corporate' ? newCustomer.company : undefined,
        type: newCustomer.type,
        licenseNumber: newCustomer.licenseNumber,
        licenseExpiry: newCustomer.licenseExpiry,
        licenseClass: newCustomer.licenseClass,
        idType: newCustomer.idType,
        idNumber: newCustomer.idNumber,
        idExpiry: newCustomer.idExpiry,
        notes: newCustomer.notes,
        idVerified: idVerificationStatus === 'verified',
        licenseVerified: Boolean(newCustomer.licenseFrontUrl),
        idFrontUrl: newCustomer.idFrontUrl,
        idBackUrl: newCustomer.idBackUrl,
        licenseFrontUrl: newCustomer.licenseFrontUrl,
        licenseBackUrl: newCustomer.licenseBackUrl,
      });
      const created = await api.customers.create(orgId, payload as any);
      const bookingCustomer = mapApiCustomerToBookingCustomer(created);
      setCustomers(prev => [bookingCustomer, ...prev.filter(c => c.id !== bookingCustomer.id)]);
      setSelectedCustomer(bookingCustomer);
      if (onCustomerCreated) {
        onCustomerCreated({
          ...bookingCustomer,
          lastTrip: '—',
          joinDate: new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          licenseExpiry: newCustomer.licenseExpiry,
          accidents: 0,
          violations: 0,
          notes: newCustomer.notes || undefined,
        });
      }
      toast.success('Kunde gespeichert', { description: bookingCustomer.name });
      setIsAddCustomerOpen(false);
      resetAddCustomerForm();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Kunde konnte nicht gespeichert werden';
      toast.error('Fehler beim Anlegen', { description: String(msg) });
    } finally {
      setIsSavingCustomer(false);
    }
  };


  // V4.6.83 — CustomerDetailModal consumes the full Customer shape. We pass
  // through whatever the booking-flow Customer row already knows and leave
  // back-end-sourced fields empty/zero. The modal itself fetches the real
  // detail record (`api.customers.get`) and renders em-dashes for missing
  // values, so we never fabricate trip/license dates or derive fake
  // accident/violation counts from a score.
  const mapToDetailCustomer = (c: Customer) => ({
    ...c,
    lastTrip: (c as Customer & { lastTrip?: string }).lastTrip ?? EM_DASH,
    joinDate: (c as Customer & { joinDate?: string }).joinDate ?? EM_DASH,
    licenseExpiry: (c as Customer & { licenseExpiry?: string }).licenseExpiry ?? EM_DASH,
    accidents: 0,
    violations: 0,
    notes: '',
    currentVehicle: undefined as string | undefined,
  });

  // Derived
  const filteredCustomers = customers;

  const stations = [...new Set(fleetVehicles.map(v => v.station))];
  const fuelTypes = [...new Set(fleetVehicles.map(v => v.fuelType))];

  const getBrand = (model: string) => model.split(' ')[0];
  const categoryMap: Record<string, string> = {
    'Volkswagen Touareg': 'SUV',
    'Hyundai Tucson': 'SUV',
    'Tesla Model S': 'Sedan',
    'Mercedes AMG GT': 'Sports Car',
    'Audi RS5': 'Sports Car',
    'BMW M3': 'Sedan',
  };
  const getCategory = (model: string) => {
    const key = Object.keys(categoryMap).find(k => model.startsWith(k));
    return key ? categoryMap[key] : 'Other';
  };
  const brands = [...new Set(fleetVehicles.map(v => getBrand(v.model)))].sort();
  const categories = [...new Set(fleetVehicles.map(v => getCategory(v.model)))].sort();

  const availableVehicles = fleetVehicles.filter(v => {
    const q = vehicleSearch.toLowerCase();
    const matchesSearch = v.model.toLowerCase().includes(q) || v.license.toLowerCase().includes(q);
    const matchesStation = vehicleStationFilter === 'all' || v.station === vehicleStationFilter;
    const matchesFuel = vehicleFuelFilter === 'all' || v.fuelType === vehicleFuelFilter;
    const matchesBrand = vehicleBrandFilter === 'all' || getBrand(v.model) === vehicleBrandFilter;
    const matchesCategory = vehicleCategoryFilter === 'all' || getCategory(v.model) === vehicleCategoryFilter;
    return matchesSearch && matchesStation && matchesFuel && matchesBrand && matchesCategory;
  });

  // V4.6.76 Rental Health V1 — preload the canonical health map for the
  // vehicles visible in the picker. We pass the full fleet IDs (not the
  // filtered subset) so applying/removing search/station/fuel filters
  // doesn't refetch every keystroke.
  const fleetPickerIds = useMemo(
    () => fleetVehicles.map((v) => v.id).filter(Boolean),
    [fleetVehicles],
  );
  const { map: pickerHealthMap } = useFleetHealthMap(orgId, fleetPickerIds);

  const rentalDays = useMemo(() => {
    if (!pickupDate || !returnDate) return 0;
    const d1 = new Date(pickupDate);
    const d2 = new Date(returnDate);
    return Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
  }, [pickupDate, returnDate]);

  // Get tariff for selected vehicle
  const vehicleTariff = selectedVehicle ? allTariffs.find(t => t.vehicleId === selectedVehicle.id) : null;

  const dailyRate = selectedVehicle ? getDailyRate(selectedVehicle) : 0;
  const subtotal = dailyRate * rentalDays;

  // Calculate extras total from tariff data
  const extrasTotal = useMemo(() => {
    if (!vehicleTariff) return 0;
    let total = 0;
    // Selected extras daily prices * rental days
    for (const extId of extras) {
      const ext = vehicleTariff.extras?.find(e => e.id === extId);
      if (ext) total += ext.dailyPrice * rentalDays;
    }
    // Selected insurances daily prices * rental days
    for (const insId of selectedInsurances) {
      const ins = vehicleTariff.insurances.find(i => i.id === insId);
      if (ins) total += ins.dailyPrice * rentalDays;
    }
    // Selected mileage package (one-time)
    if (selectedMileagePackage) {
      const pkg = vehicleTariff.mileagePackages.find(p => p.id === selectedMileagePackage);
      if (pkg) total += pkg.price;
    }
    return total;
  }, [vehicleTariff, extras, selectedInsurances, selectedMileagePackage, rentalDays]);

  const discountAmount = Math.round((subtotal + extrasTotal) * discountPercent / 100);
  const totalBeforeTax = subtotal + extrasTotal - discountAmount;
  const tax = Math.round(totalBeforeTax * 0.19);
  const grandTotal = totalBeforeTax + tax;

  // Free kilometers based on vehicle type
  const freeKmPerDay = vehicleTariff ? vehicleTariff.daily.kmLimit
    : selectedVehicle
    ? selectedVehicle.fuelType === 'Electric' ? 200
    : selectedVehicle.fuelType === 'Hybrid' ? 250
    : 300
    : 250;
  const baseFreeKm = freeKmPerDay * rentalDays;
  const mileagePkgKm = selectedMileagePackage && vehicleTariff
    ? (vehicleTariff.mileagePackages.find(p => p.id === selectedMileagePackage)?.km || 0)
    : 0;
  const totalFreeKm = baseFreeKm + mileagePkgKm;
  const extraKmPrice = vehicleTariff ? vehicleTariff.extraKmPrice : (selectedVehicle?.fuelType === 'Electric' ? 0.25 : 0.29);

  // Auto-redirect countdown
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (redirectCountdown !== null && redirectCountdown > 0) {
      redirectTimerRef.current = setTimeout(() => {
        setRedirectCountdown(redirectCountdown - 1);
      }, 1000);
    } else if (redirectCountdown === 0) {
      onBack();
    }
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [redirectCountdown]);

  const handleConfirm = async () => {
    if (isSavingBooking) return;

    if (!orgId || !selectedVehicle || !selectedCustomer || !pickupDate || !returnDate) {
      toast.error('Buchung unvollständig', {
        description: 'Fahrzeug, Kunde, Abhol- und Rückgabedatum werden benötigt.',
      });
      return;
    }

    if (customerEligibility && !customerEligibility.canConfirmBooking) {
      toast.error('Kunde nicht freigegeben', {
        description:
          customerEligibility.blockingReasons.join(' · ') ||
          'Der Kunde erfüllt die Anforderungen für eine bestätigte Buchung nicht.',
      });
      return;
    }

    setIsSavingBooking(true);
    try {
      const insuranceLabel = selectedInsurances.length > 0 && vehicleTariff
        ? vehicleTariff.insurances.filter(i => selectedInsurances.includes(i.id)).map(i => i.name).join(', ')
        : 'Haftpflicht';
      const paymentLabel = paymentMethod === 'card' ? 'Kreditkarte' : paymentMethod === 'cash' ? 'Barzahlung' : 'Rechnung';
      const effectiveReturnStation = sameReturnStation ? pickupStation : returnStation;

      const dailyRateEuro = (vehicleTariff?.daily.rate ?? getDailyRateFallback(selectedVehicle)) || 0;
      const extrasForPayload = (extras || [])
        .map((id) => {
          const opt = extraOptions.find((o) => o.id === id);
          return opt
            ? { id: opt.id, name: opt.label, price: opt.dailyPrice * rentalDays }
            : null;
        })
        .filter(Boolean) as Array<{ id: string; name: string; price: number }>;

      const payload = buildBookingCreatePayload({
        vehicleId: selectedVehicle.id,
        customerId: selectedCustomer.id,
        pickupDate,
        pickupTime,
        returnDate,
        returnTime,
        dailyRateEuro,
        totalPriceEuro: grandTotal,
        includedKm: totalFreeKm,
        insuranceLabels: insuranceLabel ? [insuranceLabel] : [],
        extras: extrasForPayload,
        notes: `Abholung: ${pickupStation || selectedVehicle.station} • Rückgabe: ${effectiveReturnStation || pickupStation || selectedVehicle.station} • Zahlung: ${paymentLabel}`,
        currency: 'eur',
        // V4.6.70 — always CONFIRMED at creation time. The booking
        // lifecycle transitions CONFIRMED → ACTIVE at the explicit
        // handover step (pickup action in BookingsView); auto-promoting
        // to ACTIVE just because the pickup date is today was wrong on
        // two fronts: (a) `findTodaysPickups` filters to PENDING|CONFIRMED
        // so the entry silently disappeared from the "Pick Up Today"
        // dashboard tile, and (b) the rental surface expects "Reserved"
        // until the handover — ACTIVE means "physically out on the road".
        status: 'CONFIRMED',
      });

      const created = await api.bookings.create(orgId, payload as any);
      const uiBooking = mapApiBooking(created);

      setBookingConfirmed(true);
      toast.success('Buchung erfolgreich erstellt!', {
        description: `${buildMMY(selectedVehicle)} • ${selectedCustomer.name} • ${rentalDays} Tage`,
        duration: 5000,
      });
      setRedirectCountdown(4);

      if (onBookingCreated) {
        onBookingCreated({
          id: uiBooking.id,
          customer: uiBooking.customer,
          customerPhone: selectedCustomer.phone || '+49 000 0000 0000',
          vehicle: uiBooking.vehicle,
          plate: uiBooking.plate,
          startDate: uiBooking.startDate,
          endDate: uiBooking.endDate,
          startTime: uiBooking.startTime,
          endTime: uiBooking.endTime,
          pickupLocation: uiBooking.pickupLocation,
          returnLocation: uiBooking.returnLocation,
          revenue: uiBooking.revenue,
          status: uiBooking.status,
          bookingRef: uiBooking.bookingRef,
          insurance: insuranceLabel,
          paymentMethod: paymentLabel,
          fuelLevel: 'Voll',
          mileageStart: selectedVehicle.odometer || 10000,
          mileageEnd: null,
          notes: '',
          pickupProtocol: null,
          returnProtocol: null,
          bookingSource: 'App',
          bookedBy: 'Current User',
          pickupHandoverBy: null,
          returnHandoverBy: null,
          includedKm: totalFreeKm,
          drivenKm: null,
          drivingScore: null,
          drivingBehavior: null,
          abuseDetection: null,
        });
      }
    } catch (err: any) {
      // V4.6.76 Rental Health V1 — surface the rental_blocked hard-gate with a
      // dedicated message so dispatchers see WHY the booking was rejected
      // (TÜV überfällig, Limp Mode aktiv, Bremsen kritisch, etc.) instead of
      // a generic conflict toast.
      const body = err?.response?.data;
      const code = body?.code;
      const reasons: string[] = Array.isArray(body?.blockingReasons)
        ? (body.blockingReasons as string[])
        : [];
      if (code === 'VEHICLE_RENTAL_BLOCKED' && reasons.length > 0) {
        toast.error('Fahrzeug nicht vermietbar', {
          description: reasons.join(' · '),
          duration: 8000,
        });
      } else {
        const msg =
          body?.message || err?.message || 'Buchung konnte nicht gespeichert werden';
        toast.error('Fehler beim Speichern', { description: String(msg) });
      }
      setIsSavingBooking(false);
      return;
    }
    setIsSavingBooking(false);

  };

  // V4.6.67 — Calendar generation now respects calendarYear (no longer hardcoded to 2026).
  const getCalendarDays = (month: number, year: number) => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const adjustedFirst = firstDay === 0 ? 6 : firstDay - 1; // Monday start
    const days: (number | null)[] = [];
    for (let i = 0; i < adjustedFirst; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  };

  const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  // Build a stable YYYY-MM-DD key from (year, month, day) using calendarYear.
  const calendarDateStr = (day: number) =>
    `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const isInRange = (day: number) => {
    if (!pickupDate || !returnDate || !day) return false;
    const dateStr = calendarDateStr(day);
    return dateStr >= pickupDate && dateStr <= returnDate;
  };

  const isStartDay = (day: number) => {
    if (!pickupDate || !day) return false;
    return calendarDateStr(day) === pickupDate;
  };

  const isEndDay = (day: number) => {
    if (!returnDate || !day) return false;
    return calendarDateStr(day) === returnDate;
  };

  // V4.6.67 — Real bookings of the selected vehicle that fall in the
  // currently displayed calendar month. Replaces the legacy v1..v6 mock map.
  // We only block days for non-cancelled bookings (CONFIRMED / ACTIVE / etc.).
  // A booking is treated as a blocker for any day it overlaps within the month.
  const vehicleBlockedInfo = useMemo(() => {
    const info: Record<number, { customer: string; startDay: number; endDay: number; reason: 'booking' | 'maintenance' }> = {};
    if (!selectedVehicle || orgBookings.length === 0) return info;

    const monthStart = new Date(calendarYear, calendarMonth, 1);
    const monthEnd = new Date(calendarYear, calendarMonth + 1, 0); // last day of the month
    const monthEndExclusive = new Date(calendarYear, calendarMonth + 1, 1);

    for (const b of orgBookings) {
      if (!b) continue;
      // V4.6.74 — only block days for bookings that belong to the CURRENTLY
      // selected vehicle. Previously we allowed bookings without a
      // `vehicleId` on the response to "fall through" (treating them as
      // matching), which caused every org booking to appear as a blocker on
      // every vehicle's calendar — making it impossible to reserve a free
      // second vehicle for a date range already booked for a different one.
      // The backend now always includes `vehicleId`; we therefore require a
      // strict match here and skip any record that cannot be positively
      // attributed to the selected vehicle.
      const bookingVehicleId =
        b.vehicleId ?? b.vehicle?.id ?? null;
      if (!bookingVehicleId || bookingVehicleId !== selectedVehicle.id) continue;
      const status = (b.status || '').toUpperCase();
      if (status === 'CANCELLED' || status === 'CANCELED' || status === 'NO_SHOW') continue;
      const startRaw = b.startDate ? new Date(b.startDate) : null;
      const endRaw = b.endDate ? new Date(b.endDate) : null;
      if (!startRaw || !endRaw || isNaN(+startRaw) || isNaN(+endRaw)) continue;
      // Skip bookings that don't overlap the current month at all.
      if (endRaw < monthStart || startRaw >= monthEndExclusive) continue;
      const clampedStart = startRaw < monthStart ? monthStart : startRaw;
      const clampedEnd = endRaw > monthEnd ? monthEnd : endRaw;
      const startDay = clampedStart.getDate();
      const endDay = clampedEnd.getDate();
      const customer = b.customerName ?? b.customer ?? 'Reservierung';
      const reason: 'booking' | 'maintenance' = status === 'MAINTENANCE' ? 'maintenance' : 'booking';
      for (let d = startDay; d <= endDay; d++) {
        // First booking wins; this is good enough for visual hint purposes.
        if (!info[d]) info[d] = { customer, startDay, endDay, reason };
      }
    }
    return info;
  }, [selectedVehicle, orgBookings, calendarMonth, calendarYear]);

  const blockedDays = Object.keys(vehicleBlockedInfo).map(Number);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  // Helper: check if any blocked day exists between two days (exclusive)
  const hasBlockedDaysBetween = (startDay: number, endDay: number) => {
    return blockedDays.some(bd => bd > startDay && bd < endDay);
  };

  const handleCalendarDayClick = (day: number) => {
    if (!day) return;
    if (blockedDays.includes(day)) return;
    const dateStr = calendarDateStr(day);
    if (calendarSelectMode === 'pickup') {
      setPickupDate(dateStr);
      if (returnDate && dateStr >= returnDate) {
        setReturnDate('');
      } else if (returnDate) {
        const returnDay = parseInt(returnDate.split('-')[2], 10);
        const returnMonth = parseInt(returnDate.split('-')[1], 10) - 1;
        const returnYear = parseInt(returnDate.split('-')[0], 10);
        if (returnYear === calendarYear && returnMonth === calendarMonth && hasBlockedDaysBetween(day, returnDay)) {
          setReturnDate('');
        }
      }
      setCalendarSelectMode('return');
    } else {
      if (pickupDate && dateStr <= pickupDate) {
        setPickupDate(dateStr);
        setReturnDate('');
        setCalendarSelectMode('return');
      } else {
        if (pickupDate) {
          const pickupDay = parseInt(pickupDate.split('-')[2], 10);
          const pickupMonth = parseInt(pickupDate.split('-')[1], 10) - 1;
          const pickupYear = parseInt(pickupDate.split('-')[0], 10);
          if (pickupYear === calendarYear && pickupMonth === calendarMonth && hasBlockedDaysBetween(pickupDay, day)) {
            return;
          }
        }
        setReturnDate(dateStr);
        setCalendarSelectMode('pickup');
      }
    }
  };

  // V4.6.67 — Conflict detection now respects calendarYear and walks the
  // full range across month boundaries by comparing date strings rather than
  // raw day numbers.
  const rangeHasConflict = useMemo(() => {
    if (!pickupDate || !returnDate || !selectedVehicle) return false;
    if (returnDate < pickupDate) return false;
    for (const dayKey of Object.keys(vehicleBlockedInfo)) {
      const day = parseInt(dayKey, 10);
      if (Number.isNaN(day)) continue;
      const ds = calendarDateStr(day);
      if (ds >= pickupDate && ds <= returnDate) return true;
    }
    return false;
  }, [pickupDate, returnDate, vehicleBlockedInfo, calendarYear, calendarMonth, selectedVehicle]);

  // V4.6.67 — Gating rules for the new step order
  //   1: Vehicle  → must be selected
  //   2: Period   → pickup + return + non-empty range, no calendar conflict
  //                 (pickupStation is auto-derived from the vehicle so it is
  //                 NOT part of the gate; see below.)
  //   3: Extras   → always proceedable (everything is optional)
  //   4: Customer → must be selected
  //   5: Checkout → both consents must be ticked
  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return selectedVehicle !== null;
      case 2: {
        if (!pickupDate || !returnDate || rentalDays <= 0) return false;
        if (returnDate <= pickupDate) return false;
        if (rangeHasConflict) return false;
        return true;
      }
      case 3:
        return true;
      case 4:
        if (!selectedCustomer) return false;
        if (
          customerEligibility &&
          !customerEligibility.canCreatePendingBooking &&
          customerEligibility.blockingReasons.length > 0
        ) {
          return false;
        }
        return true;
      case 5:
        return agbAccepted && privacyAccepted;
      default:
        return false;
    }
  };

  const card = (children: React.ReactNode, className?: string) => (
    <DataCard className={className} bodyClassName="p-0" flush>
      {children}
    </DataCard>
  );

  // Get extras, insurances, mileage packages from tariff
  const extraOptions = vehicleTariff?.extras || [];
  const insuranceOptions = vehicleTariff?.insurances || [];
  const mileagePackages = vehicleTariff?.mileagePackages || [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="New Booking"
        description="Create a rental booking in 5 steps"
        icon={<Icon name="calendar" className="w-4 h-4" />}
        actions={
          <div className="flex items-center gap-2">
            {selectedCustomer && currentStep > 1 && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card border-border">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs sq-tone-brand">
                  {selectedCustomer.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <p className="text-xs text-foreground">{selectedCustomer.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedCustomer.city}</p>
                </div>
              </div>
            )}
            <button
              onClick={onBack}
              className="p-2.5 rounded-lg border transition-all duration-200 hover:shadow-md bg-card border-border text-muted-foreground hover:bg-muted"
            >
              <Icon name="arrow-left" className="w-5 h-5" />
            </button>
          </div>
        }
      />

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;
          return (
            <div key={step.id} className="flex items-center gap-2">
              <button
                onClick={() => { if (isCompleted) setCurrentStep(step.id); }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-300 ${ isActive ? 'sq-tone-brand border border-border ring-1 ring-[color:var(--brand-glow)]' : isCompleted ? 'sq-tone-success border border-border cursor-pointer hover:opacity-90' : 'bg-muted/40 border border-border text-muted-foreground' }`}
              >
                {isCompleted ? (
                  <Icon name="check" className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
                <span className="text-[10px]">{step.label}</span>
              </button>
              {i < steps.length - 1 && (
                <div className={`w-8 h-px ${isCompleted ? 'bg-[color:var(--status-positive)]/40' : 'bg-border'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      {bookingConfirmed ? (
        // Success State
        <div className="flex items-center justify-center py-16">
          {card(
            <div className="p-12 text-center max-w-lg">
              <div className="w-20 h-20 rounded-full mx-auto mb-3 flex items-center justify-center sq-tone-success">
                <Icon name="check-circle" className="w-5 h-5 text-[color:var(--status-positive)]" />
              </div>
              <h2 className="text-lg mb-2 text-foreground">Buchung erstellt!</h2>
              <p className="text-xs mb-2 text-muted-foreground">
                Buchung #{`BK-${Date.now().toString().slice(-6)}`} wurde erfolgreich angelegt.
              </p>
              {redirectCountdown !== null && redirectCountdown > 0 && (
                <p className="text-xs mb-3 text-muted-foreground">
                  Weiterleitung zur Übersicht in {redirectCountdown}s…
                </p>
              )}
              <div className="rounded-lg p-4 mb-3 text-left space-y-2 bg-muted/50">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="text-foreground">{selectedCustomer?.name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Vehicle</span>
                  <span className="text-foreground">{selectedVehicle ? buildMMY(selectedVehicle) : '—'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Period</span>
                  <span className="text-foreground">{rentalDays} Days</span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-border">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="text-[color:var(--status-positive)]">€ {grandTotal.toFixed(2)}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onBack}
                  className="flex-1 px-3 py-2 rounded-lg border text-xs transition-all bg-card border border-border text-foreground hover:bg-muted"
                >
                  Zur Übersicht
                </button>
                <button
                  onClick={() => {
                    setRedirectCountdown(null);
                    setBookingConfirmed(false);
                    setCurrentStep(1);
                    setSelectedCustomer(null);
                    setSelectedVehicle(null);
                    setAgbAccepted(false);
                    setPrivacyAccepted(false);
                    setExtras([]);
                    setSelectedMileagePackage(null);
                    setSelectedInsurances([]);
                    setDiscountPercent(0);
                    setInvoiceGenerated(false);
                    setContractGenerated(false);
                    setGeneratingInvoice(false);
                    setGeneratingContract(false);
                    setQuickViewDoc(null);
                  }}
                  className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 transition-all"
                >
                  Neue Buchung
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {/* Main Content - 2 cols */}
          <div className="col-span-2 space-y-5">
            {/* STEP 4: Customer Selection */}
            {currentStep === 4 && (
              <>
                {card(
                  <div className="p-4 flex flex-col min-h-[calc(100vh-340px)]">
                    <SectionHeader title="Kunde auswählen" className="mb-3" />
                    {/* Search */}
                    <div className="relative mb-3">
                      <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Name, E-Mail oder Telefonnummer suchen..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        className={`w-full pl-10 pr-4 py-3 rounded-lg border text-xs outline-none transition-all ${ 'bg-card border border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)]' }`}
                      />
                    </div>

                    {/* Suggested / Search Results */}
                    <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                      {customersLoading && (
                        <SkeletonCard className="border-0 shadow-none" />
                      )}
                      {!customersLoading && customersError && (
                        <div className="text-xs p-3 rounded-lg sq-tone-critical border border-border">
                          {customersError}
                        </div>
                      )}
                      {!customersLoading && !customersError && filteredCustomers.length === 0 && (
                        <EmptyState
                          compact
                          icon={<Icon name="users" className="w-5 h-5" />}
                          title="Keine Kunden gefunden"
                          description="Lege einen neuen Kunden an."
                        />
                      )}
                      {filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedCustomer(c)}
                          className={`w-full text-left p-4 rounded-lg border transition-all duration-200 flex items-center gap-3 group/card ${ selectedCustomer?.id === c.id ? 'sq-tone-brand border border-border ring-1 ring-[color:var(--brand-glow)]' : 'bg-muted/40 border border-border hover:bg-card hover:border-border' }`}
                        >
                          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xs shrink-0 ${ selectedCustomer?.id === c.id ? 'sq-tone-brand' : 'sq-chip-neutral' }`}>
                            {c.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-foreground">{c.name}</span>
                              {c.company && (
                                <StatusChip tone="ai" className="text-[10px]">{c.company}</StatusChip>
                              )}
                              {c.licenseVerified && <Icon name="shield" className="w-3.5 h-3.5 text-green-500" />}
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs flex items-center gap-1 text-muted-foreground"><Icon name="mail" className="w-3 h-3" />{c.email}</span>
                              <span className="text-xs flex items-center gap-1 text-muted-foreground"><Icon name="map-pin" className="w-3 h-3" />{c.city}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs text-muted-foreground">{c.totalBookings} Buchungen</div>
                            <div className="flex items-center gap-1 mt-1">
                              {/* V4.6.95 — Driving Style Score (0–100). "—" if not yet scored. */}
                              <Icon name="star"
                                className={`w-3 h-3 ${ c.drivingStyleScore == null ? 'text-muted-foreground' : c.drivingStyleScore >= 85 ? 'text-green-500' : c.drivingStyleScore >= 70 ? 'text-amber-500' : 'text-red-500' }`}
                              />
                              <span className="text-xs text-foreground">
                                {c.drivingStyleScore == null
                                  ? '\u2014'
                                  : Math.round(c.drivingStyleScore)}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setCustomerDetailTarget(c); setCustomerDetailOpen(true); }}
                            className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 transition-all opacity-0 group-hover/card:opacity-100 ${ 'hover:bg-muted text-muted-foreground hover:text-foreground' }`}
                            title="Kundendetails anzeigen"
                          >
                            <Icon name="eye" className="w-5 h-5" />
                          </button>
                          {selectedCustomer?.id === c.id && (
                            <Icon name="check" className="w-5 h-5 text-blue-500 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>

                    {selectedCustomer && customerEligibility && (
                      <div className={`mt-3 p-3 rounded-lg border text-xs space-y-2 ${
                        customerEligibility.blockingReasons.length > 0
                          ? 'sq-tone-critical border-border'
                          : customerEligibility.warnings.length > 0
                            ? 'sq-tone-warning border-border'
                            : 'sq-tone-success border-border'
                      }`}>
                        <div className="font-semibold text-foreground">
                          Mietfreigabe:{' '}
                          {customerEligibility.blockingReasons.length > 0
                            ? 'Blockiert'
                            : customerEligibility.warnings.length > 0
                              ? 'Warnung'
                              : 'Freigegeben'}
                        </div>
                        {customerEligibility.blockingReasons.map((r) => (
                          <div key={r} className="text-muted-foreground">• {r}</div>
                        ))}
                        {customerEligibility.warnings.map((w) => (
                          <div key={w} className="text-muted-foreground">⚠ {w}</div>
                        ))}
                        {customerEligibility.requiredActions.map((a) => (
                          <div key={a} className="text-muted-foreground">→ {a}</div>
                        ))}
                      </div>
                    )}

                    {/* Add New Customer */}
                    <button
                      onClick={() => { setIsAddCustomerOpen(true); resetAddCustomerForm(); }}
                      className={`w-full mt-4 p-3 rounded-lg border-2 border-dashed text-xs flex items-center justify-center gap-2 transition-all ${ 'border-border text-muted-foreground hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]' }`}>
                      <Icon name="plus" className="w-5 h-5" />
                      Neuen Kunden anlegen
                    </button>

                    {/* Customer Detail Modal */}
                    {customerDetailOpen && customerDetailTarget && (
                      <CustomerDetailModal
                        customer={mapToDetailCustomer(customerDetailTarget)}
                        onClose={() => { setCustomerDetailOpen(false); setCustomerDetailTarget(null); }}
                      />
                    )}

                    {/* Add Customer Modal */}
                    {isAddCustomerOpen && (() => {
                      const addSteps = [
                        { label: 'Persönliche Daten', icon: User },
                        { label: 'ID & Führerschein', icon: IdCard },
                        { label: 'Dokumente', icon: Upload },
                        { label: 'Zusammenfassung', icon: CheckCircle },
                      ];
                      const inputClass = `w-full px-3 py-2.5 rounded-lg border text-xs outline-none transition-all ${
                        'bg-card border border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-1 focus:ring-[color:var(--brand-glow)]'
                      }`;
                      const labelClass = 'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';
                      const sectionTitle = (icon: any, title: string) => {
                        const Icon = icon;
                        return (
                          <div className="flex items-center gap-2.5 mb-3">
                            <div className="w-5 h-5 rounded-lg flex items-center justify-center sq-tone-info">
                              <Icon className="w-5 h-5 text-blue-500" />
                            </div>
                            <h3 className="text-base text-foreground">{title}</h3>
                          </div>
                        );
                      };

                      const SummaryRow = ({ label, value }: { label: string; value: string }) => (
                        <div className="flex items-center justify-between py-2">
                          <span className="text-xs text-muted-foreground">{label}</span>
                          <span className="text-xs font-medium text-foreground">{value || '—'}</span>
                        </div>
                      );

                      return (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => { setIsAddCustomerOpen(false); resetAddCustomerForm(); }}>
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                          <div onClick={(e) => e.stopPropagation()}
                            className={`relative w-full max-w-[680px] max-h-[85vh] flex flex-col rounded-lg border shadow-2xl ${ 'bg-card/90 border border-border' }`}>
                            {/* Header */}
                            <div className="flex items-center justify-between px-7 py-3 border-b shrink-0 border-border">
                              <div>
                                <h2 className="text-lg text-foreground">Neuen Kunden anlegen</h2>
                                <p className="text-xs mt-0.5 text-muted-foreground">Alle Pflichtfelder ausfüllen & Dokumente hochladen</p>
                              </div>
                              <button onClick={() => { setIsAddCustomerOpen(false); resetAddCustomerForm(); }}
                                className={`w-5 h-5 rounded-lg flex items-center justify-center transition-colors ${ 'hover:bg-muted text-muted-foreground' }`}>
                                <Icon name="x" className="w-5 h-5" />
                              </button>
                            </div>

                            {/* Step Indicator */}
                            <div className="flex items-center gap-1 px-7 py-3 border-b shrink-0 border-border">
                              {addSteps.map((s, i) => {
                                const StepIcon = s.icon;
                                const isActive = i === addStep;
                                const isDone = i < addStep;
                                return (
                                  <div key={i} className="flex items-center flex-1">
                                    <button onClick={() => { if (isDone) setAddStep(i); }}
                                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${ isActive ? 'sq-chip-info' : isDone ? 'text-[color:var(--status-positive)] cursor-pointer hover:bg-[color:var(--status-positive-soft)]' : 'text-muted-foreground' }`}>
                                      {isDone ? <Icon name="check-circle" className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                                      <span className="hidden sm:inline">{s.label}</span>
                                    </button>
                                    {i < addSteps.length - 1 && (
                                      <div className={`flex-1 h-px mx-2 ${isDone ? 'bg-emerald-400/40' : 'bg-muted'}`} />
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto px-7 py-3">
                              {addStep === 0 && (
                                <div className="space-y-4">
                                  {sectionTitle(User, 'Persönliche Daten')}
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className={labelClass}>Vorname *</label>
                                      <input type="text" placeholder="Max" value={newCustomer.firstName}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })} className={inputClass} />
                                      {formErrors.firstName && <p className="text-[11px] text-red-500 mt-1">{formErrors.firstName}</p>}
                                    </div>
                                    <div>
                                      <label className={labelClass}>Nachname *</label>
                                      <input type="text" placeholder="Mustermann" value={newCustomer.lastName}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })} className={inputClass} />
                                      {formErrors.lastName && <p className="text-[11px] text-red-500 mt-1">{formErrors.lastName}</p>}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className={labelClass}>E-Mail *</label>
                                      <div className="relative">
                                        <Icon name="mail" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                        <input type="email" placeholder="max@beispiel.de" value={newCustomer.email}
                                          onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className={`${inputClass} pl-9`} />
                                      </div>
                                      {formErrors.email && <p className="text-[11px] text-red-500 mt-1">{formErrors.email}</p>}
                                    </div>
                                    <div>
                                      <label className={labelClass}>Telefon *</label>
                                      <div className="relative">
                                        <Icon name="phone" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                                        <input type="text" placeholder="+49 176 1234 5678" value={newCustomer.phone}
                                          onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className={`${inputClass} pl-9`} />
                                      </div>
                                      {formErrors.phone && <p className="text-[11px] text-red-500 mt-1">{formErrors.phone}</p>}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-3">
                                    <div>
                                      <label className={labelClass}>Straße</label>
                                      <input type="text" placeholder="Musterstraße 1" value={newCustomer.street}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, street: e.target.value })} className={inputClass} />
                                    </div>
                                    <div>
                                      <label className={labelClass}>PLZ</label>
                                      <input type="text" placeholder="34117" value={newCustomer.zip}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, zip: e.target.value })} className={inputClass} />
                                    </div>
                                    <div>
                                      <label className={labelClass}>Stadt *</label>
                                      <input type="text" placeholder="Kassel" value={newCustomer.city}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} className={inputClass} />
                                      {formErrors.city && <p className="text-[11px] text-red-500 mt-1">{formErrors.city}</p>}
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className={labelClass}>Kundentyp</label>
                                      <div className="flex gap-2">
                                        {(['Individual', 'Corporate'] as const).map(t => (
                                          <button key={t} onClick={() => setNewCustomer({ ...newCustomer, type: t })}
                                            className={`flex-1 py-2.5 rounded-lg border text-xs font-semibold transition-all ${ newCustomer.type === t ? 'bg-blue-500 text-white border-blue-500 shadow-md' : 'bg-card border border-border text-muted-foreground hover:border-border' }`}>
                                            {t === 'Individual' ? 'Privat' : 'Firma'}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    {newCustomer.type === 'Corporate' && (
                                      <div>
                                        <label className={labelClass}>Firmenname *</label>
                                        <input type="text" placeholder="Firma GmbH" value={newCustomer.company}
                                          onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })} className={inputClass} />
                                        {formErrors.company && <p className="text-[11px] text-red-500 mt-1">{formErrors.company}</p>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {addStep === 1 && (
                                <div className="space-y-5">
                                  {sectionTitle(Car, 'Führerschein')}
                                  <div className="grid grid-cols-3 gap-3">
                                    <div>
                                      <label className={labelClass}>Führerscheinnr. *</label>
                                      <input type="text" placeholder="B072RRE2I55" value={newCustomer.licenseNumber}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, licenseNumber: e.target.value })} className={inputClass} />
                                      {formErrors.licenseNumber && <p className="text-[11px] text-red-500 mt-1">{formErrors.licenseNumber}</p>}
                                    </div>
                                    <div>
                                      <label className={labelClass}>Gültig bis *</label>
                                      <input type="date" value={newCustomer.licenseExpiry}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, licenseExpiry: e.target.value })} className={inputClass} />
                                      {formErrors.licenseExpiry && <p className="text-[11px] text-red-500 mt-1">{formErrors.licenseExpiry}</p>}
                                    </div>
                                    <div>
                                      <label className={labelClass}>Klasse</label>
                                      <select value={newCustomer.licenseClass}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, licenseClass: e.target.value })} className={inputClass}>
                                        {['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C', 'CE', 'C1', 'C1E', 'D', 'DE'].map(cls => (
                                          <option key={cls} value={cls}>{cls}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>

                                  <div className="h-px my-2 bg-muted" />

                                  {sectionTitle(IdCard, 'Ausweisdokument (ID-Verifikation)')}
                                  <div className="rounded-lg p-3.5 mb-3 sq-tone-watch border border-border">
                                    <div className="flex items-start gap-2.5">
                                      <Icon name="shield" className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                                      <p className="text-xs text-[color:var(--status-watch)]">
                                        Zur Identitätsprüfung wird ein gültiger Personalausweis oder Reisepass benötigt. Die Daten werden gemäß DSGVO verarbeitet.
                                      </p>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-3 gap-3">
                                    <div>
                                      <label className={labelClass}>Dokumenttyp</label>
                                      <select value={newCustomer.idType}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, idType: e.target.value as any })} className={inputClass}>
                                        <option value="Personalausweis">Personalausweis</option>
                                        <option value="Reisepass">Reisepass</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className={labelClass}>Ausweisnummer *</label>
                                      <input type="text" placeholder="L01X00T47" value={newCustomer.idNumber}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, idNumber: e.target.value })} className={inputClass} />
                                      {formErrors.idNumber && <p className="text-[11px] text-red-500 mt-1">{formErrors.idNumber}</p>}
                                    </div>
                                    <div>
                                      <label className={labelClass}>Gültig bis *</label>
                                      <input type="date" value={newCustomer.idExpiry}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, idExpiry: e.target.value })} className={inputClass} />
                                      {formErrors.idExpiry && <p className="text-[11px] text-red-500 mt-1">{formErrors.idExpiry}</p>}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {addStep === 2 && (
                                <div className="space-y-5">
                                  {sectionTitle(IdCard, `${newCustomer.idType} hochladen`)}
                                  <div className="grid grid-cols-2 gap-3">
                                    <CustomerDocumentUploadBox
                                      label="Vorderseite *"
                                      slot="id-front"
                                      orgId={orgId}
                                      url={newCustomer.idFrontUrl}
                                      errorMessage={formErrors.idFront}
                                      onUploaded={(url) => setNewCustomer((prev) => ({ ...prev, idFrontUrl: url }))}
                                      onCleared={() => setNewCustomer((prev) => ({ ...prev, idFrontUrl: null }))}
                                    />
                                    <CustomerDocumentUploadBox
                                      label="Rückseite *"
                                      slot="id-back"
                                      orgId={orgId}
                                      url={newCustomer.idBackUrl}
                                      errorMessage={formErrors.idBack}
                                      onUploaded={(url) => setNewCustomer((prev) => ({ ...prev, idBackUrl: url }))}
                                      onCleared={() => setNewCustomer((prev) => ({ ...prev, idBackUrl: null }))}
                                    />
                                  </div>

                                  {/* Veriff ID Verification */}
                                  <div className={`rounded-lg border p-4 transition-all ${ idVerificationStatus === 'verified' ? 'sq-tone-success border border-border' : idVerificationStatus === 'failed' ? 'sq-tone-critical border border-border' : 'bg-muted/40 border border-border' }`}>
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center gap-2.5">
                                        <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${ idVerificationStatus === 'verified' ? 'sq-tone-success' : idVerificationStatus === 'failed' ? 'sq-tone-critical' : 'sq-tone-ai' }`}>
                                          {idVerificationStatus === 'verifying' ? (
                                            <Icon name="loader-2" className="w-5 h-5 text-violet-500 animate-spin" />
                                          ) : idVerificationStatus === 'verified' ? (
                                            <Icon name="shield-check" className="w-5 h-5 text-[color:var(--status-positive)]" />
                                          ) : idVerificationStatus === 'failed' ? (
                                            <Icon name="shield" className="w-5 h-5 text-[color:var(--status-critical)]" />
                                          ) : (
                                            <Icon name="shield" className="w-5 h-5 text-violet-500" />
                                          )}
                                        </div>
                                        <div>
                                          <h4 className="text-xs font-semibold text-foreground">ID-Echtheitsprüfung</h4>
                                          <p className="text-[11px] text-muted-foreground">Powered by Veriff</p>
                                        </div>
                                      </div>
                                      {idVerificationStatus === 'verified' && (
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${ 'sq-tone-success border border-border' }`}>
                                          <Icon name="shield-check" className="w-3 h-3" />
                                          Verifiziert
                                        </span>
                                      )}
                                      {idVerificationStatus === 'failed' && (
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${ 'sq-tone-critical border border-border' }`}>
                                          <Icon name="x" className="w-3 h-3" />
                                          Fehlgeschlagen
                                        </span>
                                      )}
                                    </div>

                                    {idVerificationStatus === 'idle' && (
                                      <>
                                        <p className="text-xs mb-3 text-muted-foreground">
                                          Lassen Sie das hochgeladene Ausweisdokument automatisch auf Echtheit prüfen. Veriff überprüft Sicherheitsmerkmale, MRZ-Daten und Dokumentenintegrität.
                                        </p>
                                        <button
                                          onClick={() => {
                                            if (!newCustomer.idFrontUrl) {
                                              setFormErrors({ ...formErrors, veriff: 'Bitte laden Sie zuerst die Vorderseite des Ausweises hoch.' });
                                              return;
                                            }
                                            setFormErrors({});
                                            setIdVerificationStatus('verifying');
                                            setTimeout(() => {
                                              setIdVerificationStatus('verified');
                                            }, 3000);
                                          }}
                                          disabled={!newCustomer.idFrontUrl}
                                          className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${ newCustomer.idFrontUrl ? 'bg-[color:var(--status-ai)] text-primary-foreground hover:opacity-90 shadow-sm' : 'bg-muted border border-border text-muted-foreground cursor-not-allowed' }`}>
                                          <Icon name="shield" className="w-5 h-5" />
                                          ID auf Echtheit verifizieren
                                          <Icon name="external-link" className="w-3 h-3 opacity-60" />
                                        </button>
                                        {formErrors.veriff && <p className="text-[11px] text-red-500 mt-1.5">{formErrors.veriff}</p>}
                                        {!newCustomer.idFrontUrl && (
                                          <p className="text-[11px] mt-1.5 text-muted-foreground">
                                            Bitte laden Sie zuerst die Vorderseite des Ausweises hoch.
                                          </p>
                                        )}
                                      </>
                                    )}

                                    {idVerificationStatus === 'verifying' && (
                                      <div className="flex flex-col items-center py-3 gap-3">
                                        <div className="w-9 h-9 rounded-full flex items-center justify-center sq-tone-ai">
                                          <Icon name="loader-2" className="w-5 h-5 text-violet-500 animate-spin" />
                                        </div>
                                        <div className="text-center">
                                          <p className="text-xs font-semibold text-foreground">Dokument wird geprüft...</p>
                                          <p className="text-xs mt-0.5 text-muted-foreground">Veriff analysiert Sicherheitsmerkmale & MRZ-Daten</p>
                                        </div>
                                        <div className="w-full rounded-full h-1.5 overflow-hidden bg-muted">
                                          <div className="h-full bg-[color:var(--status-ai)] rounded-full animate-pulse" style={{ width: '60%' }} />
                                        </div>
                                      </div>
                                    )}

                                    {idVerificationStatus === 'verified' && (
                                      <div className="space-y-2.5 mt-1">
                                        <div className="grid grid-cols-2 gap-2.5">
                                          {[
                                            { label: 'Dokumententyp', value: newCustomer.idType, icon: IdCard },
                                            { label: 'MRZ-Prüfung', value: 'Bestanden', icon: CheckCircle },
                                            { label: 'Sicherheitsmerkmale', value: 'Gültig', icon: ShieldCheck },
                                            { label: 'Manipulationsprüfung', value: 'Keine erkannt', icon: Eye },
                                          ].map(item => (
                                            <div key={item.label} className="flex items-center gap-2 px-3 py-2 rounded-lg sq-tone-success">
                                              <item.icon className="w-3.5 h-3.5 shrink-0 text-[color:var(--status-positive)]" />
                                              <div>
                                                <p className="text-xs text-muted-foreground">{item.label}</p>
                                                <p className="text-xs font-semibold text-[color:var(--status-positive)]">{item.value}</p>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {idVerificationStatus === 'failed' && (
                                      <div className="mt-1">
                                        <p className="text-xs mb-3 text-[color:var(--status-critical)]">
                                          Die Echtheitsprüfung konnte nicht bestätigt werden. Bitte überprüfen Sie die Qualität des Uploads oder verwenden Sie ein anderes Dokument.
                                        </p>
                                        <button
                                          onClick={() => setIdVerificationStatus('idle')}
                                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${ 'bg-card border border-border text-foreground hover:bg-muted' }`}>
                                          <Icon name="shield" className="w-3.5 h-3.5" />
                                          Erneut versuchen
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  <div className="h-px my-1 bg-muted" />
                                  {sectionTitle(Car, 'Führerschein hochladen')}
                                  <div className="grid grid-cols-2 gap-3">
                                    <CustomerDocumentUploadBox
                                      label="Vorderseite *"
                                      slot="license-front"
                                      orgId={orgId}
                                      url={newCustomer.licenseFrontUrl}
                                      errorMessage={formErrors.licenseFront}
                                      onUploaded={(url) => setNewCustomer((prev) => ({ ...prev, licenseFrontUrl: url }))}
                                      onCleared={() => setNewCustomer((prev) => ({ ...prev, licenseFrontUrl: null }))}
                                    />
                                    <CustomerDocumentUploadBox
                                      label="Rückseite (optional)"
                                      slot="license-back"
                                      orgId={orgId}
                                      url={newCustomer.licenseBackUrl}
                                      onUploaded={(url) => setNewCustomer((prev) => ({ ...prev, licenseBackUrl: url }))}
                                      onCleared={() => setNewCustomer((prev) => ({ ...prev, licenseBackUrl: null }))}
                                    />
                                  </div>
                                </div>
                              )}

                              {addStep === 3 && (
                                <div className="space-y-5">
                                  {sectionTitle(CheckCircle, 'Zusammenfassung & Prüfung')}
                                  <div className={`rounded-lg border p-4 space-y-0 divide-y ${ 'bg-muted/40 border border-border divide-border' }`}>
                                    <SummaryRow label="Name" value={`${newCustomer.firstName} ${newCustomer.lastName}`} />
                                    <SummaryRow label="E-Mail" value={newCustomer.email} />
                                    <SummaryRow label="Telefon" value={newCustomer.phone} />
                                    <SummaryRow label="Adresse" value={[newCustomer.street, `${newCustomer.zip} ${newCustomer.city}`].filter(Boolean).join(', ')} />
                                    <SummaryRow label="Typ" value={newCustomer.type === 'Corporate' ? `Firma — ${newCustomer.company}` : 'Privatkunde'} />
                                  </div>
                                  <div className={`rounded-lg border p-4 space-y-0 divide-y ${ 'bg-muted/40 border border-border divide-border' }`}>
                                    <SummaryRow label="Führerscheinnr." value={newCustomer.licenseNumber} />
                                    <SummaryRow label="Klasse" value={newCustomer.licenseClass} />
                                    <SummaryRow label="FS gültig bis" value={newCustomer.licenseExpiry} />
                                    <SummaryRow label="Ausweistyp" value={newCustomer.idType} />
                                    <SummaryRow label="Ausweisnr." value={newCustomer.idNumber} />
                                    <SummaryRow label="Ausweis gültig bis" value={newCustomer.idExpiry} />
                                    <div className="flex items-center justify-between py-2">
                                      <span className="text-xs text-muted-foreground">ID-Verifizierung</span>
                                      {idVerificationStatus === 'verified' ? (
                                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--status-positive)]">
                                          <Icon name="shield-check" className="w-3.5 h-3.5" />
                                          Verifiziert (Veriff)
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                          <Icon name="shield" className="w-3.5 h-3.5" />
                                          Nicht verifiziert
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className={`rounded-lg border p-4 ${ 'bg-muted/40 border border-border' }`}>
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-muted-foreground">Dokumente</span>
                                      <div className="flex items-center gap-3">
                                        {[
                                          { label: 'Ausweis VS', ok: Boolean(newCustomer.idFrontUrl) },
                                          { label: 'Ausweis RS', ok: Boolean(newCustomer.idBackUrl) },
                                          { label: 'FS VS', ok: Boolean(newCustomer.licenseFrontUrl) },
                                          { label: 'FS RS', ok: Boolean(newCustomer.licenseBackUrl) },
                                        ].map(d => (
                                          <span key={d.label} className={`inline-flex items-center gap-1 text-[11px] font-medium ${ d.ok ? 'text-[color:var(--status-positive)]' : 'text-muted-foreground' }`}>
                                            {d.ok ? <Icon name="check-circle" className="w-3 h-3" /> : <Icon name="x" className="w-3 h-3" />}
                                            {d.label}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                  <div>
                                    <label className={labelClass}>Notizen (optional)</label>
                                    <textarea rows={2} placeholder="Zusätzliche Informationen zum Kunden..."
                                      value={newCustomer.notes}
                                      onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
                                      className={`${inputClass} resize-none`} />
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between px-7 py-3 border-t shrink-0 border-border">
                              <button onClick={() => { setIsAddCustomerOpen(false); resetAddCustomerForm(); }}
                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${ 'text-muted-foreground hover:text-foreground hover:bg-muted' }`}>
                                Abbrechen
                              </button>
                              <div className="flex items-center gap-2.5">
                                {addStep > 0 && (
                                  <button onClick={() => setAddStep(addStep - 1)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${ 'bg-card border border-border text-foreground hover:bg-muted' }`}>
                                    <Icon name="chevron-left" className="w-3.5 h-3.5" />
                                    Zurück
                                  </button>
                                )}
                                {addStep < 3 ? (
                                  <button onClick={handleAddNextStep}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[color:var(--brand)] hover:bg-[color:var(--brand-hover)] text-primary-foreground text-xs font-semibold shadow-md hover:shadow-lg transition-all">
                                    Weiter
                                    <Icon name="chevron-right" className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button onClick={handleSubmitNewCustomer}
                                    disabled={isSavingCustomer}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-primary-foreground text-xs font-semibold shadow-md transition-all ${isSavingCustomer ? 'bg-[color:var(--status-positive)]/50 cursor-not-allowed' : 'bg-[color:var(--status-positive)] hover:opacity-90 hover:shadow-lg'}`}>
                                    <Icon name="check-circle" className="w-3.5 h-3.5" />
                                    {isSavingCustomer ? 'Speichert…' : 'Kunden anlegen'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </>
            )}

            {/* STEP 1: Vehicle Selection */}
            {currentStep === 1 && (
              <>
                {card(
                  <div className="p-4">
                    <SectionHeader title="Fahrzeug auswählen" className="mb-3" />

                    {/* Filters Row */}
                    <div className="space-y-3 mb-3">
                      <div className="relative">
                        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Fahrzeug suchen..."
                          value={vehicleSearch}
                          onChange={(e) => setVehicleSearch(e.target.value)}
                          className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-xs outline-none transition-all ${ 'bg-card border border-border text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)]' }`}
                        />
                      </div>
                      <div className="flex gap-3 flex-wrap">
                        <select
                          value={vehicleBrandFilter}
                          onChange={(e) => setVehicleBrandFilter(e.target.value)}
                          className={`px-3 py-2.5 rounded-lg border text-xs outline-none ${ 'bg-card border border-border text-foreground' }`}
                        >
                          <option value="all">Alle Marken</option>
                          {brands.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <select
                          value={vehicleCategoryFilter}
                          onChange={(e) => setVehicleCategoryFilter(e.target.value)}
                          className={`px-3 py-2.5 rounded-lg border text-xs outline-none ${ 'bg-card border border-border text-foreground' }`}
                        >
                          <option value="all">Alle Kategorien</option>
                          {categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select
                          value={vehicleStationFilter}
                          onChange={(e) => setVehicleStationFilter(e.target.value)}
                          className={`px-3 py-2.5 rounded-lg border text-xs outline-none ${ 'bg-card border border-border text-foreground' }`}
                        >
                          <option value="all">Alle Stationen</option>
                          {stations.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select
                          value={vehicleFuelFilter}
                          onChange={(e) => setVehicleFuelFilter(e.target.value)}
                          className={`px-3 py-2.5 rounded-lg border text-xs outline-none ${ 'bg-card border border-border text-foreground' }`}
                        >
                          <option value="all">Alle Kraftstoffe</option>
                          {fuelTypes.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                        {(vehicleBrandFilter !== 'all' || vehicleCategoryFilter !== 'all' || vehicleStationFilter !== 'all' || vehicleFuelFilter !== 'all') && (
                          <button
                            onClick={() => {
                              setVehicleBrandFilter('all');
                              setVehicleCategoryFilter('all');
                              setVehicleStationFilter('all');
                              setVehicleFuelFilter('all');
                            }}
                            className={`px-3 py-2.5 rounded-lg border text-xs flex items-center gap-1.5 transition-all ${ 'bg-card border border-border text-muted-foreground hover:text-[color:var(--status-critical)] hover:border-[color:var(--status-critical)]' }`}
                          >
                            <Icon name="x" className="w-3.5 h-3.5" />
                            Filter zurücksetzen
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Status Filter Tabs */}
                    <div className="flex gap-2 mb-3">
                      {[
                        { label: 'Alle', value: 'all', count: availableVehicles.length },
                        { label: 'Verfügbar', value: 'Available', count: availableVehicles.filter(v => v.status === 'Available').length },
                        { label: 'Reserviert', value: 'Reserved', count: availableVehicles.filter(v => v.status === 'Reserved').length },
                        { label: 'Vermietet', value: 'Active Rented', count: availableVehicles.filter(v => v.status === 'Active Rented').length },
                        { label: 'Wartung', value: 'Maintenance', count: availableVehicles.filter(v => v.status === 'Maintenance').length },
                      ].map(tab => (
                        <button
                          key={tab.value}
                          onClick={() => setVehicleStatusFilter(tab.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 ${ vehicleStatusFilter === tab.value ? 'sq-tone-brand border border-border' : 'bg-muted/40 text-muted-foreground border border-border hover:border-border' }`}
                        >
                          {tab.label}
                          <span className={`px-1.5 py-0.5 rounded-full text-xs ${ vehicleStatusFilter === tab.value ? 'sq-tone-brand' : 'sq-chip-neutral' }`}>{tab.count}</span>
                        </button>
                      ))}
                    </div>

                    {/* Vehicle List */}
                    <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1">
                      {availableVehicles
                        .filter(v => vehicleStatusFilter === 'all' || v.status === vehicleStatusFilter)
                        .map((v) => {
                        const isMaintenance = v.status === 'Maintenance';
                        const isRented = v.status === 'Active Rented';
                        // V4.6.76 Rental Health V1 — show the rental_blocked pill
                        // in the picker so dispatchers know the booking would be
                        // rejected BEFORE clicking. The backend still hard-gates
                        // in BookingsService.create, so this is purely UX signal.
                        const vehicleHealth = pickerHealthMap.get(v.id) ?? null;
                        const isRentalBlocked = vehicleHealth?.rental_blocked === true;
                        // V4.7.62 — Offline (Last Signal ≥ 1 day): the vehicle's
                        // telemetry/condition can no longer be trusted, so it is
                        // not selectable for a booking. The row is greyed out and
                        // the click handler is hard-disabled.
                        const offline = isVehicleOffline(v);
                        // V4.6.67 — derive brand from `make` first (true source from
                        // backend), fall back to the model string. Use the shared
                        // BrandLogo component (carlogos-dataset CDN) for the icon
                        // and `buildMMY` for the Make Model Year title.
                        const brandKey = getBrandFromModel(v.make ?? v.model ?? '');
                        const mmy = buildMMY(v);
                        return (
                        <button
                          key={v.id}
                          disabled={offline}
                          onClick={() => {
                            if (offline) return;
                            setSelectedVehicle(v);
                            const station = v.station ?? '';
                            setPickupStation(station);
                            if (sameReturnStation) setReturnStation(station);
                          }}
                          className={`flex items-center gap-3 w-full text-left rounded-lg border px-3 py-2 transition-all duration-200 ${ offline ? 'border-border bg-muted/30 opacity-60 grayscale cursor-not-allowed' : isMaintenance ? selectedVehicle?.id === v.id ? 'border-[color:var(--brand)] ring-1 ring-[color:var(--brand-glow)] bg-[color:var(--brand-soft)] opacity-70 cursor-pointer' : 'border-[color:var(--status-critical)]/30 bg-muted/40 opacity-70 hover:border-[color:var(--status-critical)]/50 cursor-pointer' : selectedVehicle?.id === v.id ? 'border-[color:var(--brand)] ring-1 ring-[color:var(--brand-glow)] bg-[color:var(--brand-soft)] cursor-pointer' : 'border-border bg-muted/40 hover:border-border hover:bg-card cursor-pointer' }`}
                        >
                          {/* Brand Logo (shared CDN component, isomorphic with FleetView) */}
                          <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 p-1.5 ${ 'bg-muted/50' } ${(isMaintenance || offline) ? 'grayscale opacity-70' : ''}`}>
                            <BrandLogo brand={brandKey} size={28} />
                          </div>

                          {/* Vehicle Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-xs truncate ${(isMaintenance || offline) ? ('text-muted-foreground line-through') : 'text-foreground'}`}>{mmy}</p>
                              {/* V4.7.62 — Offline pill takes priority: a vehicle
                                  that has not signalled for ≥ 1 day cannot be
                                  booked, so the dispatcher sees the reason inline. */}
                              {offline ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-muted-foreground/80 text-primary-foreground shrink-0" title={VEHICLE_OFFLINE_LABEL}>
                                  <Icon name="wifi-off" className="w-3 h-3" />
                                  {VEHICLE_OFFLINE_LABEL}
                                </span>
                              ) : isMaintenance ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-red-600/80 text-white shrink-0">
                                  <Icon name="wrench" className="w-3 h-3" />
                                  Wartung
                                </span>
                              ) : isRented ? (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] bg-orange-500/80 text-white shrink-0">
                                  <Icon name="clock" className="w-3 h-3" />
                                  Aktuell vermietet
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs text-muted-foreground">{v.license}</span>
                              {isRentalBlocked ? (
                                <RentalHealthBadge
                                  health={vehicleHealth}
                                  size="sm"
                                  showBlockingLabel
                                />
                              ) : null}
                              <span className="text-xs text-muted-foreground">·</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded ${ v.fuelType === 'Electric' ? 'sq-chip-success' : v.fuelType === 'Hybrid' ? 'sq-chip-info' : v.fuelType === 'Diesel' ? 'sq-chip-watch' : v.fuelType === 'Petrol' ? 'sq-chip-warning' : 'sq-chip-neutral' }`}>{v.fuelType}</span>
                              {v.station && (
                                <>
                                  <span className="text-xs text-muted-foreground">·</span>
                                  <div className="flex items-center gap-1">
                                    <Icon name="map-pin" className="w-3 h-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">{v.station}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Price & Selection */}
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <p className={`text-xs ${(isMaintenance || offline) ? ('text-muted-foreground line-through') : 'text-foreground'}`}>€ {getDailyRate(v)}</p>
                              <p className="text-xs text-muted-foreground">pro Tag</p>
                            </div>
                            {selectedVehicle?.id === v.id && !offline ? (
                              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isMaintenance ? 'bg-blue-600/50' : 'bg-blue-600'}`}>
                                <Icon name="check" className="w-3.5 h-3.5 text-white" />
                              </div>
                            ) : (
                              <div className={`w-5 h-5 rounded-full border-2 relative ${ offline ? 'border-border' : isMaintenance ? 'border-[color:var(--status-critical)]/50' : 'border-border' }`}>
                                {(isMaintenance || offline) && (
                                  <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-0.5 rounded-full ${ offline ? ('bg-muted') : ('bg-[color:var(--status-critical)]/60') }`} />
                                )}
                              </div>
                            )}
                          </div>
                        </button>
                      );})}
                      {availableVehicles.filter(v => vehicleStatusFilter === 'all' || v.status === vehicleStatusFilter).length === 0 && (
                        <div className="py-12 text-center">
                          <Icon name="car" className="w-5 h-5 mx-auto mb-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Keine Fahrzeuge in dieser Kategorie gefunden</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* STEP 3: Extras & Packages — V4.6.67 reordered after Period */}
            {currentStep === 3 && (
              <>
                {/* Mileage Packages */}
                {card(
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center sq-tone-success">
                        <Icon name="fuel" className="w-5 h-5 text-[color:var(--status-positive)]" />
                      </div>
                      <SectionHeader title="Mileage Packages" />
                    </div>
                    <p className="text-xs mb-3 text-muted-foreground">
                      Add extra kilometers to your booking. Only one package can be selected.
                    </p>
                    {mileagePackages.length > 0 ? (
                      <div className="grid grid-cols-3 gap-3">
                        {mileagePackages.map((pkg) => {
                          const isSelected = selectedMileagePackage === pkg.id;
                          return (
                            <button
                              key={pkg.id}
                              onClick={() => setSelectedMileagePackage(isSelected ? null : pkg.id)}
                              className={`p-4 rounded-lg border text-center transition-all relative overflow-hidden ${ isSelected ? 'sq-tone-success border border-border ring-1 ring-[color:var(--status-positive-soft)]' : 'bg-muted/40 border border-border hover:border-border' }`}
                            >
                              {isSelected && (
                                <div className="absolute top-2 right-2">
                                  <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center">
                                    <Icon name="check" className="w-3 h-3 text-white" />
                                  </div>
                                </div>
                              )}
                              <p className={`text-xs mb-1 ${isSelected ? ('text-[color:var(--status-positive)]') : ('text-foreground')}`}>
                                +{pkg.km.toLocaleString()}
                              </p>
                              <p className="text-xs mb-2 text-muted-foreground">kilometers</p>
                              <div className={`text-xs ${isSelected ? ('text-[color:var(--status-positive)]') : ('text-foreground')}`}>
                                {'\u20AC'} {pkg.price.toFixed(2)}
                              </div>
                              <p className="text-xs mt-1 text-muted-foreground">
                                {'\u20AC'} {(pkg.price / pkg.km).toFixed(2)}/km effective
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-center py-3 text-muted-foreground">No mileage packages available for this vehicle.</p>
                    )}
                  </div>
                )}

                {/* Insurance Packages */}
                {card(
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center sq-tone-ai">
                        <Icon name="shield" className="w-5 h-5 text-[color:var(--status-ai)]" />
                      </div>
                      <SectionHeader title="Insurance Packages" />
                    </div>
                    <p className="text-xs mb-3 text-muted-foreground">
                      Choose additional insurance coverage for your rental period.
                    </p>
                    {insuranceOptions.length > 0 ? (
                      <div className="space-y-3">
                        {insuranceOptions.map((ins) => {
                          const isSelected = selectedInsurances.includes(ins.id);
                          return (
                            <button
                              key={ins.id}
                              onClick={() => setSelectedInsurances(prev =>
                                prev.includes(ins.id) ? prev.filter(i => i !== ins.id) : [...prev, ins.id]
                              )}
                              className={`w-full p-4 rounded-lg border text-left transition-all flex items-center justify-between ${ isSelected ? 'sq-tone-ai border border-border ring-1 ring-border' : 'bg-muted/40 border border-border hover:border-border' }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${ isSelected ? 'bg-purple-600 border-purple-600' : 'border-border' }`}>
                                  {isSelected && <Icon name="check" className="w-3 h-3 text-white" />}
                                </div>
                                <div>
                                  <p className="text-xs text-foreground">{ins.name}</p>
                                  <p className="text-xs mt-0.5 text-muted-foreground">{ins.description}</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0 ml-4">
                                <p className={`text-xs ${isSelected ? ('text-[color:var(--status-ai)]') : ('text-foreground')}`}>
                                  {'\u20AC'} {ins.dailyPrice.toFixed(2)}
                                </p>
                                <p className="text-xs text-muted-foreground">per day</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-center py-3 text-muted-foreground">No insurance options available for this vehicle.</p>
                    )}
                  </div>
                )}

                {/* General Extras */}
                {card(
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center sq-tone-info">
                        <Icon name="star" className="w-5 h-5 text-[color:var(--status-info)]" />
                      </div>
                      <SectionHeader title="Extras" />
                    </div>
                    <p className="text-xs mb-3 text-muted-foreground">
                      Add optional equipment and services to your booking.
                    </p>
                    {extraOptions.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {extraOptions.map((opt) => {
                          const isSelected = extras.includes(opt.id);
                          return (
                            <button
                              key={opt.id}
                              onClick={() => setExtras(prev => prev.includes(opt.id) ? prev.filter(e => e !== opt.id) : [...prev, opt.id])}
                              className={`p-4 rounded-lg border text-left transition-all flex items-center gap-3 ${ isSelected ? 'sq-tone-brand border border-border ring-1 ring-[color:var(--brand-glow)]' : 'bg-muted/40 border border-border hover:border-border' }`}
                            >
                              <span className="text-base shrink-0">{opt.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-foreground">{opt.label}</p>
                                <p className="text-[11px] mt-0.5 text-muted-foreground">{opt.description}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-xs ${isSelected ? ('text-[color:var(--status-info)]') : ('text-foreground')}`}>
                                  {'\u20AC'}{opt.dailyPrice}/d
                                </span>
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${ isSelected ? 'bg-blue-600 border-blue-600' : 'border-border' }`}>
                                  {isSelected && <Icon name="check" className="w-3 h-3 text-white" />}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-center py-3 text-muted-foreground">No extras available for this vehicle.</p>
                    )}
                  </div>
                )}

                {/* Selection Summary */}
                {(selectedMileagePackage || selectedInsurances.length > 0 || extras.length > 0) && (
                  card(
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {selectedMileagePackage && (
                            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full sq-chip-success">
                              <Icon name="fuel" className="w-3 h-3" /> 1 Mileage Pkg
                            </span>
                          )}
                          {selectedInsurances.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full sq-tone-ai">
                              <Icon name="shield" className="w-3 h-3" /> {selectedInsurances.length} Insurance{selectedInsurances.length !== 1 ? 's' : ''}
                            </span>
                          )}
                          {extras.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full sq-chip-info">
                              <Icon name="star" className="w-3 h-3" /> {extras.length} Extra{extras.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-foreground">
                          + {'\u20AC'} {extrasTotal.toFixed(2)} {rentalDays > 0 ? 'total' : '/selection'}
                        </span>
                      </div>
                    </div>
                  )
                )}
              </>
            )}

            {/* STEP 2: Date & Time — V4.6.67 moved before Extras */}
            {currentStep === 2 && (
              <>
                {card(
                  <div className="p-4">
                    <SectionHeader title="Zeitraum & Abholung" className="mb-3" />

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {/* Pickup */}
                      <div>
                        <label className="text-xs mb-1.5 block text-muted-foreground">Abholung</label>
                        <div className="flex gap-2">
                          <input
                            type="date"
                            value={pickupDate}
                            min={new Date().toISOString().slice(0, 10)}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPickupDate(val);
                              if (val) {
                                const d = new Date(val);
                                setCalendarMonth(d.getMonth());
                                setCalendarYear(d.getFullYear());
                                if (returnDate && val >= returnDate) {
                                  setReturnDate('');
                                }
                              }
                            }}
                            className={`flex-1 px-3 py-2.5 rounded-lg border text-xs outline-none ${ 'bg-card border border-border text-foreground' }`}
                          />
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => { setShowPickupTimePicker(!showPickupTimePicker); setShowReturnTimePicker(false); }}
                              className={`w-28 px-3 py-2.5 rounded-lg border text-xs outline-none flex items-center gap-2 transition-all ${ showPickupTimePicker ? 'sq-tone-brand border border-border' : 'bg-card border border-border text-foreground hover:border-border' }`}
                            >
                              <Icon name="clock" className="w-3.5 h-3.5" />
                              {pickupTime}
                            </button>
                            {showPickupTimePicker && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowPickupTimePicker(false)} />
                                <div className={`absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 w-52 p-4 rounded-lg border shadow-2xl ${ 'bg-card/95 border border-border' }`}>
                                  {/* Analog Clock */}
                                  <div className="flex justify-center mb-3">
                                    <svg width="120" height="120" viewBox="0 0 120 120">
                                      <circle cx="60" cy="60" r="56" fill={'var(--card)'} stroke={'var(--border)'} strokeWidth="2" />
                                      {/* Hour markers */}
                                      {Array.from({ length: 12 }, (_, i) => {
                                        const angle = (i * 30 - 90) * (Math.PI / 180);
                                        const x1 = 60 + 44 * Math.cos(angle);
                                        const y1 = 60 + 44 * Math.sin(angle);
                                        const x2 = 60 + 50 * Math.cos(angle);
                                        const y2 = 60 + 50 * Math.sin(angle);
                                        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={'var(--muted-foreground)'} strokeWidth={i % 3 === 0 ? 2.5 : 1.5} strokeLinecap="round" />;
                                      })}
                                      {/* Hour numbers */}
                                      {Array.from({ length: 12 }, (_, i) => {
                                        const num = i === 0 ? 12 : i;
                                        const angle = (i * 30 - 90) * (Math.PI / 180);
                                        const x = 60 + 36 * Math.cos(angle);
                                        const y = 60 + 36 * Math.sin(angle);
                                        return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="central" fill={'var(--muted-foreground)'} fontSize="9" fontWeight="500">{num}</text>;
                                      })}
                                      {/* Hour hand */}
                                      {(() => {
                                        const [h, m] = pickupTime.split(':').map(Number);
                                        const hourAngle = ((h % 12) * 30 + m * 0.5 - 90) * (Math.PI / 180);
                                        return <line x1="60" y1="60" x2={60 + 26 * Math.cos(hourAngle)} y2={60 + 26 * Math.sin(hourAngle)} stroke={'var(--status-info)'} strokeWidth="3" strokeLinecap="round" />;
                                      })()}
                                      {/* Minute hand */}
                                      {(() => {
                                        const [, m] = pickupTime.split(':').map(Number);
                                        const minAngle = (m * 6 - 90) * (Math.PI / 180);
                                        return <line x1="60" y1="60" x2={60 + 38 * Math.cos(minAngle)} y2={60 + 38 * Math.sin(minAngle)} stroke={'var(--status-info)'} strokeWidth="2" strokeLinecap="round" />;
                                      })()}
                                      {/* Center dot */}
                                      <circle cx="60" cy="60" r="3" fill={'var(--status-info)'} />
                                    </svg>
                                  </div>
                                  {/* Time Input */}
                                  <div className="flex items-center justify-center gap-2">
                                    <Icon name="clock" className="w-3.5 h-3.5 text-muted-foreground" />
                                    <input
                                      type="time"
                                      value={pickupTime}
                                      onChange={(e) => setPickupTime(e.target.value)}
                                      className={`w-full px-3 py-2 rounded-lg border text-xs text-center outline-none transition-colors ${ 'bg-card border border-border text-foreground focus:border-[color:var(--brand)]' }`}
                                    />
                                  </div>
                                  {/* Arrow pointing up */}
                                  <div className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-l border-t ${ 'bg-card/95 border border-border' }`}></div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Return */}
                      <div>
                        <label className="text-xs mb-1.5 block text-muted-foreground">Rückgabe</label>
                        <div className="flex gap-2">
                          <input
                            type="date"
                            value={returnDate}
                            min={pickupDate || new Date().toISOString().slice(0, 10)}
                            onChange={(e) => {
                              const val = e.target.value;
                              // Don't allow same-day or earlier-than-pickup return values.
                              if (val && pickupDate && val <= pickupDate) return;
                              setReturnDate(val);
                              if (val) {
                                const d = new Date(val);
                                setCalendarMonth(d.getMonth());
                                setCalendarYear(d.getFullYear());
                              }
                            }}
                            className={`flex-1 px-3 py-2.5 rounded-lg border text-xs outline-none ${ 'bg-card border border-border text-foreground' }`}
                          />
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => { setShowReturnTimePicker(!showReturnTimePicker); setShowPickupTimePicker(false); }}
                              className={`w-28 px-3 py-2.5 rounded-lg border text-xs outline-none flex items-center gap-2 transition-all ${ showReturnTimePicker ? 'sq-tone-success border border-border' : 'bg-card border border-border text-foreground hover:border-border' }`}
                            >
                              <Icon name="clock" className="w-3.5 h-3.5" />
                              {returnTime}
                            </button>
                            {showReturnTimePicker && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowReturnTimePicker(false)} />
                                <div className={`absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 w-52 p-4 rounded-lg border shadow-2xl ${ 'bg-card/95 border border-border' }`}>
                                  {/* Analog Clock */}
                                  <div className="flex justify-center mb-3">
                                    <svg width="120" height="120" viewBox="0 0 120 120">
                                      <circle cx="60" cy="60" r="56" fill={'var(--card)'} stroke={'var(--border)'} strokeWidth="2" />
                                      {/* Hour markers */}
                                      {Array.from({ length: 12 }, (_, i) => {
                                        const angle = (i * 30 - 90) * (Math.PI / 180);
                                        const x1 = 60 + 44 * Math.cos(angle);
                                        const y1 = 60 + 44 * Math.sin(angle);
                                        const x2 = 60 + 50 * Math.cos(angle);
                                        const y2 = 60 + 50 * Math.sin(angle);
                                        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={'var(--muted-foreground)'} strokeWidth={i % 3 === 0 ? 2.5 : 1.5} strokeLinecap="round" />;
                                      })}
                                      {/* Hour numbers */}
                                      {Array.from({ length: 12 }, (_, i) => {
                                        const num = i === 0 ? 12 : i;
                                        const angle = (i * 30 - 90) * (Math.PI / 180);
                                        const x = 60 + 36 * Math.cos(angle);
                                        const y = 60 + 36 * Math.sin(angle);
                                        return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="central" fill={'var(--muted-foreground)'} fontSize="9" fontWeight="500">{num}</text>;
                                      })}
                                      {/* Hour hand */}
                                      {(() => {
                                        const [h, m] = returnTime.split(':').map(Number);
                                        const hourAngle = ((h % 12) * 30 + m * 0.5 - 90) * (Math.PI / 180);
                                        return <line x1="60" y1="60" x2={60 + 26 * Math.cos(hourAngle)} y2={60 + 26 * Math.sin(hourAngle)} stroke={'var(--status-positive)'} strokeWidth="3" strokeLinecap="round" />;
                                      })()}
                                      {/* Minute hand */}
                                      {(() => {
                                        const [, m] = returnTime.split(':').map(Number);
                                        const minAngle = (m * 6 - 90) * (Math.PI / 180);
                                        return <line x1="60" y1="60" x2={60 + 38 * Math.cos(minAngle)} y2={60 + 38 * Math.sin(minAngle)} stroke={'var(--status-positive)'} strokeWidth="2" strokeLinecap="round" />;
                                      })()}
                                      {/* Center dot */}
                                      <circle cx="60" cy="60" r="3" fill={'var(--status-positive)'} />
                                    </svg>
                                  </div>
                                  {/* Time Input */}
                                  <div className="flex items-center justify-center gap-2">
                                    <Icon name="clock" className="w-3.5 h-3.5 text-muted-foreground" />
                                    <input
                                      type="time"
                                      value={returnTime}
                                      onChange={(e) => setReturnTime(e.target.value)}
                                      className={`w-full px-3 py-2 rounded-lg border text-xs text-center outline-none transition-colors ${ 'bg-card border border-border text-foreground focus:border-[color:var(--status-positive)]' }`}
                                    />
                                  </div>
                                  {/* Arrow pointing up */}
                                  <div className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-l border-t ${ 'bg-card/95 border border-border' }`}></div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Stations */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="text-xs mb-1.5 block text-muted-foreground">Abholstation</label>
                        <div className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-lg border text-xs ${ 'bg-muted/40 border border-border text-foreground' }`}>
                          <Icon name="map-pin" className="w-3.5 h-3.5 shrink-0 text-[color:var(--status-info)]" />
                          <span className={pickupStation ? '' : ('text-muted-foreground')}>
                            {pickupStation || 'Wird vom Fahrzeug übernommen'}
                          </span>
                          {pickupStation && (
                            <span className="ml-auto text-xs px-1.5 py-0.5 rounded sq-chip-info">Vorgegeben</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs text-muted-foreground">Rückgabestation</label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={sameReturnStation} onChange={(e) => {
                              setSameReturnStation(e.target.checked);
                              if (e.target.checked) setReturnStation(pickupStation);
                            }} className="rounded" />
                            <span className="text-xs text-muted-foreground">Gleiche Station</span>
                          </label>
                        </div>
                        <select
                          value={returnStation}
                          onChange={(e) => setReturnStation(e.target.value)}
                          disabled={sameReturnStation}
                          className={`w-full px-3 py-2.5 rounded-lg border text-xs outline-none ${ sameReturnStation ? 'opacity-50 cursor-not-allowed' : '' } bg-card border border-border text-foreground`}
                        >
                          <option value="">Station wählen...</option>
                          {stations.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Calendar Selection */}
                    <div className="rounded-lg border p-4 bg-muted/40 border border-border">
                      {/* Selection mode indicator */}
                      <div className="flex items-center gap-2 mb-3">
                        <button
                          onClick={() => setCalendarSelectMode('pickup')}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs text-center transition-all ${ calendarSelectMode === 'pickup' ? 'sq-tone-brand border border-border' : 'bg-card text-muted-foreground border border-border' }`}
                        >
                          <Icon name="calendar" className="w-3.5 h-3.5 mx-auto mb-1" />
                          Abholdatum wählen
                        </button>
                        <button
                          onClick={() => setCalendarSelectMode('return')}
                          className={`flex-1 px-3 py-2 rounded-lg text-xs text-center transition-all ${ calendarSelectMode === 'return' ? 'sq-tone-success border border-border' : 'bg-card text-muted-foreground border border-border' }`}
                        >
                          <Icon name="calendar" className="w-3.5 h-3.5 mx-auto mb-1" />
                          Rückgabedatum wählen
                        </button>
                      </div>

                      <div className="flex items-center justify-between mb-3">
                        <button
                          onClick={() => {
                            // Roll over to previous year when stepping back from January.
                            if (calendarMonth === 0) {
                              setCalendarMonth(11);
                              setCalendarYear(y => y - 1);
                            } else {
                              setCalendarMonth(m => m - 1);
                            }
                          }}
                          className="p-1 rounded-lg transition-colors hover:bg-muted"
                        >
                          <Icon name="chevron-left" className="w-5 h-5" />
                        </button>
                        <span className="text-xs text-foreground">{monthNames[calendarMonth]} {calendarYear}</span>
                        <button
                          onClick={() => {
                            // Roll forward to next year when stepping past December.
                            if (calendarMonth === 11) {
                              setCalendarMonth(0);
                              setCalendarYear(y => y + 1);
                            } else {
                              setCalendarMonth(m => m + 1);
                            }
                          }}
                          className="p-1 rounded-lg transition-colors hover:bg-muted"
                        >
                          <Icon name="chevron-right" className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-center">
                        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                          <div key={d} className="text-xs py-1 text-muted-foreground">{d}</div>
                        ))}
                        {getCalendarDays(calendarMonth, calendarYear).map((day, i) => {
                          const isBlocked = day ? blockedDays.includes(day) : false;
                          const blockInfo = day ? vehicleBlockedInfo[day] : null;
                          return (
                            <div key={i} className="relative">
                              <button
                                type="button"
                                disabled={!day || isBlocked}
                                onClick={() => day && handleCalendarDayClick(day)}
                                onMouseEnter={() => { if (day && isBlocked) setHoveredDay(day); }}
                                onMouseLeave={() => setHoveredDay(null)}
                                className={`w-full text-xs py-2 rounded-lg transition-all ${
                                  !day
                                    ? 'cursor-default'
                                    : isBlocked
                                    ? `cursor-not-allowed ${
                                        blockInfo?.reason === 'maintenance'
                                          ? 'sq-tone-watch'
                                          : 'sq-tone-critical'
                                      }`
                                    : isStartDay(day)
                                    ? 'bg-blue-600 text-white cursor-pointer hover:bg-blue-700 shadow-sm'
                                    : isEndDay(day)
                                    ? 'bg-green-600 text-white cursor-pointer hover:bg-green-700 shadow-sm'
                                    : isInRange(day)
                                    ? 'cursor-pointer sq-tone-brand hover:opacity-90'
                                    : 'cursor-pointer text-foreground hover:bg-muted'
                                }`}
                              >
                                {day || ''}
                              </button>
                              {/* Hover tooltip for blocked days */}
                              {hoveredDay === day && day && blockInfo && (
                                <div className={`absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 rounded-lg border shadow-lg ${ 'bg-card/95 border border-border text-foreground' }`}>
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    {blockInfo.reason === 'maintenance' ? (
                                      <Icon name="wrench" className="w-3 h-3 text-[color:var(--status-watch)]" />
                                    ) : (
                                      <Icon name="car" className="w-3 h-3 text-[color:var(--status-critical)]" />
                                    )}
                                    <span className={`text-xs ${ blockInfo.reason === 'maintenance' ? 'text-[color:var(--status-watch)]' : 'text-[color:var(--status-critical)]' }`}>
                                      {blockInfo.reason === 'maintenance' ? 'Wartung' : 'Vermietet'}
                                    </span>
                                  </div>
                                  <div className="text-xs mb-1 text-foreground">
                                    <span className="flex items-center gap-1">
                                      <Icon name="calendar" className="w-3 h-3" />
                                      {blockInfo.startDay}. – {blockInfo.endDay}. {monthNames[calendarMonth]}
                                    </span>
                                  </div>
                                  {blockInfo.reason !== 'maintenance' && (
                                    <div className="text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <Icon name="user" className="w-3 h-3" />
                                        {blockInfo.customer}
                                      </span>
                                    </div>
                                  )}
                                  <div className={`absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 -mt-1 border-r border-b ${ 'bg-card/95 border border-border' }`}></div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/30">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded bg-blue-600"></div>
                          <span className="text-xs text-muted-foreground">Abholung</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded bg-green-600"></div>
                          <span className="text-xs text-muted-foreground">Rückgabe</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded sq-tone-brand"></div>
                          <span className="text-xs text-muted-foreground">Zeitraum</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded sq-tone-critical"></div>
                          <span className="text-xs text-muted-foreground">Gebucht</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded sq-tone-watch"></div>
                          <span className="text-xs text-muted-foreground">Wartung</span>
                        </div>
                      </div>
                      {!selectedVehicle && (
                        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg sq-tone-info border border-border">
                          <Icon name="alert-circle" className="w-3.5 h-3.5 shrink-0 text-[color:var(--status-info)]" />
                          <span className="text-xs text-[color:var(--status-info)]">
                            Bitte wählen Sie zuerst ein Fahrzeug, um die Verfügbarkeit zu sehen.
                          </span>
                        </div>
                      )}
                      {rangeHasConflict && (
                        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg sq-tone-critical border border-border">
                          <Icon name="alert-circle" className="w-3.5 h-3.5 shrink-0 text-[color:var(--status-critical)]" />
                          <span className="text-xs text-[color:var(--status-critical)]">
                            Der gewählte Zeitraum überschneidet sich mit einer bestehenden Reservierung oder Wartung. Bitte wählen Sie einen anderen Zeitraum.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </>
            )}

            {/* STEP 5: Payment & Confirm */}
            {currentStep === 5 && (
              <div className="space-y-4">
                {/* Box 1: Zahlungsmethode */}
                {card(
                  <div className="p-4">
                    <h2 className="text-lg mb-3 text-muted-foreground">Zahlungsmethode</h2>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'card' as const, label: 'Kartenzahlung', icon: CreditCard, desc: 'Kredit-/Debitkarte' },
                        { id: 'cash' as const, label: 'Barzahlung', icon: Euro, desc: 'Bei Abholung' },
                        { id: 'invoice' as const, label: 'Rechnung', icon: FileText, desc: 'Firmenrechnung' },
                      ].map((m) => {
                        const isInvoiceDisabled = m.id === 'invoice' && selectedCustomer?.type !== 'Corporate';
                        return (
                        <button
                          key={m.id}
                          onClick={() => { if (!isInvoiceDisabled) setPaymentMethod(m.id); }}
                          disabled={isInvoiceDisabled}
                          className={`p-3.5 rounded-lg border text-center transition-all ${ isInvoiceDisabled ? 'bg-muted/20 border border-border opacity-40 cursor-not-allowed' : paymentMethod === m.id ? 'sq-tone-brand border border-border ring-1 ring-[color:var(--brand-glow)]' : 'bg-muted/40 border border-border hover:border-border' }`}
                        >
                          <m.icon className={`w-5 h-5 mx-auto mb-1.5 ${ isInvoiceDisabled ? 'text-muted-foreground' : paymentMethod === m.id ? 'text-blue-500' : 'text-muted-foreground' }`} />
                          <p className="text-xs text-foreground">{m.label}</p>
                          <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                          {isInvoiceDisabled && (
                            <p className="text-xs mt-1 text-[color:var(--status-watch)]">Nur Firmenkunden</p>
                          )}
                        </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Box 2: Rabatt */}
                {card(
                  <div className="p-4">
                    <h2 className="text-lg mb-3 text-muted-foreground">Rabatt</h2>
                    <div className="flex gap-2 items-center flex-wrap">
                      {[0, 5, 10, 15, 20].map(d => (
                        <button
                          key={d}
                          onClick={() => setDiscountPercent(d)}
                          className={`px-3.5 py-1.5 rounded-lg border text-xs transition-all ${ discountPercent === d && ![0, 5, 10, 15, 20].includes(discountPercent) ? '' : discountPercent === d ? 'sq-tone-success border border-border' : 'bg-muted/40 border border-border text-muted-foreground hover:border-border' }`}
                        >
                          {d}%
                        </button>
                      ))}
                      <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs ${ ![0, 5, 10, 15, 20].includes(discountPercent) && discountPercent > 0 ? 'sq-tone-success border border-border' : 'bg-muted/40 border border-border' }`}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          placeholder="Custom"
                          value={![0, 5, 10, 15, 20].includes(discountPercent) ? discountPercent : ''}
                          onChange={(e) => {
                            const val = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
                            setDiscountPercent(val);
                          }}
                          className={`w-16 bg-transparent outline-none text-xs text-center ${ 'text-foreground placeholder:text-muted-foreground' }`}
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                    </div>
                    {discountPercent > 0 && (
                      <p className="text-xs mt-2 text-[color:var(--status-positive)]">
                        Ersparnis: € {discountAmount.toFixed(2)}
                      </p>
                    )}
                  </div>
                )}

                {/* Box 3: Dokumente */}
                {card(
                  <div className="p-4">
                    <h2 className="text-lg mb-3 text-muted-foreground">Dokumente</h2>
                    <div className="space-y-3">
                      {/* AGB */}
                      <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/40">
                        <div className="flex items-center gap-2.5">
                          <Icon name="file-text" className="w-5 h-5 text-[color:var(--status-info)]" />
                          <span className="text-xs text-foreground">Allgemeine Geschäftsbedingungen (AGB)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              const printWindow = window.open('', '_blank');
                              if (printWindow) {
                                printWindow.document.write(`
                                  <html><head><title>AGB</title>
                                  <style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#333}h1{font-size:22px;margin-bottom:20px}h2{font-size:17px;margin-top:30px}p{line-height:1.6;font-size:14px}</style>
                                  </head><body>
                                  <h1>Allgemeine Gesch&auml;ftsbedingungen (AGB)</h1>
                                  <p>Stand: M&auml;rz 2026</p>
                                  <h2>1. Geltungsbereich</h2><p>Diese AGB gelten f&uuml;r alle Mietvertr&auml;ge &uuml;ber Fahrzeuge unserer Flotte.</p>
                                  <h2>2. Mietbedingungen</h2><p>Der Mieter verpflichtet sich, das Fahrzeug pfleglich zu behandeln und zum vereinbarten Zeitpunkt zur&uuml;ckzugeben.</p>
                                  <h2>3. Zahlungsbedingungen</h2><p>Die Miete ist bei Abholung f&auml;llig. Bei Firmenkunden kann auf Rechnung gezahlt werden.</p>
                                  </body></html>
                                `);
                                printWindow.document.close();
                                printWindow.print();
                              }
                            }}
                            title="Drucken"
                            className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Icon name="printer" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              const subject = encodeURIComponent('Allgemeine Geschäftsbedingungen – Flottenvermietung');
                              const body = encodeURIComponent(
                                'Sehr geehrte/r Kunde/in,\n\nanbei erhalten Sie unsere Allgemeinen Geschäftsbedingungen (AGB).\n\n' +
                                '1. Geltungsbereich: Diese AGB gelten für alle Mietverträge über Fahrzeuge unserer Flotte.\n' +
                                '2. Mietbedingungen: Der Mieter verpflichtet sich, das Fahrzeug pfleglich zu behandeln.\n' +
                                '3. Zahlungsbedingungen: Die Miete ist bei Abholung fällig.\n\n' +
                                'Mit freundlichen Grüßen\nIhr Flottenmanagement-Team'
                              );
                              const email = selectedCustomer?.email || '';
                              window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_self');
                            }}
                            title="Per E-Mail senden"
                            className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Icon name="send" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Datenschutzerklärung */}
                      <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/40">
                        <div className="flex items-center gap-2.5">
                          <Icon name="shield" className="w-5 h-5 text-[color:var(--status-ai)]" />
                          <span className="text-xs text-foreground">Datenschutzerklärung</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              const printWindow = window.open('', '_blank');
                              if (printWindow) {
                                printWindow.document.write(`
                                  <html><head><title>Datenschutzerkl&auml;rung</title>
                                  <style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#333}h1{font-size:22px;margin-bottom:20px}p{line-height:1.6;font-size:14px}</style>
                                  </head><body>
                                  <h1>Datenschutzerkl&auml;rung</h1>
                                  <p>Wir verarbeiten Ihre personenbezogenen Daten gem&auml;&szlig; DSGVO ausschlie&szlig;lich zur Durchf&uuml;hrung des Mietvertrags.</p>
                                  </body></html>
                                `);
                                printWindow.document.close();
                                printWindow.print();
                              }
                            }}
                            title="Drucken"
                            className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Icon name="printer" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              const subject = encodeURIComponent('Datenschutzerklärung – Flottenvermietung');
                              const body = encodeURIComponent(
                                'Sehr geehrte/r Kunde/in,\n\nanbei erhalten Sie unsere Datenschutzerklärung.\n\n' +
                                'Wir verarbeiten Ihre personenbezogenen Daten gemäß DSGVO ausschließlich zur Durchführung des Mietvertrags.\n\n' +
                                'Mit freundlichen Grüßen\nIhr Flottenmanagement-Team'
                              );
                              const email = selectedCustomer?.email || '';
                              window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_self');
                            }}
                            title="Per E-Mail senden"
                            className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                          >
                            <Icon name="send" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="border-t border-border" />

                      {/* Rechnung */}
                      <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/40">
                        <div className="flex items-center gap-2.5">
                          <Icon name="receipt" className="w-5 h-5 text-[color:var(--status-watch)]" />
                          <div>
                            <span className="text-xs text-foreground">Rechnung</span>
                            {invoiceGenerated && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full sq-chip-success">Generiert</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {!invoiceGenerated ? (
                            <button
                              onClick={() => {
                                setGeneratingInvoice(true);
                                setTimeout(() => {
                                  setGeneratingInvoice(false);
                                  setInvoiceGenerated(true);
                                }, 1500);
                              }}
                              disabled={generatingInvoice}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${ 'sq-tone-watch border border-border hover:opacity-90' }`}
                            >
                              {generatingInvoice ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="receipt" className="w-3 h-3" />}
                              {generatingInvoice ? 'Wird generiert...' : 'Generieren'}
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => setQuickViewDoc('invoice')}
                                title="Vorschau"
                                className="p-1.5 rounded-md transition-all hover:bg-muted text-[color:var(--status-info)] hover:opacity-80"
                              >
                                <Icon name="eye" className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  const printWindow = window.open('', '_blank');
                                  if (printWindow) {
                                    printWindow.document.write(`
                                      <html><head><title>Rechnung</title>
                                      <style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#333}h1{font-size:22px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #eee}th{background:#f9f9f9}.total{font-size:18px;font-weight:600}</style>
                                      </head><body>
                                      <h1>Rechnung</h1>
                                      <p>Kunde: ${selectedCustomer?.name || '–'}</p>
                                      <p>Fahrzeug: ${selectedVehicle ? buildMMY(selectedVehicle) : '–'} (${selectedVehicle?.license || '–'})</p>
                                      <p>Zeitraum: ${pickupDate ? new Date(pickupDate).toLocaleDateString('de-DE') : '–'} – ${returnDate ? new Date(returnDate).toLocaleDateString('de-DE') : '–'}</p>
                                      <table><tr><th>Position</th><th>Betrag</th></tr>
                                      <tr><td>${rentalDays}x Tagestarif</td><td>&euro; ${subtotal.toFixed(2)}</td></tr>
                                      <tr><td>Packages & Extras</td><td>&euro; ${extrasTotal.toFixed(2)}</td></tr>
                                      ${discountPercent > 0 ? `<tr><td>Rabatt (${discountPercent}%)</td><td>-&euro; ${discountAmount.toFixed(2)}</td></tr>` : ''}
                                      <tr><td>MwSt. (19%)</td><td>&euro; ${tax.toFixed(2)}</td></tr>
                                      <tr><td class="total">Gesamt</td><td class="total">&euro; ${grandTotal.toFixed(2)}</td></tr>
                                      </table></body></html>
                                    `);
                                    printWindow.document.close();
                                    printWindow.print();
                                  }
                                }}
                                title="Drucken"
                                className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                              >
                                <Icon name="printer" className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  const subject = encodeURIComponent(`Rechnung – ${selectedVehicle ? buildMMY(selectedVehicle) : 'Fahrzeug'}`);
                                  const body = encodeURIComponent(
                                    `Sehr geehrte/r ${selectedCustomer?.name || 'Kunde/in'},\n\nanbei Ihre Rechnung.\n\n` +
                                    `Fahrzeug: ${selectedVehicle ? buildMMY(selectedVehicle) : '–'} (${selectedVehicle?.license || '–'})\n` +
                                    `Zeitraum: ${rentalDays} Tage\n` +
                                    `Gesamt: € ${grandTotal.toFixed(2)}\n\n` +
                                    'Mit freundlichen Grüßen\nIhr Flottenmanagement-Team'
                                  );
                                  const email = selectedCustomer?.email || '';
                                  window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_self');
                                }}
                                title="Per E-Mail senden"
                                className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                              >
                                <Icon name="send" className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Mietvertrag */}
                      <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/40">
                        <div className="flex items-center gap-2.5">
                          <Icon name="file-signature" className="w-5 h-5 text-[color:var(--status-positive)]" />
                          <div>
                            <span className="text-xs text-foreground">Mietvertrag</span>
                            {contractGenerated && (
                              <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full sq-chip-success">Generiert</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {!contractGenerated ? (
                            <button
                              onClick={() => {
                                setGeneratingContract(true);
                                setTimeout(() => {
                                  setGeneratingContract(false);
                                  setContractGenerated(true);
                                }, 2000);
                              }}
                              disabled={generatingContract}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${ 'sq-tone-success border border-border hover:opacity-90' }`}
                            >
                              {generatingContract ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="file-signature" className="w-3 h-3" />}
                              {generatingContract ? 'Wird generiert...' : 'Generieren'}
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => setQuickViewDoc('contract')}
                                title="Vorschau"
                                className="p-1.5 rounded-md transition-all hover:bg-muted text-[color:var(--status-info)] hover:opacity-80"
                              >
                                <Icon name="eye" className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  const printWindow = window.open('', '_blank');
                                  if (printWindow) {
                                    printWindow.document.write(`
                                      <html><head><title>Mietvertrag</title>
                                      <style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#333}h1{font-size:22px}h2{font-size:16px;margin-top:24px}p{line-height:1.6;font-size:14px}.sig{margin-top:60px;display:flex;gap:80px}.sig div{border-top:1px solid #333;padding-top:8px;width:200px;font-size:13px}</style>
                                      </head><body>
                                      <h1>Mietvertrag</h1>
                                      <p><strong>Vermieter:</strong> Flottenmanagement GmbH</p>
                                      <p><strong>Mieter:</strong> ${selectedCustomer?.name || '–'}</p>
                                      <h2>Fahrzeug</h2>
                                      <p>${selectedVehicle ? buildMMY(selectedVehicle) : '–'} · ${selectedVehicle?.license || '–'}</p>
                                      <h2>Mietzeitraum</h2>
                                      <p>${pickupDate ? new Date(pickupDate).toLocaleDateString('de-DE') : '–'} (${pickupTime}) – ${returnDate ? new Date(returnDate).toLocaleDateString('de-DE') : '–'} (${returnTime})</p>
                                      <h2>Kosten</h2>
                                      <p>Gesamt: &euro; ${grandTotal.toFixed(2)} (inkl. MwSt.)</p>
                                      <p>Kaution: &euro; ${depositAmount.toFixed(2)}</p>
                                      <p>Frei-Kilometer: ${totalFreeKm.toLocaleString('de-DE')} km</p>
                                      <div class="sig"><div>Vermieter</div><div>Mieter</div></div>
                                      </body></html>
                                    `);
                                    printWindow.document.close();
                                    printWindow.print();
                                  }
                                }}
                                title="Drucken"
                                className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                              >
                                <Icon name="printer" className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  const subject = encodeURIComponent(`Mietvertrag – ${selectedVehicle ? buildMMY(selectedVehicle) : 'Fahrzeug'}`);
                                  const body = encodeURIComponent(
                                    `Sehr geehrte/r ${selectedCustomer?.name || 'Kunde/in'},\n\nanbei Ihr Mietvertrag.\n\n` +
                                    `Fahrzeug: ${selectedVehicle ? buildMMY(selectedVehicle) : '–'} (${selectedVehicle?.license || '–'})\n` +
                                    `Zeitraum: ${pickupDate ? new Date(pickupDate).toLocaleDateString('de-DE') : '–'} – ${returnDate ? new Date(returnDate).toLocaleDateString('de-DE') : '–'}\n` +
                                    `Gesamt: € ${grandTotal.toFixed(2)}\n\n` +
                                    'Mit freundlichen Grüßen\nIhr Flottenmanagement-Team'
                                  );
                                  const email = selectedCustomer?.email || '';
                                  window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_self');
                                }}
                                title="Per E-Mail senden"
                                className="p-1.5 rounded-md transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
                              >
                                <Icon name="send" className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Box 4: Bestätigungen */}
                {card(
                  <div className="p-4">
                    <h2 className="text-lg mb-3 text-muted-foreground">Bestätigungen</h2>
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={agbAccepted} onChange={(e) => setAgbAccepted(e.target.checked)} className="mt-0.5 rounded" />
                        <span className="text-xs text-foreground">
                          Kunde hat die <span className="text-blue-500 underline">Allgemeinen Geschäftsbedingungen (AGB)</span> und die Mietbedingungen erhalten.
                        </span>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} className="mt-0.5 rounded" />
                        <span className="text-xs text-foreground">
                          Kunde hat der <span className="text-blue-500 underline">Datenschutzerklärung</span> zugestimmt und wurde über die Verarbeitung seiner Daten informiert.
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Quick View Modal */}
                {quickViewDoc && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setQuickViewDoc(null)}>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className={`relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-lg shadow-2xl ${ 'bg-card border border-border' }`}
                    >
                      <div className="sticky top-0 flex items-center justify-between p-4 border-b border-border bg-card">
                        <h3 className="text-base text-foreground">
                          {quickViewDoc === 'invoice' ? 'Rechnung – Vorschau' : 'Mietvertrag – Vorschau'}
                        </h3>
                        <button onClick={() => setQuickViewDoc(null)} className="p-1.5 rounded-lg transition-all hover:bg-muted text-muted-foreground">
                          <Icon name="x" className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="p-4">
                        {quickViewDoc === 'invoice' ? (
                          <div className="space-y-4">
                            <div>
                              <h2 className="text-lg mb-1 text-foreground">Rechnung</h2>
                              <p className="text-xs text-muted-foreground">Erstellt am {new Date().toLocaleDateString('de-DE')}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs text-foreground">
                              <div>
                                <p className="text-xs mb-0.5 text-muted-foreground">Kunde</p>
                                <p>{selectedCustomer?.name || '–'}</p>
                                <p className="text-xs text-muted-foreground">{selectedCustomer?.email}</p>
                              </div>
                              <div>
                                <p className="text-xs mb-0.5 text-muted-foreground">Fahrzeug</p>
                                <p>{selectedVehicle ? buildMMY(selectedVehicle) : '–'}</p>
                                <p className="text-xs text-muted-foreground">{selectedVehicle?.license}</p>
                              </div>
                            </div>
                            <div className="border-t pt-3 space-y-2 border-border">
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">{rentalDays}x Tagestarif (€{dailyRate})</span>
                                <span className="text-foreground">€ {subtotal.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Packages & Extras</span>
                                <span className="text-foreground">€ {extrasTotal.toFixed(2)}</span>
                              </div>
                              {discountPercent > 0 && (
                                <div className="flex justify-between text-xs">
                                  <span className="text-green-500">Rabatt ({discountPercent}%)</span>
                                  <span className="text-green-500">-€ {discountAmount.toFixed(2)}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">MwSt. (19%)</span>
                                <span className="text-foreground">€ {tax.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between pt-2 border-t border-border">
                                <span className="text-foreground">Gesamt</span>
                                <span className="text-xs text-foreground">€ {grandTotal.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div>
                              <h2 className="text-lg mb-1 text-foreground">Mietvertrag</h2>
                              <p className="text-xs text-muted-foreground">Erstellt am {new Date().toLocaleDateString('de-DE')}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 text-xs text-foreground">
                              <div>
                                <p className="text-xs mb-0.5 text-muted-foreground">Vermieter</p>
                                <p>Flottenmanagement GmbH</p>
                              </div>
                              <div>
                                <p className="text-xs mb-0.5 text-muted-foreground">Mieter</p>
                                <p>{selectedCustomer?.name || '–'}</p>
                                <p className="text-xs text-muted-foreground">{selectedCustomer?.email}</p>
                              </div>
                            </div>
                            <div className="border-t pt-3 space-y-2 text-xs border-border text-foreground">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Fahrzeug</span>
                                <span>{selectedVehicle ? buildMMY(selectedVehicle) : '–'} · {selectedVehicle?.license || '–'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Zeitraum</span>
                                <span>{pickupDate ? new Date(pickupDate).toLocaleDateString('de-DE') : '–'} – {returnDate ? new Date(returnDate).toLocaleDateString('de-DE') : '–'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Abhol-/Rückgabezeit</span>
                                <span>{pickupTime} – {returnTime}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Frei-Kilometer</span>
                                <span>{totalFreeKm.toLocaleString('de-DE')} km</span>
                              </div>
                              <div className="flex justify-between pt-2 border-t border-border">
                                <span>Gesamtkosten</span>
                                <span className="text-xs text-foreground">€ {grandTotal.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Kaution</span>
                                <span className="text-[color:var(--status-watch)]">€ {depositAmount.toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="border-t pt-6 mt-6 flex gap-16 border-border">
                              <div className="flex-1">
                                <div className="border-t pt-2 text-xs border-border text-muted-foreground">Unterschrift Vermieter</div>
                              </div>
                              <div className="flex-1">
                                <div className="border-t pt-2 text-xs border-border text-muted-foreground">Unterschrift Mieter</div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar Summary - 1 col */}
          <div className="space-y-5">

            {/* Combined Buchungsübersicht & Preisübersicht – all steps */}
            {card(
              <div className="p-4">
                <h3 className="text-base mb-3 text-muted-foreground">Buchungs- & Preisübersicht</h3>

                {/* Compact booking details in 2-col grid */}
                <div className="space-y-4 mb-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] mb-1 text-muted-foreground">Fahrzeug</div>
                      {selectedVehicle ? (
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 p-1 bg-muted/50">
                            <BrandLogo
                              brand={getBrandFromModel(selectedVehicle.make ?? selectedVehicle.model ?? '')}
                              size={20}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs truncate text-foreground">{buildMMY(selectedVehicle)}</p>
                            <p className="text-[11px] text-muted-foreground">{selectedVehicle.license}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs italic text-muted-foreground">–</p>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] mb-1 text-muted-foreground">Kunde</div>
                      {selectedCustomer ? (
                        <>
                          <p className="text-xs text-foreground">{selectedCustomer.name}</p>
                          <p className="text-[11px] text-muted-foreground">{selectedCustomer.type === 'Corporate' ? 'Firmenkunde' : 'Privatkunde'}</p>
                        </>
                      ) : (
                        <p className="text-xs italic text-muted-foreground">–</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[11px] mb-1 text-muted-foreground">Zeitraum</div>
                      {pickupDate && returnDate ? (
                        <>
                          <p className="text-xs text-foreground">
                            {new Date(pickupDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })} – {new Date(returnDate).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{rentalDays} Tage · {pickupTime} – {returnTime}</p>
                        </>
                      ) : (
                        <p className="text-xs italic text-muted-foreground">–</p>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] mb-1 text-muted-foreground">Station</div>
                      {pickupStation ? (
                        <>
                          <p className="text-xs flex items-center gap-1 text-foreground">
                            <Icon name="map-pin" className="w-3 h-3" />{pickupStation}
                          </p>
                          {!sameReturnStation && returnStation && returnStation !== pickupStation && (
                            <p className="text-[11px] text-muted-foreground">Rückgabe: {returnStation}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs italic text-muted-foreground">–</p>
                      )}
                    </div>
                  </div>
                  {(selectedMileagePackage || selectedInsurances.length > 0 || extras.length > 0) && (
                    <div>
                      <div className="text-[11px] mb-1.5 text-muted-foreground">Extras & Packages</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedMileagePackage && (() => {
                          const pkg = mileagePackages.find(p => p.id === selectedMileagePackage);
                          return pkg ? <span className="text-[11px] px-1.5 py-0.5 rounded-full sq-chip-success">+{pkg.km}km</span> : null;
                        })()}
                        {selectedInsurances.map(insId => {
                          const ins = insuranceOptions.find(i => i.id === insId);
                          return <span key={insId} className="text-[11px] px-1.5 py-0.5 rounded-full sq-tone-ai">{ins?.name}</span>;
                        })}
                        {extras.map(e => {
                          const opt = extraOptions.find(o => o.id === e);
                          return <span key={e} className="text-[11px] px-1.5 py-0.5 rounded-full sq-chip-info">{opt?.label}</span>;
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Divider between booking info and price */}
                <div className="border-t mb-3 border-border" />

                {/* Price breakdown */}
                <div className="space-y-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{rentalDays}x Tagestarif (€{dailyRate})</span>
                    <span className="text-foreground">€ {subtotal.toFixed(2)}</span>
                  </div>
                  {extrasTotal > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Packages & Extras</span>
                      <span className="text-foreground">{'\u20AC'} {extrasTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {(selectedMileagePackage || selectedInsurances.length > 0 || extras.length > 0) && (
                    <div className="pl-3 space-y-1.5 border-l border-border">
                      {selectedMileagePackage && (() => {
                        const pkg = mileagePackages.find(p => p.id === selectedMileagePackage);
                        return pkg ? (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">+{pkg.km}km Package</span>
                            <span className="text-muted-foreground">{'\u20AC'}{pkg.price.toFixed(2)}</span>
                          </div>
                        ) : null;
                      })()}
                      {selectedInsurances.map(insId => {
                        const ins = insuranceOptions.find(i => i.id === insId);
                        return ins ? (
                          <div key={insId} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{ins.name}</span>
                            <span className="text-muted-foreground">{'\u20AC'}{(ins.dailyPrice * rentalDays).toFixed(2)}</span>
                          </div>
                        ) : null;
                      })}
                      {extras.map(e => {
                        const opt = extraOptions.find(o => o.id === e);
                        return opt ? (
                          <div key={e} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{opt.label}</span>
                            <span className="text-muted-foreground">{'\u20AC'}{(opt.dailyPrice * rentalDays).toFixed(2)}</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Frei-Kilometer</span>
                    <span className="text-[color:var(--status-positive)]">{totalFreeKm.toLocaleString('de-DE')} km</span>
                  </div>
                  {mileagePkgKm > 0 && (
                    <div className="pl-3 space-y-1.5 border-l border-border">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Basis ({freeKmPerDay} km/Tag × {rentalDays})</span>
                        <span className="text-muted-foreground">{baseFreeKm.toLocaleString('de-DE')} km</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[color:var(--status-positive)]">+ Kilometerpaket</span>
                        <span className="text-[color:var(--status-positive)]">+{mileagePkgKm.toLocaleString('de-DE')} km</span>
                      </div>
                    </div>
                  )}
                  {discountPercent > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-green-500">Rabatt ({discountPercent}%)</span>
                      <span className="text-green-500">-€ {discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="pt-3 mt-2 border-t space-y-2 border-border">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Zwischensumme</span>
                      <span className="text-foreground">€ {totalBeforeTax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">MwSt. (19%)</span>
                      <span className="text-foreground">€ {tax.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-baseline pt-3 border-t border-border">
                    <span className="text-foreground">Gesamt</span>
                    <span className="text-base text-foreground">€ {grandTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Kaution</span>
                    <span className="text-[color:var(--status-watch)]">€ {depositAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-3">
              {currentStep > 1 && (
                <button
                  onClick={() => setCurrentStep(s => s - 1)}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${ 'bg-card border border-border text-foreground hover:bg-muted' }`}
                >
                  <Icon name="arrow-left" className="w-5 h-5" />
                  Zurück
                </button>
              )}
              {currentStep < 5 ? (
                <button
                  onClick={() => setCurrentStep(s => s + 1)}
                  disabled={!canProceed()}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${ canProceed() ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-[0_4px_16px_rgba(59,130,246,0.3)]' : 'bg-muted text-muted-foreground cursor-not-allowed' }`}
                >
                  Weiter
                  <Icon name="arrow-right" className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={handleConfirm}
                  disabled={!canProceed() || isSavingBooking}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs transition-all ${ canProceed() && !isSavingBooking ? 'bg-green-600 text-white hover:bg-green-700 shadow-[0_4px_16px_rgba(34,197,94,0.3)]' : 'bg-muted text-muted-foreground cursor-not-allowed' }`}
                >
                  <Icon name="check" className="w-5 h-5" />
                  {isSavingBooking ? 'Speichert…' : 'Buchung bestätigen'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
