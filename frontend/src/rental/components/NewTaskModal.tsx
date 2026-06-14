
import { Icon } from './ui/Icon';
import { useEffect, useState } from 'react';
import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import type { CreateTaskPayload } from '../../lib/api';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

const PRIORITY_MAP: Record<'Low' | 'Medium' | 'High' | 'Urgent', CreateTaskPayload['priority']> = {
  Low: 'LOW',
  Medium: 'MEDIUM',
  High: 'HIGH',
  Urgent: 'URGENT',
};

export function NewTaskModal({ isOpen, onClose, isDarkMode }: NewTaskModalProps) {
  const { fleetVehicles } = useFleetVehicles();
  const { orgId } = useRentalOrg();
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Urgent'>('Medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [orgMembers, setOrgMembers] = useState<{ id: string; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!orgId || !isOpen) return;
    let cancelled = false;
    api.users.listByOrg(orgId)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : ((res as { data?: unknown[] })?.data ?? []);
        setOrgMembers(
          list.map((u: { id: string; name?: string; firstName?: string; lastName?: string; email?: string }) => ({
            id: u.id,
            name: u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id,
          })),
        );
      })
      .catch(() => { if (!cancelled) setOrgMembers([]); });
    return () => { cancelled = true; };
  }, [orgId, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || submitting) return;
    setSubmitting(true);
    try {
      await api.tasks.create(orgId, {
        title: description.trim().slice(0, 120) || 'Task',
        description: description.trim(),
        type: 'CUSTOM',
        source: 'MANUAL',
        priority: PRIORITY_MAP[priority],
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        vehicleId: selectedVehicle || undefined,
        assignedUserId: assignedTo || undefined,
      });
      setDescription('');
      setDueDate('');
      setPriority('Medium');
      setAssignedTo('');
      setSelectedVehicle('');
      onClose();
    } catch (err) {
      console.error('Create task failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className={`relative w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden ${
        isDarkMode 
          ? 'bg-neutral-900/95 border-neutral-700' 
          : 'bg-white/95 border-gray-200'
      }`}>
        {/* Header */}
        <div className={`px-8 py-6 border-b ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Neuen Task erstellen
            </h2>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-all duration-200 ${
                isDarkMode 
                  ? 'hover:bg-neutral-800 text-gray-400 hover:text-white' 
                  : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon name="x" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6">
          <div className="space-y-6">
            {/* Beschreibung */}
            <div>
              <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Beschreibung
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Task-Beschreibung eingeben..."
                rows={4}
                required
                className={`w-full px-4 py-3 rounded-xl border transition-all duration-200 resize-none focus:ring-2 focus:ring-emerald-500/50 focus:outline-none ${
                  isDarkMode 
                    ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500' 
                    : 'bg-white border-gray-300/50 text-gray-900 placeholder-gray-400'
                }`}
              />
            </div>

            {/* Zieldatum */}
            <div>
              <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Zieldatum
              </label>
              <div className="relative">
                <Icon name="calendar" className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  required
                  className={`w-full pl-12 pr-4 py-3 rounded-xl border transition-all duration-200 focus:ring-2 focus:ring-emerald-500/50 focus:outline-none ${
                    isDarkMode 
                      ? 'bg-neutral-800 border-neutral-700 text-white' 
                      : 'bg-white border-gray-300/50 text-gray-900'
                  }`}
                />
              </div>
            </div>

            {/* Dringlichkeit */}
            <div>
              <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Dringlichkeit
              </label>
              <div className="flex gap-2">
                {(['Low', 'Medium', 'High', 'Urgent'] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setPriority(level)}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-semibold border transition-all duration-200 flex items-center justify-center gap-2 ${
                      priority === level
                        ? level === 'Low'
                          ? 'bg-blue-100 text-blue-700 border-blue-300 shadow-md'
                          : level === 'Medium'
                          ? 'bg-yellow-100 text-yellow-700 border-yellow-300 shadow-md'
                          : level === 'High'
                          ? 'bg-orange-100 text-orange-700 border-orange-300 shadow-md'
                          : 'bg-red-100 text-red-700 border-red-300 shadow-md'
                        : isDarkMode
                        ? 'bg-neutral-800 text-gray-400 border-neutral-700 hover:bg-neutral-800'
                        : 'bg-white text-gray-600 border-gray-300/50 hover:bg-gray-50'
                    }`}
                  >
                    {priority === level && <Icon name="alert-circle" className="w-4 h-4" />}
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Fahrzeugauswahl */}
            <div>
              <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Fahrzeug
              </label>
              <div className="relative">
                <Icon name="car" className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <select
                  value={selectedVehicle}
                  onChange={(e) => setSelectedVehicle(e.target.value)}
                  required
                  className={`w-full pl-12 pr-4 py-3 rounded-xl border transition-all duration-200 focus:ring-2 focus:ring-emerald-500/50 focus:outline-none ${
                    isDarkMode 
                      ? 'bg-neutral-800 border-neutral-700 text-white' 
                      : 'bg-white border-gray-300/50 text-gray-900'
                  }`}
                >
                  <option value="">Fahrzeug auswählen...</option>
                  {fleetVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {[v.make, v.model, v.year].filter(Boolean).join(' ')}{v.license ? ` – ${v.license}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Zuweisung */}
            <div>
              <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Zugewiesen an
              </label>
              <div className="relative">
                <Icon name="user" className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  required
                  className={`w-full pl-12 pr-4 py-3 rounded-xl border transition-all duration-200 focus:ring-2 focus:ring-emerald-500/50 focus:outline-none ${
                    isDarkMode 
                      ? 'bg-neutral-800 border-neutral-700 text-white' 
                      : 'bg-white border-gray-300/50 text-gray-900'
                  }`}
                >
                  <option value="">Person auswählen...</option>
                  {orgMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-8">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all duration-200 border ${
                isDarkMode 
                  ? 'bg-neutral-800 hover:bg-neutral-800 text-gray-300 border-neutral-700' 
                  : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300/50'
              }`}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={submitting || !orgId}
              className="flex-1 px-6 py-3 rounded-xl font-semibold transition-all duration-200 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-lg hover:shadow-xl disabled:opacity-50"
            >
              Task erstellen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
