import { useState, useEffect } from 'react';
import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import { ArrowLeft, Phone, Mail, MapPin, Calendar, Car, CreditCard, Star, ChevronLeft, ChevronRight, Download, Upload, Plus, Search, AlertTriangle, FileText, Clock, TrendingUp, TrendingDown, Ban, Eye, UserCheck, Shield, CheckCircle, XCircle, Copy, Globe, Smartphone, Activity, Gauge, Zap, X, Hash, Navigation, Wind, ThermometerSun, Info, Route, Receipt } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  type: 'Individual' | 'Corporate';
  status: 'Active' | 'Under Review' | 'Suspended' | 'Blocked';
  riskLevel: 'Low Risk' | 'Medium Risk' | 'High Risk';
  drivingScore: number;
  lastTrip: string;
  totalBookings: number;
  totalRevenue: string;
  joinDate: string;
  licenseExpiry: string;
  licenseVerified: boolean;
  idVerified: boolean;
  accidents: number;
  violations: number;
  city: string;
  currentVehicle?: string;
  notes?: string;
}

interface CustomerDetailViewProps {
  customer: Customer;
  isDarkMode: boolean;
  onBack: () => void;
  onUpdateCustomer?: (updatedCustomer: Customer) => void;
}

type DetailTab = 'overview' | 'bookings' | 'driving' | 'trips' | 'fines' | 'documents' | 'invoices' | 'alerts';

// Generate booking list from API data when available — empty when no fleet
function generateBookings(customer: Customer, fleetVehicles: { license: string; model: string; station: string }[]) {
  const statuses = ['Paid', 'Pending', 'Completed', 'Picked-Up'] as const;
  const stations = [...new Set(fleetVehicles.map(v => v.station))].filter(Boolean);
  const count = Math.min(customer.totalBookings, Math.max(0, fleetVehicles.length));
  if (count === 0 || fleetVehicles.length === 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const id = 2172 - i;
    const day = (19 - i * 2 + 30) % 28 + 1;
    const dayEnd = (21 - i * 2 + 30) % 28 + 1;
    const dur = (i % 3) + 1;
    const st = statuses[i % statuses.length];
    const v = fleetVehicles[i % fleetVehicles.length];
    const pickup = v.station;
    const ret =
      stations.length > 0
        ? stations[(stations.indexOf(v.station) + 1) % stations.length]
        : v.station;
    return {
      bookingId: `#${id}`,
      vehicle: `${v.license} / ${v.model}`,
      dateStart: `${String(day).padStart(2, '0')}.03.26`,
      dateEnd: `${String(dayEnd).padStart(2, '0')}.03.26`,
      pickupLocation: pickup,
      returnLocation: ret,
      duration: `${dur} Days`,
      status: st,
      payment: `â‚¬ ${(dur * 120 + i * 10)}`,
      paymentMethod: i % 3 === 0 ? 'VISA' : i % 3 === 1 ? 'MC' : 'VISA',
    };
  });
}

function generateTrips(customer: Customer) {
  const cities: string[] = [];
  const count = Math.min(customer.totalBookings, 10);
  const bookingIds = Array.from({ length: count }, (_, i) => `#${2172 - i}`);
  // Generate 2-4 trips per booking
  const allTrips: { id: string; bookingId: string; date: string; startTime: string; endTime: string; from: string; to: string; distance: number; duration: string; score: number; alerts: number }[] = [];
  let tripCounter = 0;
  bookingIds.forEach((bId, bIdx) => {
    const tripCount = 2 + (bIdx % 3); // 2, 3, or 4 trips
    for (let t = 0; t < tripCount; t++) {
      const day = ((19 - bIdx * 2 + t + 30) % 28) + 1;
      const startH = 7 + t * 3 + (bIdx % 2);
      const endH = startH + 1 + (t % 2);
      const dist = 18 + tripCounter * 12 + t * 7;
      allTrips.push({
        id: `T-${4500 + tripCounter}`,
        bookingId: bId,
        date: `${String(day).padStart(2, '0')}.03.2026`,
        startTime: `${String(startH).padStart(2, '0')}:${String((t * 15) % 60).padStart(2, '0')}`,
        endTime: `${String(endH).padStart(2, '0')}:${String((t * 20 + 10) % 60).padStart(2, '0')}`,
        from: cities.length > 0 ? cities[tripCounter % cities.length] : '',
        to: cities.length > 0 ? cities[(tripCounter + 2) % cities.length] : '',
        distance: dist,
        duration: `${endH - startH}h ${10 + t * 12}min`,
        score: Math.max(55, customer.drivingScore - tripCounter * 2 + (t % 5)),
        alerts: tripCounter < 3 ? (tripCounter % 2) + t % 2 : 0,
      });
      tripCounter++;
    }
  });
  return allTrips;
}

function useCustomerFines(customerId: string) {
  const { orgId } = useRentalOrg();
  const [fines, setFines] = useState<any[]>([]);
  useEffect(() => {
    if (!orgId || !customerId) return;
    api.fines.byCustomer(orgId, customerId).then(setFines).catch(() => setFines([]));
  }, [orgId, customerId]);
  return fines;
}

function _generateFines_UNUSED(customer: Customer) {
  if (customer.violations === 0) return [];
  return Array.from({ length: Math.min(customer.violations, 5) }, (_, i) => ({
    id: `F-${1000 + i}`,
    date: `${(15 - i * 5 + 30) % 28 + 1}.0${(i % 3) + 1}.2026`,
    type: i % 3 === 0 ? 'Speeding' : i % 3 === 1 ? 'Parking Violation' : 'Red Light',
    description: i % 3 === 0
      ? `${80 + i * 15} km/h in 50 km/h zone`
      : i % 3 === 1
        ? 'Parking in no-parking zone'
        : 'Ran red light at intersection',
    amount: `â‚¬ ${(50 + i * 35)}`,
    status: i < 2 ? 'Unpaid' : 'Paid',
    vehicle: i % 2 === 0 ? 'DEF-456 / VW Polo' : 'ABC-123 / Ford Transit',
  }));
}

function generateDocuments(customer: Customer) {
  const baseDocs = [
    { name: 'German_ID_Card.pdf', type: 'ID Card', uploaded: '21.02.2024', status: 'Verified' as const },
    { name: 'KYC_Form.pdf', type: 'PDF Document', uploaded: '21.02.2024', status: 'Verified' as const },
    { name: 'Drivers_License.pdf', type: 'License', uploaded: '15.01.2024', status: customer.licenseVerified ? 'Verified' as const : 'Pending' as const },
    { name: 'Insurance_Certificate.pdf', type: 'PDF Document', uploaded: '15.01.2024', status: 'Verified' as const },
    { name: 'Vehicle_Rental_Agreement.pdf', type: 'PDF Document', uploaded: '15.01.2024', status: 'Verified' as const },
  ];
  if (customer.type === 'Corporate' && customer.company) {
    baseDocs.push(
      { name: 'Business_License.pdf', type: 'PDF Document', uploaded: '15.01.2024', status: 'Verified' as const },
      { name: `${customer.company.replace(/\s+/g, '_')}_Invoicing.pdf`, type: 'PDF Document', uploaded: '24.01.2024', status: 'Verified' as const },
      { name: 'Contract_Amendment.pdf', type: 'PDF Document', uploaded: '15.01.2024', status: 'Verified' as const },
    );
  }
  return baseDocs;
}

function useCustomerInvoices(customerId: string) {
  const { orgId } = useRentalOrg();
  const [invoices, setInvoices] = useState<any[]>([]);
  useEffect(() => {
    if (!orgId || !customerId) return;
    api.invoices.byCustomer(orgId, customerId).then(setInvoices).catch(() => setInvoices([]));
  }, [orgId, customerId]);
  return invoices;
}

