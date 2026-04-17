import { Building2, Search, Plus, Upload, Download, Sparkles, MapPin, Table2, Map, X, ExternalLink, Phone, Mail, Globe, ChevronRight, User, MessageSquare, ArrowUpDown, Send, CheckCircle, Clock, AlertTriangle, XCircle, Star, Tag, FileText, ArrowRight, Users } from 'lucide-react';
import { useState, useMemo } from 'react';
import { toast } from 'sonner';

interface ProspectsViewProps {
  isDarkMode: boolean;
}

// === DATA TYPES ===
type ProspectStatus = 'New' | 'Enriched' | 'Ready to Contact' | 'Contacted' | 'Replied' | 'Qualified' | 'Not Interested' | 'Converted';
type ProspectPriority = 'Low' | 'Medium' | 'High';
type ProspectSource = 'Manual' | 'CSV Import' | 'Web Scraping' | 'Referral' | 'LinkedIn' | 'Event';

interface ProspectNote {
  id: string;
  text: string;
  author: string;
  date: string;
}

interface ProspectActivity {
  id: string;
  action: string;
  date: string;
  by: string;
}

interface Prospect {
  id: string;
  companyName: string;
  businessType: string;
  city: string;
  country: string;
  website: string;
  phone: string;
  email: string;
  fleetSizeEstimate: number;
  source: ProspectSource;
  status: ProspectStatus;
  priority: ProspectPriority;
  assignedTo: string;
  lastContact: string;
  nextAction: string;
  tags: string[];
  notes: ProspectNote[];
  activity: ProspectActivity[];
  aiSummary: {
    category: string;
    productFit: string;
    useCase: string;
    outreachAngle: string;
  };
  lat: number;
  lng: number;
}

