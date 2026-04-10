import { useState, useEffect } from 'react';
import {
  X, Wrench, Loader2, CheckCircle, AlertTriangle,
  Calendar, Car, MessageSquare, Phone, Mail, User,
  Lock, Gauge,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { useEuromasterIntegration } from './useEuromasterIntegration';

export type ServiceType =
  | 'TIRE_SERVICE'
  | 'MAINTENANCE'
  | 'INSPECTION'
  | 'ASSISTANCE'
  | 'OTHER';

const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  TIRE_SERVICE: 'Tire Service',
  MAINTENANCE: 'Maintenance',
  INSPECTION: 'Inspection',
  ASSISTANCE: 'Assistance',
  OTHER: 'Other',
};

export interface ServiceRequestPrefill {
  vehicleId?: string;
  vehiclePlate?: string;
  vehicleVin?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  mileageKm?: number;
  serviceType?: ServiceType;
  notes?: string;
  context?: 'vehicle-detail' | 'tire-health' | 'fleet-condition' | 'partner-detail';
}

interface Props {
  isDarkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  prefill?: ServiceRequestPrefill;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

export function EuromasterServiceRequestModal({
  isDarkMode,
  isOpen,
  onClose,
  onSuccess,
  prefill,
}: Props) {
  const { orgId } = useRentalOrg();
  const { access, loading: accessLoading, canCreateCase, modeSummary } = useEuromasterIntegration();

  const [serviceType, setServiceType] = useState<ServiceType>(prefill?.serviceType ?? 'MAINTENANCE');
  const [vehiclePlate, setVehiclePlate] = useState(prefill?.vehiclePlate ?? '');
  const [vehicleVin, setVehicleVin] = useState(prefill?.vehicleVin ?? '');
  const [mileageKm, setMileageKm] = useState(prefill?.mileageKm?.toString() ?? '');
  const [preferredDate, setPreferredDate] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState(prefill?.notes ?? '');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSubmitState('idle');
      setErrorMessage('');
      if (prefill) {
        setVehiclePlate(prefill.vehiclePlate ?? '');
        setVehicleVin(prefill.vehicleVin ?? '');
        setMileageKm(prefill.mileageKm ? String(prefill.mileageKm) : '');
        setServiceType(prefill.serviceType ?? 'MAINTENANCE');
        setNotes(prefill.notes ?? '');
      }
    }
  }, [isOpen, prefill]);

  const resetForm = () => {
    setServiceType(prefill?.serviceType ?? 'MAINTENANCE');
    setVehiclePlate(prefill?.vehiclePlate ?? '');
    setVehicleVin(prefill?.vehicleVin ?? '');
    setMileageKm(prefill?.mileageKm?.toString() ?? '');
    setPreferredDate('');
    setContactName('');
    setContactPhone('');
    setContactEmail('');
    setNotes(prefill?.notes ?? '');
    setSubmitState('idle');
    setErrorMessage('');
  };

  const handleClose = () => {
    if (submitState !== 'submitting') {
      resetForm();
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!orgId || !vehiclePlate.trim()) return;
    setSubmitState('submitting');
    setErrorMessage('');

    try {
      const isTire = serviceType === 'TIRE_SERVICE';
      const payload: Record<string, unknown> = {
        vehicleId: prefill?.vehicleId,
        vehiclePlate: vehiclePlate.trim(),
        vehicleVin: vehicleVin.trim() || undefined,
        vehicleMake: prefill?.vehicleMake,
        vehicleModel: prefill?.vehicleModel,
        mileageKm: mileageKm ? parseInt(mileageKm, 10) : undefined,
        preferredDate: preferredDate || undefined,
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        contactEmail: contactEmail.trim() || undefined,
        notes: notes.trim() || undefined,
        createdBy: 'current-user',
        serviceType,
      };

      if (isTire) {
        await api.servicePartners.euromasterTireService(orgId, payload);
      } else {
        await api.servicePartners.euromasterAppointment(orgId, payload);
      }

      setSubmitState('success');
      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 1500);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        err?.message ??
        'Failed to create service request';
      setErrorMessage(msg);
      setSubmitState('error');
    }
  };

  if (!isOpen) return null;

  const dm = isDarkMode;
  const overlayClass = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm';
  const panelClass = `relative w-full max-w-lg mx-4 rounded-2xl border shadow-2xl overflow-hidden ${
    dm ? 'bg-[#1a1a2e] border-white/[0.08]' : 'bg-white border-gray-200'
  }`;
  const labelClass = `text-xs font-medium mb-1 block ${dm ? 'text-gray-400' : 'text-gray-500'}`;
  const inputClass = `w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors ${
    dm
      ? 'bg-white/[0.04] border-white/[0.08] text-white placeholder:text-gray-600 focus:border-blue-500/50'
      : 'bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-blue-400'
  }`;

  const isDisabled = !canCreateCase && submitState === 'idle';

  return (
    <div className={overlayClass} onClick={handleClose}>
      <div className={panelClass} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dm ? 'border-white/[0.06]' : 'border-gray-100'}`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <Wrench className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <h2 className={`text-sm font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>
                Euromaster Service Request
              </h2>
              <p className={`text-[10px] ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                {access?.liveApiEnabled ? 'Live integration' : 'Manual mode'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className={`p-1.5 rounded-lg transition-colors ${dm ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">
          {/* Access check loading */}
          {accessLoading && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className={`w-5 h-5 animate-spin ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
            </div>
          )}

          {/* Authorization missing */}
          {!accessLoading && !canCreateCase && (
            <div className={`flex items-start gap-3 px-4 py-3 rounded-xl ${dm ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200'}`}>
              <Lock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className={`text-xs font-medium ${dm ? 'text-amber-400' : 'text-amber-700'}`}>
                  {modeSummary}
                </p>
                <p className={`text-[10px] mt-0.5 ${dm ? 'text-amber-400/60' : 'text-amber-600/70'}`}>
                  {!access?.enabled
                    ? 'Euromaster integration is not enabled for this organization.'
                    : !access?.assigned
                    ? 'Euromaster is not assigned to this organization. Enable it in Service & Maintenance settings.'
                    : 'Grant data authorization in Service & Maintenance settings to use this feature.'}
                </p>
              </div>
            </div>
          )}

          {/* Success state */}
          {submitState === 'success' && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${dm ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-emerald-50 border border-emerald-200'}`}>
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <div>
                <p className={`text-sm font-medium ${dm ? 'text-emerald-400' : 'text-emerald-700'}`}>
                  Service request created
                </p>
                <p className={`text-[10px] ${dm ? 'text-emerald-400/60' : 'text-emerald-600'}`}>
                  {access?.liveApiEnabled ? 'Submitted to Euromaster.' : 'Saved locally \u2014 forward to Euromaster when ready.'}
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {submitState === 'error' && (
            <div className={`flex items-start gap-3 px-4 py-3 rounded-xl ${dm ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'}`}>
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className={`text-xs font-medium ${dm ? 'text-red-400' : 'text-red-700'}`}>Request failed</p>
                <p className={`text-[10px] mt-0.5 ${dm ? 'text-red-400/60' : 'text-red-600/70'}`}>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Form */}
          {!accessLoading && canCreateCase && submitState !== 'success' && (
            <>
              {/* Service Type */}
              <div>
                <label className={labelClass}>Service Type</label>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.entries(SERVICE_TYPE_LABELS) as [ServiceType, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setServiceType(key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        serviceType === key
                          ? 'bg-red-600 text-white'
                          : dm ? 'bg-white/[0.04] text-gray-400 hover:text-white hover:bg-white/[0.08]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vehicle info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}><Car className="w-3 h-3 inline mr-1" />License Plate *</label>
                  <input
                    className={inputClass}
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value)}
                    placeholder="B-EM 1234"
                    disabled={submitState === 'submitting'}
                  />
                </div>
                <div>
                  <label className={labelClass}>VIN</label>
                  <input
                    className={inputClass}
                    value={vehicleVin}
                    onChange={(e) => setVehicleVin(e.target.value)}
                    placeholder="Optional"
                    disabled={submitState === 'submitting'}
                  />
                </div>
              </div>

              {/* Mileage and Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}><Gauge className="w-3 h-3 inline mr-1" />Mileage (km)</label>
                  <input
                    type="number"
                    className={inputClass}
                    value={mileageKm}
                    onChange={(e) => setMileageKm(e.target.value)}
                    placeholder="45000"
                    disabled={submitState === 'submitting'}
                  />
                </div>
                <div>
                  <label className={labelClass}><Calendar className="w-3 h-3 inline mr-1" />Preferred Date</label>
                  <input
                    type="date"
                    className={inputClass}
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    disabled={submitState === 'submitting'}
                  />
                </div>
              </div>

              {/* Contact */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}><User className="w-3 h-3 inline mr-1" />Contact</label>
                  <input
                    className={inputClass}
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Name"
                    disabled={submitState === 'submitting'}
                  />
                </div>
                <div>
                  <label className={labelClass}><Phone className="w-3 h-3 inline mr-1" />Phone</label>
                  <input
                    className={inputClass}
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+49 ..."
                    disabled={submitState === 'submitting'}
                  />
                </div>
                <div>
                  <label className={labelClass}><Mail className="w-3 h-3 inline mr-1" />Email</label>
                  <input
                    className={inputClass}
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="email"
                    disabled={submitState === 'submitting'}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={labelClass}><MessageSquare className="w-3 h-3 inline mr-1" />Notes</label>
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional details..."
                  disabled={submitState === 'submitting'}
                />
              </div>

              {/* Mode indicator */}
              {!access?.liveApiEnabled && (
                <p className={`text-[10px] ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
                  Manual mode — case will be saved locally. Forward to Euromaster when ready.
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!accessLoading && submitState !== 'success' && (
          <div className={`flex items-center justify-end gap-2 px-5 py-3 border-t ${dm ? 'border-white/[0.06]' : 'border-gray-100'}`}>
            <button
              onClick={handleClose}
              disabled={submitState === 'submitting'}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                dm ? 'text-gray-400 hover:bg-white/5' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isDisabled || !vehiclePlate.trim() || submitState === 'submitting'}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                isDisabled || !vehiclePlate.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {submitState === 'submitting' ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Wrench className="w-3 h-3" />
                  Create Request
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
