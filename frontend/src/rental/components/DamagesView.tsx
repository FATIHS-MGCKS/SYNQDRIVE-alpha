import { AlertTriangle, Camera, ChevronRight, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';

interface DamagesViewProps {
  isDarkMode: boolean;
  vehicleId?: string;
}

export function DamagesView({ isDarkMode, vehicleId }: DamagesViewProps) {
  const [activeTab, setActiveTab] = useState<'active' | 'solved'>('active');
  const [selectedDamages, setSelectedDamages] = useState<string[]>([]);
  const [activeDamages, setActiveDamages] = useState<any[]>([]);
  const [solvedDamages, setSolvedDamages] = useState<any[]>([]);

  useEffect(() => {
    if (!vehicleId) return;
    api.vehicleIntelligence.damages(vehicleId)
      .then((res: any) => {
        const all = Array.isArray(res) ? res : res?.data ?? [];
        setActiveDamages(all.filter((d: any) => d.status !== 'REPAIRED').map((d: any) => ({
          id: d.id,
          date: d.reportedAt ? new Date(d.reportedAt).toLocaleDateString('de-DE') : 'â€â€ÂÂ',
          type: d.damageType ?? 'Unknown',
          severity: d.severity ?? 'Minor',
          status: 'Unresolved',
        })));
        setSolvedDamages(all.filter((d: any) => d.status === 'REPAIRED').map((d: any) => ({
          id: d.id,
          date: d.reportedAt ? new Date(d.reportedAt).toLocaleDateString('de-DE') : 'â€â€ÂÂ',
          type: d.damageType ?? 'Unknown',
          severity: d.severity ?? 'Minor',
          status: 'Resolved',
          resolvedDate: d.repairedAt ? new Date(d.repairedAt).toLocaleDateString('de-DE') : 'â€â€ÂÂ',
        })));
      })
      .catch(() => {
        setActiveDamages([]);
        setSolvedDamages([]);
      });
  }, [vehicleId]);

  const toggleDamageSelection = (id: string) => {
    setSelectedDamages(prev =>
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const cardClass = `rounded-lg border shadow-sm ${
    isDarkMode
      ? 'bg-neutral-900 border-neutral-700'
      : 'bg-white border-gray-200'
  }`;

  const currentDamages = activeTab === 'active' ? activeDamages : solvedDamages;

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Total Damages */}
        <div className={`${cardClass} p-4 flex items-center gap-3`}>
          <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <p className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{activeDamages.length + solvedDamages.length}</p>
            <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Total Damages</p>
          </div>
        </div>

        {/* Active Damages */}
        <div className={`${cardClass} p-4 flex items-center gap-3`}>
          <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
            <Camera className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <p className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{activeDamages.length}</p>
            <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Active Damages</p>
          </div>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-3 py-2.5 rounded-full text-xs font-semibold transition-all duration-200 border ${
            activeTab === 'active'
              ? isDarkMode
                ? 'bg-neutral-800 text-white border-neutral-600'
                : 'bg-gray-900 text-white border-gray-900'
              : isDarkMode
                ? 'bg-transparent text-gray-400 border-neutral-700 hover:bg-neutral-800/50'
                : 'bg-transparent text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Active Damages ({activeDamages.length})
        </button>
        <button
          onClick={() => setActiveTab('solved')}
          className={`px-3 py-2.5 rounded-full text-xs font-semibold transition-all duration-200 border ${
            activeTab === 'solved'
              ? isDarkMode
                ? 'bg-neutral-800 text-white border-neutral-600'
                : 'bg-gray-900 text-white border-gray-900'
              : isDarkMode
                ? 'bg-transparent text-gray-400 border-neutral-700 hover:bg-neutral-800/50'
                : 'bg-transparent text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          Solved Damages ({solvedDamages.length})
        </button>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Vehicle Damage Map */}
        <div className={`${cardClass} p-4`}>
          <h3 className={`text-base font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Vehicle Damage Map</h3>
          <div className={`rounded-lg border p-4 ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700' : 'bg-gray-50 border-gray-100'}`}>
            {/* Car Blueprint SVG */}
            <div className="grid grid-cols-2 gap-3">
              {/* Side View */}
              <div className="relative">
                <svg viewBox="0 0 320 140" className={`w-full ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {/* Car body side */}
                  <path d="M40,95 L40,75 Q40,65 50,62 L95,52 Q110,48 120,38 L180,28 Q195,26 210,28 L250,35 Q270,40 280,55 L285,70 Q290,75 290,80 L290,95" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  {/* Roof line */}
                  <path d="M120,38 Q150,25 180,28" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  {/* Bottom line */}
                  <line x1="55" y1="95" x2="245" y2="95" stroke="currentColor" strokeWidth="1.8" />
                  {/* Windows */}
                  <path d="M125,40 L135,52 L195,52 L210,35 Q200,30 185,30 L140,33 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M100,55 L125,40 L135,52 L100,55 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  {/* Front wheel */}
                  <circle cx="90" cy="95" r="22" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="90" cy="95" r="14" fill="none" stroke="currentColor" strokeWidth="1" />
                  <circle cx="90" cy="95" r="4" fill="currentColor" opacity="0.3" />
                  {/* Rear wheel */}
                  <circle cx="235" cy="95" r="22" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="235" cy="95" r="14" fill="none" stroke="currentColor" strokeWidth="1" />
                  <circle cx="235" cy="95" r="4" fill="currentColor" opacity="0.3" />
                  {/* Door lines */}
                  <line x1="140" y1="52" x2="140" y2="90" stroke="currentColor" strokeWidth="1" />
                  <line x1="190" y1="52" x2="190" y2="90" stroke="currentColor" strokeWidth="1" />
                  {/* Headlight */}
                  <ellipse cx="50" cy="72" rx="8" ry="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  {/* Taillight */}
                  <ellipse cx="283" cy="72" rx="5" ry="8" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  {/* Door handle */}
                  <line x1="155" y1="65" x2="165" y2="65" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>

              {/* Front View */}
              <div className="relative">
                <svg viewBox="0 0 200 140" className={`w-full ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {/* Car body front */}
                  <path d="M40,110 L40,65 Q40,45 55,40 L80,30 Q100,24 120,30 L145,40 Q160,45 160,65 L160,110" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  {/* Roof */}
                  <path d="M65,35 Q100,20 135,35" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  {/* Windshield */}
                  <path d="M60,42 L70,55 L130,55 L140,42" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  {/* Grille */}
                  <path d="M55,75 L145,75 L145,90 L55,90 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <line x1="100" y1="75" x2="100" y2="90" stroke="currentColor" strokeWidth="0.8" />
                  {/* Headlights */}
                  <ellipse cx="50" cy="75" rx="8" ry="12" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <ellipse cx="150" cy="75" rx="8" ry="12" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  {/* Bumper */}
                  <path d="M45,95 L155,95 L155,108 Q100,112 45,108 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  {/* Wheels visible from front */}
                  <rect x="30" y="95" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="152" y="95" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                {/* Damage marker on front-right */}
                <div className="absolute" style={{ right: '22%', top: '55%' }}>
                  <div className="relative">
                    <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                      <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-md" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Rear View */}
              <div className="relative">
                <svg viewBox="0 0 200 140" className={`w-full ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {/* Car body rear */}
                  <path d="M40,110 L40,65 Q40,45 55,40 L80,32 Q100,26 120,32 L145,40 Q160,45 160,65 L160,110" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  {/* Roof */}
                  <path d="M65,37 Q100,22 135,37" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  {/* Rear window */}
                  <path d="M62,44 L72,58 L128,58 L138,44" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  {/* Taillights */}
                  <rect x="42" y="68" width="14" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="144" y="68" width="14" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  {/* Trunk */}
                  <path d="M60,65 L140,65 L140,90 L60,90 Z" fill="none" stroke="currentColor" strokeWidth="1" />
                  {/* License plate */}
                  <rect x="75" y="92" width="50" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
                  {/* Bumper */}
                  <path d="M45,95" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  {/* Exhaust */}
                  <ellipse cx="65" cy="110" rx="6" ry="4" fill="none" stroke="currentColor" strokeWidth="1" />
                  <ellipse cx="135" cy="110" rx="6" ry="4" fill="none" stroke="currentColor" strokeWidth="1" />
                  {/* Wheels */}
                  <rect x="30" y="95" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  <rect x="152" y="95" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                {/* Damage marker on rear */}
                <div className="absolute" style={{ right: '18%', top: '60%' }}>
                  <div className="relative">
                    <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse">
                      <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-md" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Top View */}
              <div className="relative">
                <svg viewBox="0 0 200 140" className={`w-full ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {/* Car body top */}
                  <path d="M60,15 Q100,8 140,15 L150,35 Q155,70 150,105 L140,125 Q100,132 60,125 L50,105 Q45,70 50,35 Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  {/* Windshield */}
                  <path d="M65,38 Q100,32 135,38 L130,50 Q100,47 70,50 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  {/* Rear window */}
                  <path d="M70,95 Q100,92 130,95 L135,108 Q100,112 65,108 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
                  {/* Roof */}
                  <path d="M70,50 Q100,47 130,50 L130,95 Q100,92 70,95 Z" fill="none" stroke="currentColor" strokeWidth="0.8" />
                  {/* Side mirrors */}
                  <ellipse cx="45" cy="42" rx="5" ry="3" fill="none" stroke="currentColor" strokeWidth="1" />
                  <ellipse cx="155" cy="42" rx="5" ry="3" fill="none" stroke="currentColor" strokeWidth="1" />
                  {/* Wheels */}
                  <rect x="42" y="28" width="8" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
                  <rect x="150" y="28" width="8" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
                  <rect x="42" y="95" width="8" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
                  <rect x="150" y="95" width="8" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
                  {/* Center line */}
                  <line x1="100" y1="15" x2="100" y2="125" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4,4" opacity="0.4" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Active Damage History */}
        <div className={`${cardClass} p-4 flex flex-col`}>
          <h3 className={`text-base font-semibold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            {activeTab === 'active' ? 'Active Damage History' : 'Solved Damage History'}
          </h3>

          {/* Table */}
          <div className="flex-1">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={`text-left text-xs uppercase tracking-wider font-semibold pb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Select</th>
                  <th className={`text-left text-xs uppercase tracking-wider font-semibold pb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Date</th>
                  <th className={`text-left text-xs uppercase tracking-wider font-semibold pb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Type</th>
                  <th className={`text-left text-xs uppercase tracking-wider font-semibold pb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Severity</th>
                  <th className={`text-left text-xs uppercase tracking-wider font-semibold pb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Status</th>
                  <th className="pb-4"></th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
                {currentDamages.map((damage) => (
                  <tr key={damage.id} className="group">
                    <td className="py-3">
                      <button
                        onClick={() => toggleDamageSelection(damage.id)}
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                          selectedDamages.includes(damage.id)
                            ? 'border-purple-500 bg-purple-500'
                            : isDarkMode
                              ? 'border-neutral-600 hover:border-purple-400'
                              : 'border-gray-300 hover:border-purple-400'
                        }`}
                      >
                        {selectedDamages.includes(damage.id) && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </button>
                    </td>
                    <td className={`py-3 text-xs font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{damage.date}</td>
                    <td className={`py-3 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{damage.type}</td>
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        damage.severity === 'Minor'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {damage.severity}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                        damage.status === 'Unresolved'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {damage.status}
                      </span>
                    </td>
                    <td className="py-3">
                      <ChevronRight className={`w-5 h-5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'} group-hover:text-gray-500 transition-colors`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Appointment Section */}
          <div className={`mt-5 rounded-lg border p-4 ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700' : 'bg-gray-50 border-gray-100'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className={`text-xs font-bold mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>How to book an appointment:</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Select one or more damages from the table above</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Click on the "Book an appointment" button</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                    <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>In the AI chatbox, specify the workshop and approve the appointment request</span>
                  </div>
                </div>
              </div>
              <button className="relative px-3 py-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-lg text-xs font-semibold shadow-lg hover:shadow-xl transition-all duration-200 shrink-0">
                Book an appointment
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                  {selectedDamages.length || '0'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}