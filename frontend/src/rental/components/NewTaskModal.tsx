
import { Icon } from './ui/Icon';
import { useEffect, useMemo, useState } from 'react';
import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import type { ApiTaskType, CreateTaskPayload } from '../../lib/api';
import { checklistPreviewForType, MANUAL_TASK_TYPES } from '../lib/task-templates';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

const PRIORITY_MAP: Record<'Low' | 'Normal' | 'High' | 'Critical', CreateTaskPayload['priority']> = {
  Low: 'LOW',
  Normal: 'NORMAL',
  High: 'HIGH',
  Critical: 'CRITICAL',
};

export function NewTaskModal({ isOpen, onClose, isDarkMode }: NewTaskModalProps) {
  const { fleetVehicles } = useFleetVehicles();
  const { orgId } = useRentalOrg();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<ApiTaskType>('CUSTOM');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Normal' | 'High' | 'Critical'>('Normal');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [orgMembers, setOrgMembers] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const checklistPreview = useMemo(() => checklistPreviewForType(taskType), [taskType]);

  useEffect(() => {
    if (!orgId || !isOpen) return;
    let cancelled = false;
    api.users.listByOrg(orgId)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : [];
        setOrgMembers(
          list.map((u) => ({
            id: u.id,
            name: u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id,
          })),
        );
      })
      .catch(() => { if (!cancelled) setOrgMembers([]); });
    return () => { cancelled = true; };
  }, [orgId, isOpen]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTaskType('CUSTOM');
    setDueDate('');
    setPriority('Normal');
    setAssignedUserId('');
    setVehicleId('');
    setBookingId('');
    setCustomerId('');
    setVendorId('');
    setEstimatedCost('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || submitting) return;
    setSubmitting(true);
    try {
      const estCents = estimatedCost.trim()
        ? Math.round(parseFloat(estimatedCost.replace(',', '.')) * 100)
        : undefined;
      const checklist = checklistPreview.map((t, sortOrder) => ({ title: t, sortOrder }));
      await api.tasks.create(orgId, {
        title: title.trim() || description.trim().slice(0, 120) || 'Task',
        description: description.trim() || undefined,
        type: taskType,
        source: 'MANUAL',
        priority: PRIORITY_MAP[priority],
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        vehicleId: vehicleId || undefined,
        bookingId: bookingId.trim() || undefined,
        customerId: customerId.trim() || undefined,
        vendorId: vendorId.trim() || undefined,
        assignedUserId: assignedUserId || undefined,
        estimatedCostCents: Number.isFinite(estCents) ? estCents : undefined,
        checklist: checklist.length ? checklist : undefined,
      });
      resetForm();
      onClose();
    } catch (err) {
      console.error('Create task failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const inputClass = `w-full px-4 py-3 rounded-xl border transition-all duration-200 focus:ring-2 focus:ring-emerald-500/50 focus:outline-none ${
    isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500' : 'bg-white border-gray-300/50 text-gray-900 placeholder-gray-400'
  }`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${
        isDarkMode ? 'bg-neutral-900/95 border-neutral-700' : 'bg-white/95 border-gray-200'
      }`}>
        <div className={`px-8 py-6 border-b sticky top-0 z-10 ${isDarkMode ? 'border-neutral-700 bg-neutral-900/95' : 'border-gray-200 bg-white/95'}`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Neuen Task erstellen</h2>
            <button type="button" onClick={onClose} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <Icon name="x" className="w-5 h-5" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          <div>
            <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Titel</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Kurztitel" />
          </div>

          <div>
            <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Typ</label>
            <select value={taskType} onChange={(e) => setTaskType(e.target.value as ApiTaskType)} className={inputClass}>
              {MANUAL_TASK_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Beschreibung</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="Details…" />
          </div>

          {checklistPreview.length > 0 && (
            <div className={`rounded-xl border p-4 ${isDarkMode ? 'border-neutral-700 bg-neutral-800/50' : 'border-gray-200 bg-gray-50'}`}>
              <p className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Standard-Checkliste (Vorschau)</p>
              <ul className={`text-xs space-y-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {checklistPreview.map((item) => <li key={item}>• {item}</li>)}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Fälligkeitsdatum</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Geschätzte Kosten (€)</label>
              <input type="text" inputMode="decimal" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} className={inputClass} placeholder="0,00" />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Dringlichkeit</label>
            <div className="flex gap-2">
              {(['Low', 'Normal', 'High', 'Critical'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setPriority(level)}
                  className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold border ${
                    priority === level
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : isDarkMode ? 'bg-neutral-800 text-gray-400 border-neutral-700' : 'bg-white text-gray-600 border-gray-300'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Fahrzeug</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={inputClass}>
              <option value="">Optional…</option>
              {fleetVehicles.map((v) => (
                <option key={v.id} value={v.id}>{[v.make, v.model, v.license].filter(Boolean).join(' · ')}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Booking ID</label>
              <input value={bookingId} onChange={(e) => setBookingId(e.target.value)} className={inputClass} placeholder="optional" />
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Customer ID</label>
              <input value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputClass} placeholder="optional" />
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Vendor ID</label>
              <input value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputClass} placeholder="optional" />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Zugewiesen an</label>
            <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} className={inputClass}>
              <option value="">Optional…</option>
              {orgMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className={`flex-1 px-6 py-3 rounded-xl font-semibold border ${isDarkMode ? 'border-neutral-700 text-gray-300' : 'border-gray-300 text-gray-700'}`}>
              Abbrechen
            </button>
            <button type="submit" disabled={submitting || !orgId} className="flex-1 px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-emerald-500 to-green-600 text-white disabled:opacity-50">
              Task erstellen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