const statusColors: Record<ProspectStatus, string> = {
  'New': 'bg-gray-100 text-gray-700 border-gray-200',
  'Enriched': 'bg-purple-50 text-purple-700 border-purple-200',
  'Ready to Contact': 'bg-blue-50 text-blue-700 border-blue-200',
  'Contacted': 'bg-amber-50 text-amber-700 border-amber-200',
  'Replied': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Qualified': 'bg-green-50 text-green-700 border-green-200',
  'Not Interested': 'bg-red-50 text-red-600 border-red-200',
  'Converted': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const priorityColors: Record<ProspectPriority, string> = {
  Low: 'bg-gray-100 text-gray-600',
  Medium: 'bg-amber-50 text-amber-700',
  High: 'bg-red-50 text-red-700',
};

// === COMPONENT ===
export function ProspectsView({ isDarkMode }: ProspectsViewProps) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterCity, setFilterCity] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'map'>('table');
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [sortField, setSortField] = useState<string>('companyName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [newNote, setNewNote] = useState('');

  // Import modal state
  const [importStep, setImportStep] = useState<'upload' | 'mapping' | 'result'>('upload');
  const [importDragOver, setImportDragOver] = useState(false);
  const [importFile, setImportFile] = useState<string | null>(null);

  // Add modal state
  const [addForm, setAddForm] = useState({ companyName: '', businessType: 'Taxi Company', city: '', country: 'Germany', website: '', phone: '', email: '', fleetSizeEstimate: '', priority: 'Medium' as ProspectPriority, source: 'Manual' as ProspectSource });

  const uniqueCities = [...new Set(prospects.map(p => p.city))].sort();
  const uniqueTypes = [...new Set(prospects.map(p => p.businessType))].sort();

  const filtered = useMemo(() => {
    let result = prospects.filter(p => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || p.companyName.toLowerCase().includes(q) || p.city.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.businessType.toLowerCase().includes(q);
      return matchesSearch
        && (filterType === 'all' || p.businessType === filterType)
        && (filterCity === 'all' || p.city === filterCity)
        && (filterStatus === 'all' || p.status === filterStatus)
        && (filterPriority === 'all' || p.priority === filterPriority)
        && (filterSource === 'all' || p.source === filterSource);
    });
    result.sort((a, b) => {
      const aVal = (a as any)[sortField] ?? '';
      const bVal = (b as any)[sortField] ?? '';
      const cmp = typeof aVal === 'number' ? aVal - bVal : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [prospects, searchQuery, filterType, filterCity, filterStatus, filterPriority, filterSource, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const updateProspectStatus = (id: string, status: ProspectStatus) => {
    setProspects(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    setSelectedProspect(prev => prev?.id === id ? { ...prev, status } : prev);
    toast.success(`Status updated to "${status}"`);
  };

  const addNote = () => {
    if (!newNote.trim() || !selectedProspect) return;
    const note: ProspectNote = { id: `n-${Date.now()}`, text: newNote, author: 'Marcus Weber', date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) };
    const updated = { ...selectedProspect, notes: [note, ...selectedProspect.notes] };
    setProspects(prev => prev.map(p => p.id === updated.id ? updated : p));
    setSelectedProspect(updated);
    setNewNote('');
    toast.success('Note added');
  };

  const handleConvert = (p: Prospect) => {
    updateProspectStatus(p.id, 'Converted');
    toast.success(`"${p.companyName}" marked as Converted. Create organization in Organizations page.`);
  };

  const handleAddProspect = () => {
    const np: Prospect = {
      id: `p-${Date.now()}`, companyName: addForm.companyName, businessType: addForm.businessType, city: addForm.city, country: addForm.country,
      website: addForm.website, phone: addForm.phone, email: addForm.email, fleetSizeEstimate: parseInt(addForm.fleetSizeEstimate, 10) || 0,
      source: addForm.source, status: 'New', priority: addForm.priority, assignedTo: '', lastContact: '', nextAction: 'AI Enrichment',
      tags: [], notes: [], activity: [{ id: `a-${Date.now()}`, action: 'Prospect created manually', date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), by: 'Marcus Weber' }],
      aiSummary: { category: addForm.businessType, productFit: 'Pending AI analysis', useCase: 'Pending AI analysis', outreachAngle: 'Pending AI analysis' },
      lat: 51 + Math.random() * 3, lng: 8 + Math.random() * 6,
    };
    setProspects(prev => [np, ...prev]);
    setShowAddModal(false);
    setAddForm({ companyName: '', businessType: 'Taxi Company', city: '', country: 'Germany', website: '', phone: '', email: '', fleetSizeEstimate: '', priority: 'Medium', source: 'Manual' });
    toast.success(`Prospect "${np.companyName}" added`);
  };

  const handleImport = () => {
    setImportStep('result');
    const baseProspect: Omit<Prospect, 'id'> = {
      companyName: '', businessType: 'Logistics Company', city: '', country: 'Germany', website: '', phone: '', email: '',
      fleetSizeEstimate: 0, source: 'CSV Import', status: 'New', priority: 'Medium', assignedTo: '', lastContact: '', nextAction: 'AI Enrichment',
      tags: ['imported'], notes: [], activity: [], aiSummary: { category: 'Pending', productFit: 'Pending AI analysis', useCase: 'Pending', outreachAngle: 'Pending' }, lat: 51, lng: 7,
    };
    const newProspects: Prospect[] = [
      { ...baseProspect, id: `p-imp-${Date.now()}-1`, companyName: 'RapidFleet Dortmund', city: 'Dortmund', fleetSizeEstimate: 55, email: 'fleet@rapidfleet.de', phone: '+49 231 1234567', website: 'rapidfleet-dortmund.de', activity: [{ id: `a-imp-1`, action: 'Imported from CSV', date: 'Mar 7, 2026', by: 'System' }], lat: 51.5136, lng: 7.4653 },
      { ...baseProspect, id: `p-imp-${Date.now()}-2`, companyName: 'CityRide Essen', city: 'Essen', businessType: 'Car Sharing', fleetSizeEstimate: 30, email: 'info@cityride-essen.de', phone: '+49 201 9876543', website: 'cityride-essen.de', activity: [{ id: `a-imp-2`, action: 'Imported from CSV', date: 'Mar 7, 2026', by: 'System' }], lat: 51.4556, lng: 7.0116 },
    ];
    setProspects(prev => [...newProspects, ...prev]);
  };

  const handleAiEnrich = () => {
    toast.success('AI Enrichment started for 3 "New" prospects. Results will appear shortly.');
    setTimeout(() => {
      setProspects(prev => prev.map(p => p.status === 'New' ? { ...p, status: 'Enriched' as ProspectStatus, nextAction: 'Review AI data' } : p));
      toast.success('AI Enrichment complete. 3 prospects enriched.');
    }, 2000);
  };

  const cardClass = `rounded-2xl shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`;
  const inputClass = `w-full px-4 py-3 rounded-xl border text-sm outline-none transition-colors ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-200 focus:border-indigo-500/50' : 'bg-gray-50 border-gray-200 text-gray-700 focus:border-indigo-300'}`;
  const selectClass = `px-3 py-2.5 rounded-xl border text-sm font-medium appearance-none cursor-pointer ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-700'}`;
  const thClass = `text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`;

  return (
    <div className="space-y-4 pb-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Prospects</h1>
          <p className={`text-base mt-2 font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Manage potential partner companies, leads, and outreach opportunities</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => { setShowImportModal(true); setImportStep('upload'); setImportFile(null); }} className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold border transition-all ${isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}><Upload className="w-5 h-5" />Import CSV</button>
          <button onClick={handleAiEnrich} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-2xl text-sm font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"><Sparkles className="w-5 h-5" />AI Enrich</button>
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl text-sm font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"><Plus className="w-5 h-5" />New Prospect</button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total', count: prospects.length, color: isDarkMode ? 'text-white' : 'text-gray-900', bg: isDarkMode ? 'bg-neutral-800' : 'bg-gray-100' },
          { label: 'High Priority', count: prospects.filter(p => p.priority === 'High').length, color: 'text-red-500', bg: isDarkMode ? 'bg-red-500/10' : 'bg-red-50' },
          { label: 'Qualified', count: prospects.filter(p => p.status === 'Qualified').length, color: 'text-green-500', bg: isDarkMode ? 'bg-green-500/10' : 'bg-green-50' },
          { label: 'Unassigned', count: prospects.filter(p => !p.assignedTo).length, color: 'text-amber-500', bg: isDarkMode ? 'bg-amber-500/10' : 'bg-amber-50' },
          { label: 'Converted', count: prospects.filter(p => p.status === 'Converted').length, color: 'text-emerald-500', bg: isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50' },
        ].map(k => (
          <div key={k.label} className={`${cardClass} p-4 flex flex-col items-center justify-center text-center`}>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${k.bg}`}>
              <p className={`text-2xl font-extrabold ${k.color}`}>{k.count}</p>
            </div>
            <p className={`text-sm font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* FILTERS & VIEW TOGGLE */}
      <div className={`${cardClass} p-4`}>
        <div className="flex flex-col lg:flex-row gap-4 justify-between">
          <div className="flex flex-wrap gap-3 flex-1">
            <div className={`flex items-center gap-2 flex-1 min-w-[200px] px-4 py-3 rounded-2xl border ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50/50 border-gray-200'}`}>
              <Search className={`w-5 h-5 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
              <input type="text" placeholder="Search prospects..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className={`flex-1 bg-transparent outline-none text-sm font-medium ${isDarkMode ? 'text-gray-200 placeholder:text-gray-500' : 'text-gray-700 placeholder:text-gray-400'}`} />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className={`px-4 py-3 rounded-2xl border text-sm font-bold appearance-none cursor-pointer ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-200' : 'bg-gray-50/50 border-gray-200 text-gray-700'}`}><option value="all">All Types</option>{uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}</select>
            <select value={filterCity} onChange={e => setFilterCity(e.target.value)} className={`px-4 py-3 rounded-2xl border text-sm font-bold appearance-none cursor-pointer ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-200' : 'bg-gray-50/50 border-gray-200 text-gray-700'}`}><option value="all">All Cities</option>{uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}</select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={`px-4 py-3 rounded-2xl border text-sm font-bold appearance-none cursor-pointer ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-200' : 'bg-gray-50/50 border-gray-200 text-gray-700'}`}><option value="all">All Status</option>{(['New','Enriched','Ready to Contact','Contacted','Replied','Qualified','Not Interested','Converted'] as ProspectStatus[]).map(s => <option key={s} value={s}>{s}</option>)}</select>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className={`px-4 py-3 rounded-2xl border text-sm font-bold appearance-none cursor-pointer ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-200' : 'bg-gray-50/50 border-gray-200 text-gray-700'}`}><option value="all">All Priority</option><option>Low</option><option>Medium</option><option>High</option></select>
          </div>
          <div className={`flex gap-1 p-1.5 rounded-2xl shrink-0 ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100/80'}`}>
            <button onClick={() => setViewMode('table')} className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${viewMode === 'table' ? (isDarkMode ? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm') : (isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')}`}><Table2 className="w-4 h-4" />Table</button>
            <button onClick={() => setViewMode('map')} className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${viewMode === 'map' ? (isDarkMode ? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-gray-900 shadow-sm') : (isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')}`}><Map className="w-4 h-4" />Map</button>
          </div>
        </div>
      </div>

      {/* TABLE VIEW */}
      {viewMode === 'table' && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className={`border-b ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                <th onClick={() => toggleSort('companyName')} className={`${thClass} pl-6`}><span className="flex items-center gap-1">Company <ArrowUpDown className="w-3 h-3" /></span></th>
                <th className={thClass}>Type</th>
                <th onClick={() => toggleSort('city')} className={thClass}><span className="flex items-center gap-1">City <ArrowUpDown className="w-3 h-3" /></span></th>
                <th onClick={() => toggleSort('fleetSizeEstimate')} className={thClass}><span className="flex items-center gap-1">Fleet Est. <ArrowUpDown className="w-3 h-3" /></span></th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Priority</th>
                <th className={thClass}>Assigned</th>
                <th className={thClass}>Next Action</th>
              </tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} onClick={() => setSelectedProspect(p)} className={`border-b last:border-b-0 transition-colors cursor-pointer ${isDarkMode ? 'border-neutral-800 hover:bg-neutral-800' : 'border-gray-50 hover:bg-gray-50'} ${selectedProspect?.id === p.id ? (isDarkMode ? 'bg-indigo-500/10' : 'bg-indigo-50/50') : ''}`}>
                    <td className="pl-6 pr-4 py-3.5"><p className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{p.companyName}</p><p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{p.email}</p></td>
                    <td className={`px-4 py-3.5 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{p.businessType}</td>
                    <td className={`px-4 py-3.5 text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{p.city}</td>
                    <td className={`px-4 py-3.5 text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>{p.fleetSizeEstimate || '—'}</td>
                    <td className="px-4 py-3.5"><span className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${statusColors[p.status]}`}>{p.status}</span></td>
                    <td className="px-4 py-3.5"><span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${priorityColors[p.priority]}`}>{p.priority}</span></td>
                    <td className={`px-4 py-3.5 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{p.assignedTo || <span className="text-amber-500 text-xs font-semibold">Unassigned</span>}</td>
                    <td className={`px-4 py-3.5 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{p.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MAP VIEW */}
      {viewMode === 'map' && (
        <div className={`${cardClass} p-4`}>
          <div className={`relative w-full h-[500px] rounded-2xl overflow-hidden ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`}>
            {/* Simplified map representation */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-full h-full">
                {/* Germany outline placeholder */}
                <div className={`absolute inset-4 rounded-2xl border-2 border-dashed ${isDarkMode ? 'border-neutral-700' : 'border-gray-300'}`} />
                {/* City pins */}
                {filtered.map(p => {
                  const x = ((p.lng - 6) / 8) * 80 + 10;
                  const y = (1 - (p.lat - 48) / 6) * 80 + 10;
                  return (
                    <button key={p.id} onClick={() => setSelectedProspect(p)}
                      className="absolute group" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -100%)' }}>
                      <div className={`relative ${selectedProspect?.id === p.id ? 'scale-125' : 'hover:scale-110'} transition-transform`}>
                        <MapPin className={`w-7 h-7 drop-shadow-lg ${p.priority === 'High' ? 'text-red-500 fill-red-500' : p.priority === 'Medium' ? 'text-amber-500 fill-amber-500' : 'text-blue-500 fill-blue-500'}`} />
                      </div>
                      <div className={`absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-lg ${isDarkMode ? 'bg-neutral-800 text-gray-200' : 'bg-white text-gray-800'}`}>
                        {p.companyName}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Legend */}
            <div className={`absolute bottom-4 left-4 px-3 py-2 rounded-xl backdrop-blur-sm ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}>
              <div className="flex items-center gap-3 text-[10px] font-semibold">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />High</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Medium</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />Low</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === DETAIL DRAWER === */}
      {selectedProspect && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] z-[90] flex" onClick={() => setSelectedProspect(null)}>
          <div className="flex-1" />
          <div className={`w-full sm:w-[480px] h-full border-l shadow-2xl overflow-y-auto ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-200'}`} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3">
              {/* Close & Header */}
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedProspect.companyName}</h2>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{selectedProspect.businessType} · {selectedProspect.city}</p>
                </div>
                <button onClick={() => setSelectedProspect(null)} className={`p-2 rounded-xl ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}><X className="w-5 h-5" /></button>
              </div>

              {/* Status & Priority */}
              <div className="flex items-center gap-2 mb-5">
                <select value={selectedProspect.status} onChange={e => updateProspectStatus(selectedProspect.id, e.target.value as ProspectStatus)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border appearance-none cursor-pointer ${statusColors[selectedProspect.status]}`}>
                  {(['New','Enriched','Ready to Contact','Contacted','Replied','Qualified','Not Interested','Converted'] as ProspectStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className={`px-2 py-1 rounded-md text-xs font-semibold ${priorityColors[selectedProspect.priority]}`}>{selectedProspect.priority}</span>
              </div>

              {/* Contact Info */}
              <div className={`p-4 rounded-2xl border mb-4 space-y-2.5 ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2"><Mail className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} /><span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{selectedProspect.email}</span></div>
                <div className="flex items-center gap-2"><Phone className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} /><span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{selectedProspect.phone}</span></div>
                <div className="flex items-center gap-2"><Globe className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} /><a href={`https://${selectedProspect.website}`} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-500 hover:underline flex items-center gap-1">{selectedProspect.website} <ExternalLink className="w-3 h-3" /></a></div>
                <div className="flex items-center gap-2"><Users className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} /><span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Est. fleet: {selectedProspect.fleetSizeEstimate || '—'} vehicles</span></div>
                <div className="flex items-center gap-2"><User className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} /><span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Assigned: {selectedProspect.assignedTo || 'Unassigned'}</span></div>
              </div>

              {/* Tags */}
              {selectedProspect.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {selectedProspect.tags.map(tag => (
                    <span key={tag} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${isDarkMode ? 'bg-neutral-800 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>{tag}</span>
                  ))}
                </div>
              )}

              {/* AI Summary */}
              <div className={`p-4 rounded-2xl border mb-4 ${isDarkMode ? 'bg-purple-900/10 border-purple-800/30' : 'bg-purple-50/60 border-purple-200/50'}`}>
                <div className="flex items-center gap-2 mb-3"><Sparkles className="w-4 h-4 text-purple-500" /><h4 className={`text-sm font-bold ${isDarkMode ? 'text-purple-300' : 'text-purple-800'}`}>AI Summary</h4></div>
                <div className="space-y-2 text-xs">
                  <div><span className={`font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Category:</span> <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{selectedProspect.aiSummary.category}</span></div>
                  <div><span className={`font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Product Fit:</span> <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{selectedProspect.aiSummary.productFit}</span></div>
                  <div><span className={`font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Use Case:</span> <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{selectedProspect.aiSummary.useCase}</span></div>
                  <div><span className={`font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Outreach Angle:</span> <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{selectedProspect.aiSummary.outreachAngle}</span></div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 mb-5">
                <button onClick={() => updateProspectStatus(selectedProspect.id, 'Contacted')} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}><Send className="w-3 h-3" />Mark Contacted</button>
                <button onClick={() => handleConvert(selectedProspect)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-gradient-to-br from-green-500 to-green-600 text-white shadow hover:shadow-lg transition-all"><ArrowRight className="w-3 h-3" />Convert to Org</button>
                <a href={`https://${selectedProspect.website}`} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}><ExternalLink className="w-3 h-3" />Open Website</a>
              </div>

              {/* Add Note */}
              <div className="mb-4">
                <h4 className={`text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Notes</h4>
                <div className="flex gap-2 mb-3">
                  <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..." onKeyDown={e => e.key === 'Enter' && addNote()} className={`flex-1 px-3 py-2 rounded-xl border text-sm outline-none ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-700'}`} />
                  <button onClick={addNote} disabled={!newNote.trim()} className={`px-3 py-2 rounded-xl text-sm font-semibold bg-indigo-500 text-white ${!newNote.trim() ? 'opacity-50' : 'hover:bg-indigo-600'}`}>Add</button>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedProspect.notes.map(note => (
                    <div key={note.id} className={`p-3 rounded-xl border ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50 border-gray-200'}`}>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{note.text}</p>
                      <p className={`text-[10px] mt-1 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>{note.author} · {note.date}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity History */}
              <div>
                <h4 className={`text-sm font-bold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Outreach History</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedProspect.activity.map(act => (
                    <div key={act.id} className="flex items-start gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
                      <div>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{act.action}</p>
                        <p className={`text-[10px] ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>{act.date} · {act.by}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === ADD PROSPECT MODAL === */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className={`max-w-lg w-full mx-4 rounded-2xl p-8 shadow-2xl border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Add Prospect</h2>
              <button onClick={() => setShowAddModal(false)} className={`p-2 rounded-xl ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div><label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Company Name *</label><input value={addForm.companyName} onChange={e => setAddForm(f => ({ ...f, companyName: e.target.value }))} className={inputClass} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Business Type</label><select value={addForm.businessType} onChange={e => setAddForm(f => ({ ...f, businessType: e.target.value }))} className={inputClass}><option>Taxi Company</option><option>Rental Company</option><option>Fleet Operator</option><option>Logistics Company</option><option>Courier Service</option><option>Shuttle Service</option><option>Medical Transport</option><option>Driving School</option><option>Car Sharing</option><option>Workshop Partner</option></select></div>
                <div><label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Priority</label><select value={addForm.priority} onChange={e => setAddForm(f => ({ ...f, priority: e.target.value as ProspectPriority }))} className={inputClass}><option>Low</option><option>Medium</option><option>High</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>City</label><input value={addForm.city} onChange={e => setAddForm(f => ({ ...f, city: e.target.value }))} className={inputClass} /></div>
                <div><label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Country</label><input value={addForm.country} onChange={e => setAddForm(f => ({ ...f, country: e.target.value }))} className={inputClass} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Email</label><input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} className={inputClass} type="email" /></div>
                <div><label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Phone</label><input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} className={inputClass} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Website</label><input value={addForm.website} onChange={e => setAddForm(f => ({ ...f, website: e.target.value }))} className={inputClass} /></div>
                <div><label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Fleet Size Estimate</label><input value={addForm.fleetSizeEstimate} onChange={e => setAddForm(f => ({ ...f, fleetSizeEstimate: e.target.value }))} className={inputClass} type="number" /></div>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setShowAddModal(false)} className={`flex-1 px-4 py-2.5 rounded-xl font-semibold ${isDarkMode ? 'bg-neutral-800 text-gray-300 border border-neutral-700' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>Cancel</button>
              <button onClick={handleAddProspect} disabled={!addForm.companyName} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl font-semibold shadow-lg ${!addForm.companyName ? 'opacity-50' : 'hover:shadow-xl'}`}><Plus className="w-4 h-4" />Add Prospect</button>
            </div>
          </div>
        </div>
      )}

      {/* === IMPORT CSV MODAL === */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className={`max-w-lg w-full mx-4 rounded-2xl p-8 shadow-2xl border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Import CSV</h2>
              <button onClick={() => setShowImportModal(false)} className={`p-2 rounded-xl ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}><X className="w-5 h-5" /></button>
            </div>

            {importStep === 'upload' && (
              <>
                <div
                  onDragOver={e => { e.preventDefault(); setImportDragOver(true); }}
                  onDragLeave={() => setImportDragOver(false)}
                  onDrop={e => { e.preventDefault(); setImportDragOver(false); setImportFile('prospects_batch_13.csv'); }}
                  onClick={() => setImportFile('prospects_batch_13.csv')}
                  className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${importDragOver ? 'border-indigo-500 bg-indigo-50/50' : isDarkMode ? 'border-neutral-700 hover:border-neutral-600' : 'border-gray-300 hover:border-gray-400'}`}
                >
                  <Upload className={`w-10 h-10 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  <p className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Drop CSV file here or click to browse</p>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Supports .csv files up to 10MB</p>
                </div>
                {importFile && (
                  <div className={`mt-4 p-3 rounded-xl border flex items-center justify-between ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" /><span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{importFile}</span></div>
                    <span className="text-xs text-green-600 font-semibold">Valid</span>
                  </div>
                )}
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setShowImportModal(false)} className={`flex-1 px-4 py-2.5 rounded-xl font-semibold ${isDarkMode ? 'bg-neutral-800 text-gray-300 border border-neutral-700' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>Cancel</button>
                  <button onClick={() => setImportStep('mapping')} disabled={!importFile} className={`flex-1 px-4 py-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl font-semibold shadow-lg ${!importFile ? 'opacity-50' : 'hover:shadow-xl'}`}>Next: Preview</button>
                </div>
              </>
            )}

            {importStep === 'mapping' && (
              <>
                <p className={`text-sm mb-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Field mapping preview for <span className="font-semibold">{importFile}</span></p>
                <div className={`rounded-2xl border overflow-hidden mb-4 ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
                  <table className="w-full text-sm">
                    <thead><tr className={`${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}><th className={`text-left px-4 py-2 text-xs font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>CSV Column</th><th className={`text-left px-4 py-2 text-xs font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Maps To</th><th className={`text-left px-4 py-2 text-xs font-semibold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Preview</th></tr></thead>
                    <tbody>
                      {[['company_name','Company Name','RapidFleet Dortmund'],['type','Business Type','Logistics Company'],['city','City','Dortmund'],['email','Email','fleet@rapidfleet.de'],['phone','Phone','+49 231 1234567'],['fleet_est','Fleet Size','55']].map(([col,field,preview]) => (
                        <tr key={col} className={`border-t ${isDarkMode ? 'border-neutral-700' : 'border-gray-100'}`}><td className={`px-4 py-2 font-mono text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{col}</td><td className={`px-4 py-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{field}</td><td className={`px-4 py-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{preview}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={`p-3 rounded-xl border mb-4 ${isDarkMode ? 'bg-amber-900/15 border-amber-800/30' : 'bg-amber-50/80 border-amber-200/50'}`}>
                  <p className="text-xs text-amber-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />1 potential duplicate detected (CityRide Essen → similar to existing entry). Will be skipped.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setImportStep('upload')} className={`flex-1 px-4 py-2.5 rounded-xl font-semibold ${isDarkMode ? 'bg-neutral-800 text-gray-300 border border-neutral-700' : 'bg-gray-100 text-gray-700 border border-gray-200'}`}>Back</button>
                  <button onClick={handleImport} className="flex-1 px-4 py-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl">Import 2 Prospects</button>
                </div>
              </>
            )}

            {importStep === 'result' && (
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3"><CheckCircle className="w-8 h-8 text-green-500" /></div>
                  <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Import Complete</h3>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {[['Imported','2','text-green-600'],['Skipped','0','text-gray-500'],['Duplicates','1','text-amber-600'],['Errors','0','text-red-600']].map(([label,count,color]) => (
                    <div key={label} className={`p-3 rounded-xl border text-center ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50 border-gray-200'}`}>
                      <p className={`text-2xl font-bold ${color}`}>{count}</p>
                      <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</p>
                    </div>
                  ))}
                </div>
                <button onClick={() => setShowImportModal(false)} className="w-full px-4 py-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl">Done</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