function _generateInvoices_UNUSED(customer: Customer) {
  return Array.from({ length: Math.min(customer.totalBookings, 8) }, (_, i) => ({
    id: `INV-${2026}${String(i + 1).padStart(4, '0')}`,
    date: `${(28 - i * 3)}.01.2026`,
    description: i % 3 === 0 ? 'Vehicle Rental' : i % 3 === 1 ? 'Extra Insurance' : 'Fuel Surcharge',
    amount: `â‚¬ ${(120 + i * 45)},00`,
    status: i < 3 ? 'Paid' : i < 5 ? 'Pending' : 'Overdue',
    bookingRef: `#${2172 - i}`,
  }));
}

function generateAlerts(customer: Customer) {
  const alerts = [];
  if (customer.violations > 2) {
    alerts.push({ date: '24.04.', type: 'Speeding', subType: 'PDF Document', message: `Driver was speeding at 154 km/h, exceeding the limit by +54 km/h.`, severity: 'High' as const });
  }
  if (customer.accidents > 0) {
    alerts.push({ date: '18.04.', type: 'Unassigned Trip', subType: 'ID Card', message: `Vehicle was driven 32 km outside of a booking.`, severity: 'High' as const });
  }
  if (customer.riskLevel === 'High Risk') {
    alerts.push({ date: '10.02.', type: 'Harsh Braking', subType: 'PDF Document', message: `Frequent harsh braking recorded for assigned vehicle.`, severity: 'Medium' as const });
  }
  if (!customer.licenseVerified) {
    alerts.push({ date: '22.01.', type: 'License Alert', subType: '', message: `Driver's license verification is still pending.`, severity: 'High' as const });
  }
  if (customer.licenseExpiry < '01.01.2027') {
    alerts.push({ date: '22.01.', type: 'License Alert', subType: '', message: `Driver's license will expire on ${customer.licenseExpiry}.`, severity: 'Low' as const });
  }
  if (alerts.length === 0) {
    alerts.push({ date: '15.02.', type: 'Info', subType: '', message: 'No alerts for this customer.', severity: 'Low' as const });
  }
  return alerts;
}

function generateNotes(customer: Customer) {
  const notes = [
    { date: '21.02.2024', priority: 'Medium' as const, author: '#10 Tim Schröder', message: customer.notes || 'Follow up on insurance add-on requests.', status: 'Verified' as const },
    { date: '15.01.2024', priority: 'Low' as const, author: '#27 Sarah Mayer', message: `Customer prefers morning pick-ups and online invoices.`, status: 'Verified' as const },
  ];
  if (customer.riskLevel === 'High Risk') {
    notes.unshift({ date: '03.01.2024', priority: 'High' as const, author: '#03 Tim Schröder', message: `Reminder: Outstanding damage fee for booking.`, status: 'Verified' as const });
  }
  return notes;
}

