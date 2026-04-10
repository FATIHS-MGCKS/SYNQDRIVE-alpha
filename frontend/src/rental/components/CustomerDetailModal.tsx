import { useState } from 'react';
import { X, Phone, Mail, MapPin, Calendar, Car, Star, AlertTriangle, ExternalLink, Globe, Smartphone, Activity, Gauge, Zap, Shield, TrendingUp, TrendingDown, Navigation, CheckCircle, Clock } from 'lucide-react';

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

interface CustomerDetailModalProps {
  customer: Customer;
  isDarkMode: boolean;
  onClose: () => void;
  isAnimating?: boolean;
  onUpdateCustomer?: (updatedCustomer: Customer) => void;
  onOpenDetail?: () => void;
}

function generateTrips(customer: Customer) {
  const cities = ['Berlin Mitte', 'Hamburg Hafen', 'München Ost', 'Frankfurt Hbf', 'Köln Zentrum', 'Stuttgart Mitte', 'Dresden Nord'];
  return Array.from({ length: 6 }, (_, i) => ({
    id: `T-${4500 + i}`,
    date: `${(20 - i * 2)}.02.2026`,
    from: cities[i % cities.length],
    to: cities[(i + 2) % cities.length],
    distance: `${(45 + i * 37)} km`,
    score: Math.max(60, customer.drivingScore - i * 3 + Math.floor(Math.random() * 10)),
    alerts: i < 2 ? i : 0,
  }));
}

function generateFines(customer: Customer) {
  if (customer.violations === 0) return [];
  return Array.from({ length: Math.min(customer.violations, 5) }, (_, i) => ({
    id: `F-${1000 + i}`,
    date: `${(15 - i * 5 + 30) % 28 + 1}.0${(i % 3) + 1}.2026`,
    type: i % 3 === 0 ? 'Speeding' : i % 3 === 1 ? 'Parking Violation' : 'Red Light',
    amount: `€ ${(50 + i * 35)}`,
    status: i < 2 ? 'Unpaid' : 'Paid',
  }));
}

function generateAlerts(customer: Customer) {
  const alerts: { date: string; type: string; severity: 'High' | 'Medium' | 'Low' }[] = [];
  if (customer.violations > 2) alerts.push({ date: '24.04.', type: 'Speeding', severity: 'High' });
  if (customer.accidents > 0) alerts.push({ date: '18.04.', type: 'Unassigned Trip', severity: 'High' });
  if (customer.riskLevel === 'High Risk') alerts.push({ date: '10.02.', type: 'Harsh Braking', severity: 'Medium' });
  if (!customer.licenseVerified) alerts.push({ date: '22.01.', type: 'License Alert', severity: 'High' });
  if (customer.licenseExpiry < '01.01.2027') alerts.push({ date: '22.01.', type: 'License Alert', severity: 'Low' });
  if (alerts.length === 0) alerts.push({ date: '15.02.', type: 'Info', severity: 'Low' });
  return alerts;
}

function generateNotes(customer: Customer) {
  const notes = [
    { date: '21.02.2024', priority: 'Medium' as const, author: '#10 Tim Schröder', message: customer.notes || 'Follow up on insurance add-on requests.' },
    { date: '15.01.2024', priority: 'Low' as const, author: '#27 Sarah Mayer', message: 'Customer prefers morning pick-ups and online invoices.' },
  ];
  if (customer.riskLevel === 'High Risk') {
    notes.unshift({ date: '03.01.2024', priority: 'High' as const, author: '#03 Tim Schröder', message: 'Reminder: Outstanding damage fee for booking.' });
  }
  return notes;
}

export function CustomerDetailModal({ customer, isDarkMode, onClose, isAnimating = true, onUpdateCustomer, onOpenDetail }: CustomerDetailModalProps) {
  const trips = generateTrips(customer);
  const fines = generateFines(customer);
  const alerts = generateAlerts(customer);
  const notes = generateNotes(customer);

  const kmDriven = `${(customer.totalBookings * 312).toLocaleString('de-DE')} km`;
  const harshBrakingEvents = Math.max(0, Math.round((100 - customer.drivingScore) * 0.4 + customer.accidents * 3));
  const speedingEvents = customer.violations;
  const phoneUsage = customer.drivingScore >= 80 ? 'Low' : customer.drivingScore >= 60 ? 'Medium' : 'High';
  const driverBirthYear = 1985 + (parseInt(customer.id.replace('c', '')) % 12);
  const driverDOB = `${(12 + parseInt(customer.id.replace('c', '')) * 3) % 28 + 1}.${(parseInt(customer.id.replace('c', '')) % 12) + 1}.${driverBirthYear}`;
  const driverId = `B.${1000 + parseInt(customer.id.replace('c', '')) * 111}`;

  const bg = isDarkMode ? 'bg-neutral-900' : 'bg-white';
  const borderColor = isDarkMode ? 'border-neutral-700/50' : 'border-gray-200/60';
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const textTertiary = isDarkMode ? 'text-gray-500' : 'text-gray-400';
  const cardBg = isDarkMode ? 'bg-neutral-800/50 border-neutral-700/50' : 'bg-gray-50/80 border-gray-200/50';

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

  const PriorityPill = ({ priority }: { priority: string }) => {
    const s: Record<string, string> = {
      'High': 'bg-red-100 text-red-700 border-red-200',
      'Medium': 'bg-amber-100 text-amber-700 border-amber-200',
      'Low': 'bg-green-100 text-green-700 border-green-200',
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${s[priority]}`}>{priority}</span>;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div
        className="absolute inset-0 transition-all duration-500 ease-out"
        style={{
          backgroundColor: isAnimating ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0)',
        }}
      />
      <div onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl transition-all duration-500 ease-out ${bg} ${borderColor}`}
        style={{
          transform: isAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)',
          opacity: isAnimating ? 1 : 0,
          boxShadow: isAnimating
            ? '0 25px 60px -12px rgba(0, 0, 0, 0.35), 0 0 40px -8px rgba(59, 130, 246, 0.15)'
            : '0 10px 30px -12px rgba(0, 0, 0, 0)',
        }}>

        {/* Header */}
        <div className={`flex-shrink-0 px-8 pt-7 pb-5 border-b ${borderColor}`}>
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className={`text-xl font-bold ${textPrimary}`}>
                <span className={textTertiary}>Customer </span>Quick View
              </h2>
            </div>
            <div className="flex items-center gap-2.5">
              {customer.status === 'Active' ? (
                <button
                  onClick={() => onUpdateCustomer?.({ ...customer, status: 'Suspended' })}
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-all shadow-sm">
                  Suspend Customer
                </button>
              ) : customer.status === 'Suspended' || customer.status === 'Blocked' ? (
                <button
                  onClick={() => onUpdateCustomer?.({ ...customer, status: 'Active' })}
                  className="px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition-all shadow-sm">
                  Reactivate
                </button>
              ) : (
                <button
                  onClick={() => onUpdateCustomer?.({ ...customer, status: 'Active' })}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-all shadow-sm">
                  Complete Review
                </button>
              )}
              <a
                href={`tel:${customer.phone.replace(/\s/g, '')}`}
                className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-all shadow-sm flex items-center gap-2 no-underline">
                <Phone className="w-3.5 h-3.5" />
                Contact
              </a>
              <button onClick={onClose}
                className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Customer Identity */}
          <div className="flex items-center gap-4 mb-5">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold text-white ${
              customer.status === 'Active' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
              customer.status === 'Under Review' ? 'bg-gradient-to-br from-amber-500 to-amber-600' :
              customer.status === 'Suspended' ? 'bg-gradient-to-br from-red-500 to-red-600' :
              'bg-gradient-to-br from-gray-500 to-gray-600'
            }`}>
              {customer.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className={`text-xl font-bold ${textPrimary}`}>{customer.company ? customer.company : customer.name}</h3>
                {customer.company && (
                  <span className={`text-sm ${textSecondary}`}>({customer.name})</span>
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
                <span className={textTertiary}>·</span>
                <RiskPill level={customer.riskLevel} />
                <span className={textTertiary}>·</span>
                <StatusPill status={customer.status} />
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => { onOpenDetail?.(); onClose(); }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-medium transition-all ${
                  isDarkMode ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-300 hover:bg-neutral-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}>
                <ExternalLink className="w-3.5 h-3.5" />
                Detail
              </button>
            </div>
          </div>

          {/* Quick View label */}
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${isDarkMode ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
              Quick View
            </span>
            <span className={`text-xs ${textTertiary}`}>·</span>
            <button
              onClick={() => { onOpenDetail?.(); onClose(); }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              Open Full Detail Page
            </button>
          </div>
        </div>

        {/* Content - Overview Only */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="space-y-5">
            {/* Summary Stats Bar */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Bookings', value: String(customer.totalBookings), icon: Calendar, bg: 'bg-blue-100', color: 'text-blue-600' },
                { label: 'Distance Driven', value: kmDriven, icon: Car, bg: 'bg-green-100', color: 'text-green-600' },
                { label: 'Alerts', value: String(alerts.length), icon: AlertTriangle, bg: alerts.some(a => a.severity === 'High') ? 'bg-red-100' : 'bg-amber-100', color: alerts.some(a => a.severity === 'High') ? 'text-red-600' : 'text-amber-600' },
                { label: 'Driving Score', value: String(customer.drivingScore), icon: Star, bg: customer.drivingScore >= 80 ? 'bg-green-100' : customer.drivingScore >= 60 ? 'bg-amber-100' : 'bg-red-100', color: customer.drivingScore >= 80 ? 'text-green-600' : customer.drivingScore >= 60 ? 'text-amber-600' : 'text-red-600' },
              ].map(stat => (
                <div key={stat.label} className={`rounded-2xl border p-4 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold ${textTertiary}`}>{stat.label}</span>
                    <div className={`w-7 h-7 rounded-lg ${stat.bg} flex items-center justify-center`}>
                      <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${textPrimary}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-2 gap-5">
              {/* Left Column */}
              <div className="space-y-5">
                {/* Profile Card */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <h4 className={`text-sm font-bold mb-4 ${textPrimary}`}>Profile</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${textSecondary}`}>Name</span>
                      <span className={`text-sm font-medium ${textPrimary}`}>{customer.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${textSecondary}`}>Date of Birth</span>
                      <span className={`text-sm font-medium ${textPrimary}`}>{driverDOB}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${textSecondary}`}>Driver ID</span>
                      <span className={`text-sm font-medium ${textPrimary}`}>{driverId}</span>
                    </div>
                    {customer.company && (
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${textSecondary}`}>Company</span>
                        <span className={`text-sm font-medium ${textPrimary}`}>{customer.company}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${textSecondary}`}>Customer Type</span>
                      <span className={`text-sm font-medium ${textPrimary}`}>{customer.type}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm ${textSecondary}`}>License Expiry</span>
                      <span className={`text-sm font-medium ${textPrimary}`}>{customer.licenseExpiry}</span>
                    </div>
                  </div>
                </div>

                {/* Contact Card */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <h4 className={`text-sm font-bold mb-4 ${textPrimary}`}>Contact</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Phone className={`w-4 h-4 ${textTertiary}`} />
                      <span className={`text-sm ${textPrimary}`}>{customer.phone}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className={`w-4 h-4 ${textTertiary}`} />
                      <span className={`text-sm ${textPrimary}`}>{customer.email}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Globe className={`w-4 h-4 ${textTertiary}`} />
                      <span className={`text-sm ${textPrimary}`}>German</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin className={`w-4 h-4 ${textTertiary}`} />
                      <span className={`text-sm ${textPrimary}`}>{customer.city}, DE</span>
                    </div>
                  </div>
                </div>

                {/* Notices Card */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <h4 className={`text-sm font-bold mb-4 ${textPrimary}`}>Notices</h4>
                  <div className="space-y-4">
                    {notes.slice(0, 2).map((n, i) => (
                      <div key={i} className={`pb-3 ${i < 1 ? `border-b ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-200/60'}` : ''}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <PriorityPill priority={n.priority} />
                          <span className={`text-[11px] ${textTertiary}`}>{n.date}</span>
                        </div>
                        <p className={`text-sm ${textSecondary}`}>{n.message}</p>
                        <p className={`text-[11px] mt-1 ${textTertiary}`}>{n.author}</p>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => { onOpenDetail?.(); onClose(); }}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
                    See all notes →
                  </button>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-5">
                {/* Driving Behaviour Summary Card */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className={`text-sm font-bold ${textPrimary}`}>Driving Behavior</h4>
                    <button onClick={() => { onOpenDetail?.(); onClose(); }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Details</button>
                  </div>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="relative w-16 h-16">
                      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" className={isDarkMode ? 'stroke-neutral-700' : 'stroke-gray-200'} />
                        <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" strokeDasharray={`${(customer.drivingScore / 100) * 175.93} 175.93`} strokeLinecap="round" className={customer.drivingScore >= 80 ? 'stroke-green-500' : customer.drivingScore >= 60 ? 'stroke-amber-500' : 'stroke-red-500'} />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-sm font-bold ${textPrimary}`}>{customer.drivingScore}</span>
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
                  <div className={`p-3 rounded-xl text-center ${isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50'}`}>
                    <span className={`text-[11px] ${textTertiary}`}>Score rated </span>
                    <span className={`text-[11px] font-semibold ${customer.drivingScore >= 80 ? 'text-green-500' : customer.drivingScore >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                      {customer.drivingScore >= 80 ? 'Good' : customer.drivingScore >= 60 ? 'Average' : 'Poor'}
                    </span>
                    <span className={`text-[11px] ${textTertiary}`}> — view full insights on the </span>
                    <button onClick={() => { onOpenDetail?.(); onClose(); }} className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold">Detail Page</button>
                  </div>
                </div>

                {/* Driving Events Card */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className={`text-sm font-bold ${textPrimary}`}>Driving Events</h4>
                    <button onClick={() => { onOpenDetail?.(); onClose(); }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Details</button>
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
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className={`text-sm font-bold ${textPrimary}`}>Fines</h4>
                    <button onClick={() => { onOpenDetail?.(); onClose(); }} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Details</button>
                  </div>
                  {fines.length > 0 ? (
                    <div className={`rounded-xl border overflow-hidden ${borderColor}`}>
                      <table className="w-full">
                        <thead>
                          <tr className={`border-b ${borderColor} ${isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50/50'}`}>
                            <th className={`text-left text-[9px] uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`}>Date</th>
                            <th className={`text-left text-[9px] uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`}>Type</th>
                            <th className={`text-left text-[9px] uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`}>Severity</th>
                            <th className={`text-left text-[9px] uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`}>Amount</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'}`}>
                          {fines.slice(0, 3).map((f, i) => (
                            <tr key={i}>
                              <td className={`px-3 py-2 text-xs ${textPrimary}`}>{f.date}</td>
                              <td className={`px-3 py-2 text-xs ${textSecondary}`}>{f.type}</td>
                              <td className={`px-3 py-2 text-xs font-medium ${f.status === 'Unpaid' ? 'text-red-500' : textPrimary}`}>{f.status === 'Unpaid' ? 'High' : 'Low'}</td>
                              <td className={`px-3 py-2 text-xs font-semibold ${textPrimary}`}>{f.amount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-3">
                      <Shield className={`w-4 h-4 ${textTertiary}`} />
                      <span className={`text-sm ${textSecondary}`}>No fines recorded</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}