export function CustomerDetailView({ customer, isDarkMode, onBack, onUpdateCustomer }: CustomerDetailViewProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [bookingPage, setBookingPage] = useState(1);
  const [noteFilter, setNoteFilter] = useState<'all' | 'open' | 'done'>('all');
  const [tripsBookingFilter, setTripsBookingFilter] = useState<string | null>(null);

  const { fleetVehicles } = useFleetVehicles();
  const fleetForBookings = fleetVehicles.map(v => ({ license: v.license, model: v.model, station: v.station }));
  const bookings = generateBookings(customer, fleetForBookings);
  const trips = generateTrips(customer);
  const apiFines = useCustomerFines(customer.id);
  const documents = generateDocuments(customer);
  const apiInvoices = useCustomerInvoices(customer.id);
  const alerts = generateAlerts(customer);
  const notes = generateNotes(customer);

  const bookingsThisYear = Math.ceil(customer.totalBookings * 0.35);
  const kmDriven = `${(customer.totalBookings * 312).toLocaleString('de-DE')} km`;
  const harshBrakingEvents = Math.max(0, Math.round((100 - customer.drivingScore) * 0.4 + customer.accidents * 3));
  const speedingEvents = customer.violations;
  const phoneUsage = customer.drivingScore >= 80 ? 'Low' : customer.drivingScore >= 60 ? 'Medium' : 'High';
  const driverBirthYear = 1985 + (parseInt(customer.id.replace('c', '')) % 12);
  const driverDOB = `${(12 + parseInt(customer.id.replace('c', '')) * 3) % 28 + 1}.${(parseInt(customer.id.replace('c', '')) % 12) + 1}.${driverBirthYear}`;
  const driverId = `B.${1000 + parseInt(customer.id.replace('c', '')) * 111}`;
  const customerId = `CID-${customer.id.replace('c', '')}4821`;

  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const textTertiary = isDarkMode ? 'text-gray-500' : 'text-gray-400';
  const borderColor = isDarkMode ? 'border-neutral-700' : 'border-gray-200';
  const cardBg = isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200';
  const rowHover = isDarkMode ? 'hover:bg-neutral-800/60' : 'hover:bg-blue-50/30';
  const thClass = `text-left text-xs uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`;
  const tdClass = `px-3 py-2 text-xs`;

  const StatusPill = ({ status }: { status: string }) => {
    const s: Record<string, string> = {
      'Active': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'Under Review': 'bg-amber-100 text-amber-700 border-amber-200',
      'Suspended': 'bg-red-100 text-red-700 border-red-200',
      'Blocked': 'bg-gray-200 text-gray-700 border-gray-300',
    };
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${s[status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>{status}</span>;
  };

  const RiskPill = ({ level }: { level: string }) => {
    const s: Record<string, string> = {
      'Low Risk': 'bg-green-50 text-green-700 border-green-200',
      'Medium Risk': 'bg-amber-50 text-amber-700 border-amber-200',
      'High Risk': 'bg-red-50 text-red-700 border-red-200',
    };
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${s[level]}`}>{level}</span>;
  };

  const BookingStatusPill = ({ status }: { status: string }) => {
    const s: Record<string, string> = {
      'Paid': 'bg-green-100 text-green-700',
      'Pending': 'bg-amber-100 text-amber-700',
      'Completed': 'bg-blue-100 text-blue-700',
      'Picked-Up': 'bg-purple-100 text-purple-700',
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold ${s[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
  };

  const SeverityPill = ({ severity }: { severity: string }) => {
    const s: Record<string, string> = {
      'High': 'text-red-600',
      'Medium': 'text-amber-600',
      'Low': 'text-green-600',
    };
    const icons: Record<string, string> = { 'High': 'â–²', 'Medium': '?', 'Low': 'â–¼' };
    return <span className={`text-xs font-semibold ${s[severity]}`}>{icons[severity]} {severity}</span>;
  };

  const PriorityPill = ({ priority }: { priority: string }) => {
    const s: Record<string, string> = {
      'High': 'bg-red-100 text-red-700 border-red-200',
      'Medium': 'bg-amber-100 text-amber-700 border-amber-200',
      'Low': 'bg-green-100 text-green-700 border-green-200',
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border ${s[priority]}`}>{priority}</span>;
  };

  const PaymentIcon = ({ method }: { method: string }) => (
    <div className="flex items-center gap-1">
      <div className={`w-7 h-4.5 rounded-sm flex items-center justify-center text-[8px] font-bold ${method === 'VISA' ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white'}`}>
        {method}
      </div>
    </div>
  );

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'bookings', label: 'Bookings' },
    { key: 'driving', label: 'Driving Behavior' },
    { key: 'trips', label: 'Trips' },
    { key: 'fines', label: 'Fines' },
    { key: 'documents', label: 'Documents' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'alerts', label: 'Alerts & Notes' },
  ];

  const Pagination = ({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) => {
    const pages = Array.from({ length: Math.min(total, 5) }, (_, i) => i + 1);
    return (
      <div className="flex items-center justify-end gap-1 mt-3">
        <button onClick={() => onChange(Math.max(1, current - 1))} className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${isDarkMode ? 'text-gray-500 hover:bg-neutral-800' : 'text-gray-400 hover:bg-gray-100'}`}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pages.map(p => (
          <button key={p} onClick={() => onChange(p)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-semibold transition-colors ${
              p === current
                ? 'bg-blue-500 text-white'
                : isDarkMode ? 'text-gray-400 hover:bg-neutral-800' : 'text-gray-500 hover:bg-gray-100'
            }`}>
            {p}
          </button>
        ))}
        <button onClick={() => onChange(Math.min(total, current + 1))} className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-colors ${isDarkMode ? 'text-gray-500 hover:bg-neutral-800' : 'text-gray-400 hover:bg-gray-100'}`}>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header with Back Button - Booking Detail Style */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={onBack}
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
            isDarkMode ? 'bg-neutral-800/60' : 'bg-gray-100/80'
          }`}>
            <Hash className={`w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            <span className={`text-xs font-mono font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {customerId}
            </span>
          </div>
          <h1 className={`text-lg font-bold ${textPrimary}`}>
            Customer Details
          </h1>
          <span className={`text-xs px-3 py-1.5 rounded-full font-semibold flex items-center gap-1.5 ${
            customer.status === 'Active' ? 'bg-green-100 text-green-700' :
            customer.status === 'Suspended' ? 'bg-red-100 text-red-700' :
            customer.status === 'Blocked' ? 'bg-red-100 text-red-700' :
            'bg-amber-100 text-amber-700'
          }`}>
            {customer.status === 'Active' && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>}
            {customer.status === 'Suspended' && <Ban className="w-5 h-5" />}
            {customer.status === 'Blocked' && <XCircle className="w-5 h-5" />}
            {customer.status === 'Under Review' && <Clock className="w-5 h-5" />}
            {customer.status}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          {customer.status === 'Active' ? (
            <button
              onClick={() => onUpdateCustomer?.({ ...customer, status: 'Suspended' })}
              className="px-3 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-all shadow-sm">
              Suspend Customer
            </button>
          ) : customer.status === 'Suspended' || customer.status === 'Blocked' ? (
            <button
              onClick={() => onUpdateCustomer?.({ ...customer, status: 'Active' })}
              className="px-3 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-all shadow-sm">
              Reactivate
            </button>
          ) : (
            <button
              onClick={() => onUpdateCustomer?.({ ...customer, status: 'Active' })}
              className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-all shadow-sm">
              Complete Review
            </button>
          )}
          <a
            href={`tel:${customer.phone.replace(/\s/g, '')}`}
            className="px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition-all shadow-sm flex items-center gap-2 no-underline">
            <Phone className="w-3.5 h-3.5" />
            Contact
          </a>
        </div>
      </div>

      {/* Customer Identity */}
      <div className={`rounded-lg border p-4 ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-14 h-14 rounded-lg flex items-center justify-center text-xs font-bold text-white ${
            customer.status === 'Active' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
            customer.status === 'Under Review' ? 'bg-gradient-to-br from-amber-500 to-amber-600' :
            customer.status === 'Suspended' ? 'bg-gradient-to-br from-red-500 to-red-600' :
            'bg-gradient-to-br from-gray-500 to-gray-600'
          }`}>
            {customer.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className={`text-base font-bold ${textPrimary}`}>{customer.company ? customer.company : customer.name}</h3>
              {customer.company && (
                <span className={`text-xs ${textSecondary}`}>({customer.name})</span>
              )}
              {customer.idVerified && customer.licenseVerified ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                  <CheckCircle className="w-3 h-3" /> Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                  <Clock className="w-3 h-3" /> Unverified
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5 mt-1">
              <span className={`text-xs font-mono ${textSecondary}`}>CID-{customer.id.replace('c', '')}4821</span>
              <span className={textTertiary}>Â·</span>
              <RiskPill level={customer.riskLevel} />
              <span className={textTertiary}>Â·</span>
              <StatusPill status={customer.status} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                activeTab === tab.key
                  ? isDarkMode
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'bg-white text-gray-900 shadow-sm border border-gray-200'
                  : isDarkMode
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-neutral-800/50'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Summary Stats Bar */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total Bookings', value: String(customer.totalBookings), icon: Calendar, bg: 'bg-blue-100', color: 'text-blue-600' },
                { label: 'Distance Driven', value: kmDriven, icon: Car, bg: 'bg-green-100', color: 'text-green-600' },
                { label: 'Alerts', value: String(alerts.length), icon: AlertTriangle, bg: alerts.some(a => a.severity === 'High') ? 'bg-red-100' : 'bg-amber-100', color: alerts.some(a => a.severity === 'High') ? 'text-red-600' : 'text-amber-600' },
                { label: 'Driving Score', value: String(customer.drivingScore), icon: Star, bg: customer.drivingScore >= 80 ? 'bg-green-100' : customer.drivingScore >= 60 ? 'bg-amber-100' : 'bg-red-100', color: customer.drivingScore >= 80 ? 'text-green-600' : customer.drivingScore >= 60 ? 'text-amber-600' : 'text-red-600' },
              ].map(stat => (
                <div key={stat.label} className={`rounded-lg border p-4 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>{stat.label}</span>
                    <div className={`w-7 h-7 rounded-lg ${stat.bg} flex items-center justify-center`}>
                      <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                    </div>
                  </div>
                  <p className={`text-xs font-bold ${textPrimary}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-2 gap-3">
              {/* Left Column */}
              <div className="space-y-5">
                {/* Profile Card */}
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <h4 className={`text-xs font-bold mb-3 ${textPrimary}`}>Profile</h4>
                  <div className="space-y-3">
                    {[
                      { label: 'Name', value: customer.name },
                      { label: 'Date of Birth', value: driverDOB },
                      { label: 'Driver ID', value: driverId },
                      ...(customer.company ? [{ label: 'Company', value: customer.company }] : []),
                      { label: 'Customer Type', value: customer.type },
                      { label: 'License Expiry', value: customer.licenseExpiry },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between">
                        <span className={`text-xs ${textSecondary}`}>{item.label}</span>
                        <span className={`text-xs font-medium ${textPrimary}`}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contact Card */}
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <h4 className={`text-xs font-bold mb-3 ${textPrimary}`}>Contact</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Phone className={`w-5 h-5 ${textTertiary}`} />
                      <span className={`text-xs ${textPrimary}`}>{customer.phone}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className={`w-5 h-5 ${textTertiary}`} />
                      <span className={`text-xs ${textPrimary}`}>{customer.email}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Globe className={`w-5 h-5 ${textTertiary}`} />
                      <span className={`text-xs ${textPrimary}`}>German</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin className={`w-5 h-5 ${textTertiary}`} />
                      <span className={`text-xs ${textPrimary}`}>{customer.city}, DE</span>
                    </div>
                  </div>
                </div>

                {/* Notices Card */}
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <h4 className={`text-xs font-bold mb-3 ${textPrimary}`}>Notices</h4>
                  <div className="space-y-4">
                    {notes.slice(0, 2).map((n, i) => (
                      <div key={i} className={`pb-3 ${i < 1 ? `border-b ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-200'}` : ''}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <PriorityPill priority={n.priority} />
                          <span className={`text-[11px] ${textTertiary}`}>{n.date}</span>
                        </div>
                        <p className={`text-xs ${textSecondary}`}>{n.message}</p>
                        <p className={`text-[11px] mt-1 ${textTertiary}`}>{n.author}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setActiveTab('alerts')} className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium">
                    See all notes
                  </button>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-5">
                {/* Driving Behaviour Summary Card */}
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`text-xs font-bold ${textPrimary}`}>Driving Behavior</h4>
                    <button onClick={() => setActiveTab('driving')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Details</button>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative w-16 h-16">
                      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" className={isDarkMode ? 'stroke-neutral-700' : 'stroke-gray-200'} />
                        <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" strokeDasharray={`${(customer.drivingScore / 100) * 175.93} 175.93`} strokeLinecap="round" className={customer.drivingScore >= 80 ? 'stroke-green-500' : customer.drivingScore >= 60 ? 'stroke-amber-500' : 'stroke-red-500'} />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-xs font-bold ${textPrimary}`}>{customer.drivingScore}</span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      {[
                        { label: 'Behavior Events', value: Math.round(24 * ((100 - customer.drivingScore) / 30)) + Math.round(18 * ((100 - customer.drivingScore) / 30)) + Math.round(31 * ((100 - customer.drivingScore) / 30)) + Math.round(8 * ((100 - customer.drivingScore) / 30)) },
                        { label: 'Abuse Events', value: Math.round(12 * ((100 - customer.drivingScore) / 30)) + Math.round(5 * ((100 - customer.drivingScore) / 30)) + Math.round(22 * ((100 - customer.drivingScore) / 30)) + Math.round(15 * ((100 - customer.drivingScore) / 30)) + Math.round(3 * ((100 - customer.drivingScore) / 30)) + Math.round(19 * ((100 - customer.drivingScore) / 30)) },
                      ].map(item => (
                        <div key={item.label} className="flex items-center justify-between">
                          <span className={`text-xs ${textSecondary}`}>{item.label}</span>
                          <span className={`text-xs font-semibold ${textPrimary}`}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className={`p-3 rounded-lg text-center ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                    <span className={`text-[11px] ${textTertiary}`}>Score rated </span>
                    <span className={`text-[11px] font-semibold ${customer.drivingScore >= 80 ? 'text-green-500' : customer.drivingScore >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                      {customer.drivingScore >= 80 ? 'Good' : customer.drivingScore >= 60 ? 'Average' : 'Poor'}
                    </span>
                    <span className={`text-[11px] ${textTertiary}`}> â€â€ÂÂ view full insights in the </span>
                    <button onClick={() => setActiveTab('driving')} className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold">Driving Behavior</button>
                    <span className={`text-[11px] ${textTertiary}`}> tab</span>
                  </div>
                </div>

                {/* Driving Events Card */}
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`text-xs font-bold ${textPrimary}`}>Driving Events</h4>
                    <button onClick={() => setActiveTab('driving')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Details</button>
                  </div>
                  {(() => {
                    const factor = (100 - customer.drivingScore) / 30;
                    const events = [
                      { label: 'Harsh Acceleration', count: Math.round(24 * factor), icon: TrendingUp },
                      { label: 'Harsh Cornering', count: Math.round(18 * factor), icon: Navigation },
                      { label: 'Harsh Braking', count: Math.round(31 * factor), icon: TrendingDown },
                      { label: 'Extreme Braking', count: Math.round(8 * factor), icon: AlertTriangle },
                      { label: 'Idle Revving', count: Math.round(22 * factor), icon: Activity },
                      { label: 'Kickdown', count: Math.round(15 * factor), icon: Zap },
                      { label: 'High RPM', count: Math.round(19 * factor), icon: Gauge },
                    ];
                    const getSeverity = (count: number) => {
                      if (count <= 5) return 'success' as const;
                      if (count <= 15) return 'warning' as const;
                      return 'danger' as const;
                    };
                    const sevDot = {
                      success: 'bg-green-500',
                      warning: 'bg-amber-500',
                      danger: 'bg-red-500',
                    };
                    return (
                      <div className="space-y-0.5">
                        {events.map((ev, i) => {
                          const sev = getSeverity(ev.count);
                          return (
                            <div key={i} className={`flex items-center justify-between py-1.5 ${i < events.length - 1 ? `border-b ${isDarkMode ? 'border-neutral-700/30' : 'border-gray-100'}` : ''}`}>
                              <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${sevDot[sev]}`} />
                                <ev.icon className={`w-3.5 h-3.5 ${textTertiary}`} />
                                <span className={`text-xs ${textSecondary}`}>{ev.label}</span>
                              </div>
                              <span className={`text-xs font-semibold ${sev === 'danger' ? 'text-red-500' : sev === 'warning' ? 'text-amber-500' : 'text-green-500'}`}>{ev.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Fines Card */}
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`text-xs font-bold ${textPrimary}`}>Fines</h4>
                    <button onClick={() => setActiveTab('fines')} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Details</button>
                  </div>
                  {apiFines.length > 0 ? (
                    <div className={`rounded-lg border overflow-hidden ${borderColor}`}>
                      <table className="w-full">
                        <thead>
                          <tr className={`border-b ${borderColor} ${isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50/50'}`}>
                            <th className={`text-left text-xs uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`}>Date</th>
                            <th className={`text-left text-xs uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`}>Type</th>
                            <th className={`text-left text-xs uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`}>Status</th>
                            <th className={`text-left text-xs uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`}>Amount</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
                          {apiFines.slice(0, 3).map((f: any) => (
                            <tr key={f.id}>
                              <td className={`px-3 py-2 text-xs ${textPrimary}`}>{f.offenseDate ? new Date(f.offenseDate).toLocaleDateString('de-DE') : '—'}</td>
                              <td className={`px-3 py-2 text-xs ${textSecondary}`}>{f.offenseType || f.title}</td>
                              <td className={`px-3 py-2 text-xs font-medium ${f.status === 'RESOLVED' || f.status === 'CLOSED' ? textPrimary : 'text-red-500'}`}>{f.status}</td>
                              <td className={`px-3 py-2 text-xs font-semibold ${textPrimary}`}>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: f.currency || 'EUR' }).format(f.amountCents / 100)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-3">
                      <Shield className={`w-5 h-5 ${textTertiary}`} />
                      <span className={`text-xs ${textSecondary}`}>No fines recorded</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BOOKINGS TAB */}
        {activeTab === 'bookings' && (
          <div className="space-y-5">
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${cardBg}`}>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${textSecondary}`}>Total Bookings:</span>
                <span className={`text-xs font-bold ${textPrimary}`}>{customer.totalBookings}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${textSecondary}`}>Bookings this Year:</span>
                <span className={`text-xs font-bold ${textPrimary}`}>{bookingsThisYear}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${textSecondary}`}>Kilometers Driven:</span>
                <span className={`text-xs font-bold ${textPrimary}`}>{kmDriven}</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className={`text-xs ${textSecondary}`}>Total Revenue:</span>
                <span className="text-[10px] font-bold text-green-600">{customer.totalRevenue}</span>
              </div>
            </div>

            <div className={`rounded-lg border overflow-hidden ${borderColor}`}>
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${borderColor} ${isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50/50'}`}>
                    <th className={thClass}>Booking ID</th>
                    <th className={thClass}>Vehicle</th>
                    <th className={thClass}>Date</th>
                    <th className={thClass}>Pick-Up Location</th>
                    <th className={thClass}>Return Location</th>
                    <th className={thClass}>Duration</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Payment</th>
                    <th className={`text-center text-xs uppercase tracking-wider font-semibold px-2 py-3 ${textTertiary}`}>Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
                  {bookings.map((b, i) => {
                    const bookingTrips = trips.filter(t => t.bookingId === b.bookingId);
                    const matchingInvoice = apiInvoices.find((inv: any) => inv.bookingId === b.bookingId);
                    return (
                    <tr key={i} className={`transition-colors ${rowHover}`}>
                      <td className={`${tdClass} font-semibold ${textPrimary}`}>{b.bookingId}</td>
                      <td className={tdClass}>
                        <p className={`text-xs font-medium ${textPrimary}`}>{b.vehicle.split(' / ')[0]}</p>
                        <p className={`text-[11px] ${textTertiary}`}>{b.vehicle.split(' / ')[1]}</p>
                      </td>
                      <td className={tdClass}>
                        <p className={`text-xs ${textPrimary}`}>{b.dateStart}</p>
                        <p className={`text-[11px] ${textTertiary}`}>{b.dateEnd}</p>
                      </td>
                      <td className={`${tdClass} ${textSecondary}`}>{b.pickupLocation}</td>
                      <td className={tdClass}>
                        <p className={`text-xs ${textSecondary}`}>{b.returnLocation}</p>
                      </td>
                      <td className={`${tdClass} ${textSecondary}`}>{b.duration}</td>
                      <td className={tdClass}>
                        <div className="flex items-center gap-1.5">
                          <BookingStatusPill status={b.status} />
                          <PaymentIcon method={b.paymentMethod} />
                        </div>
                      </td>
                      <td className={`${tdClass} font-semibold ${textPrimary}`}>{b.payment}</td>
                      <td className={`${tdClass}`}>
                        <div className="flex items-center gap-1.5">
                          {matchingInvoice && (
                            <button
                              onClick={() => setActiveTab('invoices')}
                              title={`Invoice ${matchingInvoice.id}`}
                              className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'}`}
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span className="text-[8px] font-medium leading-none">Invoice</span>
                            </button>
                          )}
                          <button
                            onClick={() => { setTripsBookingFilter(b.bookingId); setActiveTab('trips'); }}
                            title={`${bookingTrips.length} Trips`}
                            className={`flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-400 hover:text-gray-700'}`}
                          >
                            <Route className="w-3.5 h-3.5" />
                            <span className="text-[8px] font-medium leading-none">Trips</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <span className={`text-xs ${textTertiary}`}>Showing 1 to {bookings.length} of {customer.totalBookings} entries</span>
              <Pagination current={bookingPage} total={Math.ceil(customer.totalBookings / 10)} onChange={setBookingPage} />
            </div>
          </div>
        )}

        {/* DRIVING BEHAVIOR TAB */}
        {activeTab === 'driving' && (
          <div className="space-y-5">
            {/* Score Header */}
            <div className={`rounded-lg border p-4 ${cardBg}`}>
              <div className="flex items-center gap-3">
                <div className="relative w-24 h-24">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                    <circle cx="48" cy="48" r="42" fill="none" strokeWidth="6" className={isDarkMode ? 'stroke-neutral-700' : 'stroke-gray-200'} />
                    <circle cx="48" cy="48" r="42" fill="none" strokeWidth="6" strokeDasharray={`${(customer.drivingScore / 100) * 263.89} 263.89`} strokeLinecap="round" className={customer.drivingScore >= 80 ? 'stroke-green-500' : customer.drivingScore >= 60 ? 'stroke-amber-500' : 'stroke-red-500'} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-xs font-bold ${textPrimary}`}>{customer.drivingScore}</span>
                    <span className={`text-xs uppercase tracking-wider ${textTertiary}`}>Score</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className={`text-base font-bold mb-1 ${textPrimary}`}>Driving Score</h4>
                  <p className={`text-xs mb-3 ${textSecondary}`}>
                    {customer.name}'s overall driving performance is rated{' '}
                    <span className={`font-semibold ${customer.drivingScore >= 80 ? 'text-green-500' : customer.drivingScore >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                      {customer.drivingScore >= 80 ? 'Good' : customer.drivingScore >= 60 ? 'Average' : 'Poor'}
                    </span>.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Risk Level', value: customer.riskLevel, color: customer.riskLevel === 'Low Risk' ? 'text-green-500' : customer.riskLevel === 'Medium Risk' ? 'text-amber-500' : 'text-red-500' },
                      { label: 'Total Bookings', value: String(customer.totalBookings), color: textPrimary },
                      { label: 'Status', value: customer.status, color: customer.status === 'Active' ? 'text-green-500' : textSecondary },
                    ].map(item => (
                      <div key={item.label} className={`p-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                        <span className={`text-xs uppercase tracking-wider ${textTertiary}`}>{item.label}</span>
                        <p className={`text-xs font-semibold mt-0.5 ${item.color}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Two Column: Driving Behavior + Abuse Detection */}
            <div className="grid grid-cols-2 gap-3">
              {/* Driving Behavior */}
              <div className={`rounded-lg border p-4 ${cardBg}`}>
                <h4 className={`text-xs font-bold mb-3 ${textPrimary}`}>Driving Behavior</h4>
                {(() => {
                  const factor = (100 - customer.drivingScore) / 30;
                  const items = [
                    { label: 'Harsh Acceleration', count: Math.round(24 * factor), icon: TrendingUp, description: 'Rapid increase in speed that can waste fuel and cause excessive wear on the vehicle' },
                    { label: 'Harsh Cornering', count: Math.round(18 * factor), icon: Navigation, description: 'Taking turns at high speeds with excessive lateral force on the vehicle' },
                    { label: 'Harsh Braking', count: Math.round(31 * factor), icon: TrendingDown, description: 'Sudden deceleration events that indicate poor anticipation and brake wear' },
                    { label: 'Extreme Braking', count: Math.round(8 * factor), icon: AlertTriangle, description: 'Emergency-level braking events that may indicate dangerous driving situations' },
                  ];
                  const getSeverity = (count: number): 'success' | 'warning' | 'danger' => {
                    if (count <= 5) return 'success';
                    if (count <= 15) return 'warning';
                    return 'danger';
                  };
                  const severityColors = {
                    success: isDarkMode ? 'bg-green-950/80 border-green-700/60 text-green-300' : 'bg-green-50 border-green-200 text-green-700',
                    warning: isDarkMode ? 'bg-yellow-950/80 border-yellow-700/60 text-yellow-300' : 'bg-yellow-50 border-yellow-200 text-yellow-700',
                    danger: isDarkMode ? 'bg-red-950/80 border-red-700/60 text-red-300' : 'bg-red-50 border-red-200 text-red-700',
                  };
                  const totalBehavior = items.reduce((s, b) => s + b.count, 0);
                  return (
                    <>
                      <div className="space-y-2 mb-3">
                        {items.map((item, index) => {
                          const sev = getSeverity(item.count);
                          return (
                            <div key={index} className={`p-3 rounded-lg border ${severityColors[sev]} group relative`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                  <item.icon className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-semibold">{item.label}</span>
                                  <div className="relative">
                                    <Info className="w-3 h-3 opacity-50 hover:opacity-100 transition-opacity cursor-help" />
                                    <div className={`absolute left-0 bottom-full mb-2 w-56 p-2.5 rounded-lg border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 ${isDarkMode ? 'bg-neutral-900/95 border-neutral-700 text-gray-300' : 'bg-white/95 border-gray-200 text-gray-700'}`}>
                                      <p className="text-xs leading-relaxed">{item.description}</p>
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[10px] font-bold">{item.count}</span>
                              </div>
                              <div className={`w-full h-1 rounded-full overflow-hidden ${isDarkMode ? 'bg-neutral-800' : 'bg-white'}`}>
                                <div className={`h-full ${sev === 'danger' ? 'bg-red-500' : sev === 'warning' ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min((item.count / 50) * 100, 100)}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className={`p-3 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-medium ${textTertiary}`}>Total Behavior Events</span>
                          <span className={`text-xs font-bold ${textPrimary}`}>{totalBehavior}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Abuse Detection */}
              <div className={`rounded-lg border p-4 ${cardBg}`}>
                <h4 className={`text-xs font-bold mb-3 ${textPrimary}`}>Abuse Detection</h4>
                {(() => {
                  const factor = (100 - customer.drivingScore) / 30;
                  const items = [
                    { label: 'Cold Engine: High RPM', count: Math.round(12 * factor), icon: ThermometerSun, description: 'Running the engine at high RPMs before it reaches optimal operating temperature' },
                    { label: 'Cold Engine: Full Throttle', count: Math.round(5 * factor), icon: Wind, description: 'Applying full throttle with a cold engine, causing excessive wear' },
                    { label: 'Idle Revving', count: Math.round(22 * factor), icon: Activity, description: 'Unnecessarily revving the engine while stationary, wasting fuel' },
                    { label: 'Kickdown', count: Math.round(15 * factor), icon: Zap, description: 'Frequent use of full throttle acceleration in automatic transmission' },
                    { label: 'Long Idle', count: Math.round(3 * factor), icon: Clock, description: 'Extended periods of engine running while the vehicle is stationary' },
                    { label: 'Constant High RPM', count: Math.round(19 * factor), icon: Gauge, description: 'Prolonged driving at high engine speeds, reducing fuel efficiency' },
                  ];
                  const getSeverity = (count: number): 'success' | 'warning' | 'danger' => {
                    if (count <= 5) return 'success';
                    if (count <= 15) return 'warning';
                    return 'danger';
                  };
                  const severityColors = {
                    success: isDarkMode ? 'bg-green-950/80 border-green-700/60 text-green-300' : 'bg-green-50 border-green-200 text-green-700',
                    warning: isDarkMode ? 'bg-yellow-950/80 border-yellow-700/60 text-yellow-300' : 'bg-yellow-50 border-yellow-200 text-yellow-700',
                    danger: isDarkMode ? 'bg-red-950/80 border-red-700/60 text-red-300' : 'bg-red-50 border-red-200 text-red-700',
                  };
                  const totalAbuse = items.reduce((s, a) => s + a.count, 0);
                  return (
                    <>
                      <div className="space-y-2 mb-3">
                        {items.map((item, index) => {
                          const sev = getSeverity(item.count);
                          return (
                            <div key={index} className={`p-3 rounded-lg border ${severityColors[sev]} group relative`}>
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2">
                                  <item.icon className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-semibold">{item.label}</span>
                                  <div className="relative">
                                    <Info className="w-3 h-3 opacity-50 hover:opacity-100 transition-opacity cursor-help" />
                                    <div className={`absolute left-0 bottom-full mb-2 w-56 p-2.5 rounded-lg border shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 ${isDarkMode ? 'bg-neutral-900/95 border-neutral-700 text-gray-300' : 'bg-white/95 border-gray-200 text-gray-700'}`}>
                                      <p className="text-xs leading-relaxed">{item.description}</p>
                                    </div>
                                  </div>
                                </div>
                                <span className="text-[10px] font-bold">{item.count}</span>
                              </div>
                              <div className={`w-full h-1 rounded-full overflow-hidden ${isDarkMode ? 'bg-neutral-800' : 'bg-white'}`}>
                                <div className={`h-full ${sev === 'danger' ? 'bg-red-500' : sev === 'warning' ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min((item.count / 50) * 100, 100)}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className={`p-3 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-medium ${textTertiary}`}>Total Abuse Events</span>
                          <span className={`text-xs font-bold ${textPrimary}`}>{totalAbuse}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Total Events Footer */}
            <div className={`rounded-lg border p-4 ${cardBg}`}>
              {(() => {
                const factor = (100 - customer.drivingScore) / 30;
                const totalAll = Math.round(24 * factor) + Math.round(18 * factor) + Math.round(31 * factor) + Math.round(8 * factor) + Math.round(12 * factor) + Math.round(5 * factor) + Math.round(22 * factor) + Math.round(15 * factor) + Math.round(3 * factor) + Math.round(19 * factor);
                return (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${customer.drivingScore >= 80 ? 'bg-green-100' : customer.drivingScore >= 60 ? 'bg-amber-100' : 'bg-red-100'}`}>
                        <Activity className={`w-5 h-5 ${customer.drivingScore >= 80 ? 'text-green-600' : customer.drivingScore >= 60 ? 'text-amber-600' : 'text-red-600'}`} />
                      </div>
                      <div>
                        <p className={`text-xs font-bold ${textPrimary}`}>Total Events</p>
                        <p className={`text-xs ${textTertiary}`}>Combined driving behavior & abuse detection</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold ${textPrimary}`}>{totalAll}</span>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* TRIPS TAB */}
        {activeTab === 'trips' && (
          <div className="space-y-5">
            {/* Filter bar */}
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${cardBg}`}>
              <div className="flex items-center gap-2">
                <Route className={`w-5 h-5 ${textTertiary}`} />
                <span className={`text-xs ${textSecondary}`}>Total Trips:</span>
                <span className={`text-xs font-bold ${textPrimary}`}>{trips.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${textSecondary}`}>Total Distance:</span>
                <span className={`text-xs font-bold ${textPrimary}`}>{trips.reduce((s, t) => s + t.distance, 0).toLocaleString('de-DE')} km</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${textSecondary}`}>Total Alerts:</span>
                <span className={`text-xs font-bold text-red-500`}>{trips.reduce((s, t) => s + t.alerts, 0)}</span>
              </div>
              {tripsBookingFilter && (
                <div className="ml-auto flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${isDarkMode ? 'bg-blue-900/40 text-blue-300 border border-blue-700/50' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                    Filtered: {tripsBookingFilter}
                  </span>
                  <button
                    onClick={() => setTripsBookingFilter(null)}
                    className={`w-5 h-5 rounded-lg flex items-center justify-center transition-colors ${isDarkMode ? 'hover:bg-neutral-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {!tripsBookingFilter && (
                <div className="ml-auto flex items-center gap-2">
                  <span className={`text-xs ${textSecondary}`}>Avg Score:</span>
                  <span className={`text-xs font-bold ${customer.drivingScore >= 80 ? 'text-green-500' : customer.drivingScore >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                    {Math.round(trips.reduce((s, t) => s + t.score, 0) / trips.length)}
                  </span>
                </div>
              )}
            </div>

            {/* Booking-grouped view */}
            {(() => {
              const bookingIds = [...new Set(trips.map(t => t.bookingId))];
              const filteredBookingIds = tripsBookingFilter ? bookingIds.filter(id => id === tripsBookingFilter) : bookingIds;
              return (
                <div className="space-y-4">
                  {filteredBookingIds.map(bId => {
                    const bookingTrips = trips.filter(t => t.bookingId === bId);
                    const booking = bookings.find(b => b.bookingId === bId);
                    const totalKm = bookingTrips.reduce((s, t) => s + t.distance, 0);
                    const totalAlerts = bookingTrips.reduce((s, t) => s + t.alerts, 0);
                    const avgScore = Math.round(bookingTrips.reduce((s, t) => s + t.score, 0) / bookingTrips.length);
                    return (
                      <div key={bId} className={`rounded-lg border overflow-hidden ${borderColor}`}>
                        {/* Booking header */}
                        <div className={`flex items-center gap-3 px-3 py-2 ${isDarkMode ? 'bg-neutral-800/40' : 'bg-gray-50/80'}`}>
                          <span className={`text-xs font-mono font-bold ${textPrimary}`}>{bId}</span>
                          {booking && (
                            <>
                              <span className={`text-xs ${textSecondary}`}>{booking.vehicle.split(' / ')[1]}</span>
                              <span className={textTertiary}>Â·</span>
                              <span className={`text-xs ${textSecondary}`}>{booking.dateStart} â€“ {booking.dateEnd}</span>
                            </>
                          )}
                          <div className="ml-auto flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <Route className={`w-3.5 h-3.5 ${textTertiary}`} />
                              <span className={`text-xs font-semibold ${textPrimary}`}>{bookingTrips.length} Trips</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <MapPin className={`w-3.5 h-3.5 ${textTertiary}`} />
                              <span className={`text-xs font-semibold ${textPrimary}`}>{totalKm.toLocaleString('de-DE')} km</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <AlertTriangle className={`w-3.5 h-3.5 ${totalAlerts > 0 ? 'text-red-500' : textTertiary}`} />
                              <span className={`text-xs font-semibold ${totalAlerts > 0 ? 'text-red-500' : textPrimary}`}>{totalAlerts} Alerts</span>
                            </div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${
                              avgScore >= 80 ? 'bg-green-50 text-green-600' : avgScore >= 60 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                            }`}>
                              <Star className="w-3 h-3" /> {avgScore}
                            </span>
                          </div>
                        </div>
                        {/* Trips table */}
                        <table className="w-full">
                          <thead>
                            <tr className={`border-b border-t ${borderColor} ${isDarkMode ? 'bg-neutral-800/20' : 'bg-gray-50/30'}`}>
                              <th className={thClass}>Trip ID</th>
                              <th className={thClass}>Date</th>
                              <th className={thClass}>Time</th>
                              <th className={thClass}>From</th>
                              <th className={thClass}>To</th>
                              <th className={thClass}>Distance</th>
                              <th className={thClass}>Duration</th>
                              <th className={thClass}>Score</th>
                              <th className={thClass}>Alerts</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
                            {bookingTrips.map((t, i) => (
                              <tr key={i} className={`transition-colors ${rowHover}`}>
                                <td className={`${tdClass} font-semibold ${textPrimary}`}>{t.id}</td>
                                <td className={`${tdClass} ${textSecondary}`}>{t.date}</td>
                                <td className={`${tdClass} ${textSecondary}`}>{t.startTime} â€“ {t.endTime}</td>
                                <td className={`${tdClass} ${textSecondary}`}>{t.from}</td>
                                <td className={`${tdClass} ${textSecondary}`}>{t.to}</td>
                                <td className={`${tdClass} font-medium ${textPrimary}`}>{t.distance.toLocaleString('de-DE')} km</td>
                                <td className={`${tdClass} ${textSecondary}`}>{t.duration}</td>
                                <td className={tdClass}>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ${
                                    t.score >= 80 ? 'bg-green-50 text-green-600' : t.score >= 60 ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                                  }`}>
                                    <Star className="w-3 h-3" /> {t.score}
                                  </span>
                                </td>
                                <td className={tdClass}>
                                  {t.alerts > 0 ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">{t.alerts} Alerts</span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Clear</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            <span className={`text-xs ${textTertiary}`}>
              {tripsBookingFilter
                ? `Showing trips for booking ${tripsBookingFilter} (${trips.filter(t => t.bookingId === tripsBookingFilter).length} trips)`
                : `Showing ${[...new Set(trips.map(t => t.bookingId))].length} bookings with ${trips.length} total trips`
              }
            </span>
          </div>
        )}

        {/* FINES TAB */}
        {activeTab === 'fines' && (
          <div className="space-y-5">
            {apiFines.length > 0 ? (
              <>
                <div className={`rounded-lg border overflow-hidden ${borderColor}`}>
                  <table className="w-full">
                    <thead>
                      <tr className={`border-b ${borderColor} ${isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50/50'}`}>
                        <th className={thClass}>Title</th>
                        <th className={thClass}>Date</th>
                        <th className={thClass}>Type</th>
                        <th className={thClass}>Location</th>
                        <th className={thClass}>Amount</th>
                        <th className={thClass}>Status</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
                      {apiFines.map((f: any) => (
                        <tr key={f.id} className={`transition-colors ${rowHover}`}>
                          <td className={`${tdClass} font-semibold ${textPrimary}`}>{f.title}</td>
                          <td className={`${tdClass} ${textSecondary}`}>{f.offenseDate ? new Date(f.offenseDate).toLocaleDateString('de-DE') : '—'}</td>
                          <td className={`${tdClass} font-medium ${textPrimary}`}>{f.offenseType || '—'}</td>
                          <td className={`${tdClass} ${textSecondary} max-w-[200px]`}>{f.location || '—'}</td>
                          <td className={`${tdClass} font-semibold ${textPrimary}`}>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: f.currency || 'EUR' }).format(f.amountCents / 100)}</td>
                          <td className={tdClass}>
                            <BookingStatusPill status={f.status === 'RESOLVED' || f.status === 'CLOSED' ? 'Completed' : f.status === 'MATCHED' ? 'Active' : 'Pending'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={`flex items-center gap-3 p-4 rounded-lg border ${cardBg}`}>
                  <span className={`text-xs ${textSecondary}`}>Total Fines: <span className={`font-bold ${textPrimary}`}>{apiFines.length}</span></span>
                  <span className={`text-xs ${textSecondary}`}>Open: <span className="font-bold text-red-500">{apiFines.filter((f: any) => !['RESOLVED', 'CLOSED'].includes(f.status)).length}</span></span>
                  <span className={`text-xs ml-auto ${textSecondary}`}>Total Amount: <span className="font-bold text-red-500">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(apiFines.reduce((sum: number, f: any) => sum + (f.amountCents || 0), 0) / 100)}</span></span>
                </div>
              </>
            ) : (
              <div className={`p-12 rounded-lg border text-center ${cardBg}`}>
                <Shield className={`w-5 h-5 mx-auto mb-3 ${textTertiary}`} />
                <p className={`text-xs font-medium ${textSecondary}`}>No fines recorded</p>
                <p className={`text-xs mt-1 ${textTertiary}`}>This customer has a clean driving record</p>
              </div>
            )}
          </div>
        )}

        {/* DOCUMENTS TAB */}
        {activeTab === 'documents' && (
          <div className="space-y-5">
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${
              customer.idVerified && customer.licenseVerified
                ? isDarkMode ? 'bg-green-900/20 border-green-700/30' : 'bg-green-50 border-green-200/60'
                : isDarkMode ? 'bg-amber-900/20 border-amber-700/30' : 'bg-amber-50 border-amber-200/60'
            }`}>
              {customer.idVerified && customer.licenseVerified ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <div>
                    <p className={`text-xs font-semibold ${textPrimary}`}>KYC Verification Done!</p>
                    <p className={`text-xs ${textSecondary}`}>Verified on {customer.joinDate} by Tim Schröder</p>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className={`text-xs font-semibold ${textPrimary}`}>KYC Verification Incomplete</p>
                    <p className={`text-xs ${textSecondary}`}>{!customer.idVerified ? 'ID verification pending' : 'License verification pending'}</p>
                  </div>
                </>
              )}
              <button className="ml-auto px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition-all shadow-sm flex items-center gap-2">
                <Upload className="w-3.5 h-3.5" />
                Upload Document
              </button>
            </div>

            <div>
              <h4 className={`text-base font-bold mb-3 ${textPrimary}`}>Customer Documents</h4>
              <div className={`rounded-lg border overflow-hidden ${borderColor}`}>
                <table className="w-full">
                  <thead>
                    <tr className={`border-b ${borderColor} ${isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50/50'}`}>
                      <th className={thClass}>Document</th>
                      <th className={thClass}>Type</th>
                      <th className={thClass}>Uploaded</th>
                      <th className={thClass}>Status</th>
                      <th className={thClass}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
                    {documents.map((d, i) => (
                      <tr key={i} className={`transition-colors ${rowHover}`}>
                        <td className={tdClass}>
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                              <FileText className="w-3.5 h-3.5 text-red-500" />
                            </div>
                            <span className="text-[10px] font-medium text-blue-600 hover:underline cursor-pointer">{d.name}</span>
                          </div>
                        </td>
                        <td className={`${tdClass} ${textSecondary}`}>{d.type}</td>
                        <td className={`${tdClass} ${textSecondary}`}>{d.uploaded}</td>
                        <td className={tdClass}>
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${d.status === 'Verified' ? 'text-green-600' : 'text-amber-600'}`}>
                            {d.status === 'Verified' ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            {d.status}
                          </span>
                        </td>
                        <td className={tdClass}>
                          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-colors">
                            <Download className="w-3 h-3" />
                            Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <span className={`text-xs ${textTertiary} mt-2 block`}>Showing 1 to {documents.length} of {documents.length} entries</span>
            </div>
          </div>
        )}

        {/* INVOICES TAB */}
        {activeTab === 'invoices' && (
          <div className="space-y-5">
            {apiInvoices.length > 0 ? (
              <>
                <div className={`rounded-lg border overflow-hidden ${borderColor}`}>
                  <table className="w-full">
                    <thead>
                      <tr className={`border-b ${borderColor} ${isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50/50'}`}>
                        <th className={thClass}>Nr.</th>
                        <th className={thClass}>Date</th>
                        <th className={thClass}>Title</th>
                        <th className={thClass}>Type</th>
                        <th className={thClass}>Amount</th>
                        <th className={thClass}>Status</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
                      {apiInvoices.map((inv: any) => (
                        <tr key={inv.id} className={`transition-colors ${rowHover}`}>
                          <td className={`${tdClass} font-semibold text-blue-600`}>#{inv.invoiceNumber}</td>
                          <td className={`${tdClass} ${textSecondary}`}>{inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('de-DE') : '—'}</td>
                          <td className={`${tdClass} font-medium ${textPrimary}`}>{inv.title}</td>
                          <td className={`${tdClass} ${textSecondary}`}>{inv.type === 'OUTGOING_BOOKING' ? 'Buchung' : inv.type === 'OUTGOING_MANUAL' ? 'Manuell' : 'Eingehend'}</td>
                          <td className={`${tdClass} font-semibold ${textPrimary}`}>{new Intl.NumberFormat('de-DE', { style: 'currency', currency: inv.currency || 'EUR' }).format(inv.totalCents / 100)}</td>
                          <td className={tdClass}>
                            <BookingStatusPill status={inv.status === 'PAID' ? 'Completed' : inv.status === 'OVERDUE' ? 'Pending' : 'Active'} />
                            {inv.status === 'OVERDUE' && <span className="ml-1 text-[10px] text-red-500 font-semibold">Overdue</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={`flex items-center gap-3 p-4 rounded-lg border ${cardBg}`}>
                  <span className={`text-xs ${textSecondary}`}>Total: <span className={`font-bold ${textPrimary}`}>{apiInvoices.length}</span></span>
                  <span className={`text-xs ${textSecondary}`}>Paid: <span className="font-bold text-green-600">{apiInvoices.filter((i: any) => i.status === 'PAID').length}</span></span>
                  <span className={`text-xs ${textSecondary}`}>Unpaid: <span className="font-bold text-amber-600">{apiInvoices.filter((i: any) => i.status !== 'PAID').length}</span></span>
                  <span className={`text-xs ml-auto ${textSecondary}`}>Total: <span className="font-bold">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(apiInvoices.reduce((s: number, i: any) => s + (i.totalCents || 0), 0) / 100)}</span></span>
                </div>
              </>
            ) : (
              <div className={`p-12 rounded-lg border text-center ${cardBg}`}>
                <FileText className={`w-5 h-5 mx-auto mb-3 ${textTertiary}`} />
                <p className={`text-xs font-medium ${textSecondary}`}>No invoices found</p>
                <p className={`text-xs mt-1 ${textTertiary}`}>Invoices will appear here when bookings are created</p>
              </div>
            )}
          </div>
        )}

        {/* ALERTS & NOTES TAB */}
        {activeTab === 'alerts' && (
          <div className="space-y-8">
            <div>
              <h4 className={`text-base font-bold mb-3 ${textPrimary}`}>Customer Alerts</h4>
              <div className={`rounded-lg border overflow-hidden ${borderColor}`}>
                <table className="w-full">
                  <thead>
                    <tr className={`border-b ${borderColor} ${isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50/50'}`}>
                      <th className={thClass}>Date</th>
                      <th className={thClass}>Type</th>
                      <th className={thClass}>Message</th>
                      <th className={thClass}>Severity</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
                    {alerts.map((a, i) => (
                      <tr key={i} className={`transition-colors ${rowHover}`}>
                        <td className={`${tdClass} font-medium ${textPrimary}`}>{a.date}</td>
                        <td className={tdClass}>
                          <p className={`text-xs font-medium ${textPrimary}`}>{a.type}</p>
                          {a.subType && <p className={`text-xs ${textTertiary}`}>{a.subType}</p>}
                        </td>
                        <td className={`${tdClass} ${textSecondary} max-w-[300px]`}>{a.message}</td>
                        <td className={tdClass}><SeverityPill severity={a.severity} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <span className={`text-xs ${textTertiary} mt-2 block`}>Showing 1 to {alerts.length} of {alerts.length} entries</span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className={`text-base font-bold ${textPrimary}`}>Customer Notes</h4>
                <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition-all shadow-sm">
                  <Plus className="w-3.5 h-3.5" />
                  Add Note
                </button>
              </div>

              <div className={`flex gap-1 mb-3 p-1 rounded-lg ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-100/80'}`} style={{ width: 'fit-content' }}>
                {(['open', 'all', 'done'] as const).map(f => (
                  <button key={f} onClick={() => setNoteFilter(f)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                      noteFilter === f
                        ? isDarkMode ? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm'
                        : isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    {f}
                  </button>
                ))}
              </div>

              <div className={`rounded-lg border overflow-hidden ${borderColor}`}>
                <table className="w-full">
                  <thead>
                    <tr className={`border-b ${borderColor} ${isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50/50'}`}>
                      <th className={thClass}>Date</th>
                      <th className={thClass}>Message</th>
                      <th className={thClass}>Uploaded</th>
                      <th className={thClass}>Status</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
                    {notes.map((n, i) => (
                      <tr key={i} className={`transition-colors ${rowHover}`}>
                        <td className={tdClass}>
                          <div className="flex items-center gap-2">
                            <PriorityPill priority={n.priority} />
                            <span className={`text-xs ${textSecondary}`}>{n.author}</span>
                          </div>
                        </td>
                        <td className={`${tdClass} ${textSecondary} max-w-[250px]`}>{n.message}</td>
                        <td className={`${tdClass} ${textSecondary}`}>{n.date}</td>
                        <td className={tdClass}>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-600">
                              <CheckCircle className="w-3.5 h-3.5" />
                              {n.status}
                            </span>
                            <PaymentIcon method="VISA" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <span className={`text-xs ${textTertiary} mt-2 block`}>Showing 1 to {notes.length} of {notes.length} entries</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
