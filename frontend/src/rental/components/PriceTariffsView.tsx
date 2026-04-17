import { useState, useEffect } from 'react';
import { Search, Car, Save, Check, X, ChevronDown, Plus, Trash2, Shield, Package, Gauge, Tag, ChevronRight, Settings, Pencil } from 'lucide-react';
import {
  VehicleTariff, MileagePackage, InsuranceOption, ExtraOption,
  VehicleCategory, getVehicleCategory, categoryConfig, buildTariffs, formatCurrency
} from '../data/tariffs';
import { useFleetVehicles } from '../FleetContext';

interface CustomCategory {
  id: string;
  name: string;
  color: string;
}

interface PriceTariffsViewProps {
  isDarkMode: boolean;
  tariffs?: VehicleTariff[];
  onTariffsChange?: (tariffs: VehicleTariff[]) => void;
}

export function PriceTariffsView({ isDarkMode, tariffs: externalTariffs, onTariffsChange }: PriceTariffsViewProps) {
  const { fleetVehicles } = useFleetVehicles();
  const [localTariffs, setLocalTariffs] = useState<VehicleTariff[]>([]);
  useEffect(() => {
    if (!externalTariffs?.length) setLocalTariffs(buildTariffs(fleetVehicles));
  }, [fleetVehicles, externalTariffs?.length]);
  const tariffs = externalTariffs?.length ? externalTariffs : localTariffs;
  const setTariffs = (updater: VehicleTariff[] | ((prev: VehicleTariff[]) => VehicleTariff[])) => {
    const newTariffs = typeof updater === 'function' ? updater(tariffs) : updater;
    if (onTariffsChange) {
      onTariffsChange(newTariffs);
    } else {
      setLocalTariffs(newTariffs);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<VehicleCategory>('All');
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<string | null>(null);
  const [editTariff, setEditTariff] = useState<VehicleTariff | null>(null);
  const [isEditAnimating, setIsEditAnimating] = useState(false);
  const [isEditClosing, setIsEditClosing] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [filterStation, setFilterStation] = useState<string>('all');
  const [showStationFilter, setShowStationFilter] = useState(false);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showAddCategory, setShowAddCategory] = useState(false);

  const stations = [...new Set(fleetVehicles.map(v => v.station))];
  const builtInCategories: VehicleCategory[] = ['All', 'Compact', 'Sedan', 'Premium', 'Electric', 'MPV'];
  const allCategoryNames = [...builtInCategories.filter(c => c !== 'All'), ...customCategories.map(c => c.name)];

  const addCategory = () => {
    const name = newCategoryName.trim();
    if (!name || allCategoryNames.includes(name as any)) return;
    const colors = ['rose', 'sky', 'lime', 'fuchsia', 'teal', 'orange'];
    const color = colors[customCategories.length % colors.length];
    setCustomCategories(prev => [...prev, { id: `cat-${Date.now()}`, name, color }]);
    setNewCategoryName('');
    setShowAddCategory(false);
  };

  const deleteCategory = (catId: string) => {
    const cat = customCategories.find(c => c.id === catId);
    if (!cat) return;
    setCustomCategories(prev => prev.filter(c => c.id !== catId));
    setTariffs(tariffs.map(t => ({ ...t, categories: t.categories.filter(c => c !== cat.name) })));
    if (selectedCategory === cat.name as any) setSelectedCategory('All');
  };

  const renameCategory = (catId: string, newName: string) => {
    const cat = customCategories.find(c => c.id === catId);
    if (!cat || !newName.trim()) return;
    const oldName = cat.name;
    setCustomCategories(prev => prev.map(c => c.id === catId ? { ...c, name: newName.trim() } : c));
    setTariffs(tariffs.map(t => ({ ...t, categories: t.categories.map(c => c === oldName ? newName.trim() : c) })));
    setEditingCategory(null);
  };

  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const textTertiary = isDarkMode ? 'text-gray-500' : 'text-gray-400';
  const cardClass = `rounded-lg border shadow-sm ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;

  const getFuelColor = (fuelType: string) => {
    switch (fuelType) {
      case 'Electric': return isDarkMode ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' : 'text-emerald-700 bg-emerald-50 border-emerald-200';
      case 'Hybrid': return isDarkMode ? 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30' : 'text-cyan-700 bg-cyan-50 border-cyan-200';
      case 'Diesel': return isDarkMode ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' : 'text-amber-700 bg-amber-50 border-amber-200';
      default: return isDarkMode ? 'text-blue-400 bg-blue-500/15 border-blue-500/30' : 'text-blue-700 bg-blue-50 border-blue-200';
    }
  };

  const inputClass = `w-full px-3 py-2 rounded-lg border text-xs outline-none transition-all ${
    isDarkMode
      ? 'bg-neutral-800 border-neutral-700 text-white focus:border-blue-500/50 placeholder-gray-500'
      : 'bg-white border-gray-200 text-gray-900 focus:border-blue-400 placeholder-gray-400'
  }`;

  const getTariff = (vehicleId: string) => tariffs.find(t => t.vehicleId === vehicleId)!;

  const filteredVehicles = fleetVehicles.filter(v => {
    const t = getTariff(v.id);
    const matchesSearch = v.model.toLowerCase().includes(searchQuery.toLowerCase()) || v.license.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || (t.categories ?? [t.category]).includes(selectedCategory as string);
    const matchesStation = filterStation === 'all' || v.station === filterStation;
    return matchesSearch && matchesCategory && matchesStation;
  });

  const categoryCounts: Record<string, number> = {};
  categoryCounts['All'] = fleetVehicles.length;
  for (const catName of allCategoryNames) {
    categoryCounts[catName] = tariffs.filter(t => (t.categories ?? [t.category]).includes(catName)).length;
  }
  const totalAssignments = allCategoryNames.reduce((sum, c) => sum + (categoryCounts[c] || 0), 0);

  const startEditing = (vehicleId: string) => {
    const t = getTariff(vehicleId);
    setEditTariff(JSON.parse(JSON.stringify(t)));
    setEditingVehicle(vehicleId);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsEditAnimating(true);
      });
    });
  };

  const closeEditModal = () => {
    setIsEditAnimating(false);
    setIsEditClosing(true);
    setTimeout(() => {
      setEditingVehicle(null);
      setEditTariff(null);
      setIsEditClosing(false);
    }, 400);
  };

  const saveEditing = () => {
    if (!editTariff || !editingVehicle) return;
    const vehicleId = editingVehicle;
    const newTariffs = tariffs.map(t => t.vehicleId === vehicleId ? editTariff : t);
    if (onTariffsChange) {
      onTariffsChange(newTariffs);
    } else {
      setLocalTariffs(newTariffs);
    }
    setSavedIds(prev => [...prev, vehicleId]);
    setTimeout(() => setSavedIds(prev => prev.filter(id => id !== vehicleId)), 2000);
    closeEditModal();
  };

  const cancelEditing = () => {
    closeEditModal();
  };

  const addMileagePackage = () => {
    if (!editTariff) return;
    const newPkg: MileagePackage = { id: `pkg-${Date.now()}`, km: 500, price: 59 };
    setEditTariff({ ...editTariff, mileagePackages: [...editTariff.mileagePackages, newPkg] });
  };

  const removeMileagePackage = (pkgId: string) => {
    if (!editTariff) return;
    setEditTariff({ ...editTariff, mileagePackages: editTariff.mileagePackages.filter(p => p.id !== pkgId) });
  };

  const updateMileagePackage = (pkgId: string, field: 'km' | 'price', value: number) => {
    if (!editTariff) return;
    setEditTariff({
      ...editTariff,
      mileagePackages: editTariff.mileagePackages.map(p => p.id === pkgId ? { ...p, [field]: value } : p),
    });
  };

  const addInsurance = () => {
    if (!editTariff) return;
    const newIns: InsuranceOption = { id: `ins-${Date.now()}`, name: 'New Insurance', dailyPrice: 5, description: 'Description' };
    setEditTariff({ ...editTariff, insurances: [...editTariff.insurances, newIns] });
  };

  const removeInsurance = (insId: string) => {
    if (!editTariff) return;
    setEditTariff({ ...editTariff, insurances: editTariff.insurances.filter(i => i.id !== insId) });
  };

  const updateInsurance = (insId: string, field: keyof InsuranceOption, value: string | number) => {
    if (!editTariff) return;
    setEditTariff({
      ...editTariff,
      insurances: editTariff.insurances.map(i => i.id === insId ? { ...i, [field]: value } : i),
    });
  };

  return (
    <div className="relative" onClick={() => setShowStationFilter(false)}>
      <div
        className="space-y-5 transition-all duration-500 ease-out origin-center"
        style={{
          transform: isEditAnimating ? 'scale(0.92)' : 'scale(1)',
          filter: isEditAnimating ? 'blur(12px)' : 'blur(0px)',
          opacity: isEditAnimating ? 0.4 : 1,
          pointerEvents: (editingVehicle || isEditClosing) ? 'none' : 'auto',
        }}
      >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-lg font-bold tracking-tight ${textPrimary}`}>Price Tariffs</h1>
          <p className={`text-xs mt-1 ${textSecondary}`}>Manage rental rates, mileage limits, km packages and insurance options</p>
        </div>
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${cardClass}`}>
          <Tag className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
          <div>
            <span className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>{fleetVehicles.length} Vehicles</span>
            {totalAssignments > fleetVehicles.length && (
              <span className={`text-[10px] ml-1.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>({totalAssignments} group assignments)</span>
            )}
          </div>
        </div>
      </div>

      {/* Category Quick-Select */}
      <div className="flex gap-2 flex-wrap">
        {['All', ...allCategoryNames].map(cat => {
          const cfg = categoryConfig[cat as VehicleCategory];
          const isBuiltIn = builtInCategories.includes(cat as VehicleCategory);
          const customCat = customCategories.find(c => c.name === cat);
          const isActive = selectedCategory === cat;
          const count = categoryCounts[cat] ?? 0;
          const activeRing = isActive ? (isDarkMode ? 'ring-2 ring-blue-500/30 border-blue-500/60' : 'ring-2 ring-blue-400/30 border-blue-400/60') : '';

          return (
            <div key={cat} className="relative group">
              <button
                onClick={() => setSelectedCategory((selectedCategory === cat && cat !== 'All' ? 'All' : cat) as VehicleCategory)}
                className={`rounded-lg border px-4 py-3 cursor-pointer transition-all duration-200 text-left ${
                  isActive
                    ? `${isDarkMode ? 'bg-neutral-900/60' : 'bg-white/80'} ${activeRing}`
                    : isDarkMode
                      ? 'bg-neutral-900 border-neutral-700 hover:border-neutral-600'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-1">
                  <p className={`text-xs font-semibold ${textPrimary}`}>{cat === 'All' ? 'All Vehicles' : cat}</p>
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                    cfg ? (isDarkMode ? cfg.darkBg + ' ' + cfg.darkText : cfg.bg + ' ' + cfg.text) : (isDarkMode ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600')
                  }`}>{count}</span>
                </div>
              </button>
              {/* Edit/Delete for custom categories */}
              {customCat && (
                <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); setEditingCategory({ id: customCat.id, name: customCat.name }); }}
                    className={`p-0.5 rounded ${isDarkMode ? 'bg-neutral-700 text-gray-300 hover:bg-neutral-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>
                    <Pencil className="w-2.5 h-2.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteCategory(customCat.id); }}
                    className={`p-0.5 rounded ${isDarkMode ? 'bg-red-900/60 text-red-400 hover:bg-red-900' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
              {/* Edit for built-in categories (except All) */}
              {isBuiltIn && cat !== 'All' && (
                <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                  <button onClick={(e) => { e.stopPropagation(); deleteCategory(cat); }}
                    className="hidden" />
                </div>
              )}
            </div>
          );
        })}

        {/* Add Category Button */}
        {showAddCategory ? (
          <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`} onClick={e => e.stopPropagation()}>
            <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCategory(); if (e.key === 'Escape') { setShowAddCategory(false); setNewCategoryName(''); } }}
              placeholder="Category name..."
              autoFocus
              className={`w-24 text-xs px-2 py-1 rounded border outline-none ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'}`} />
            <button onClick={addCategory} className={`p-1 rounded ${isDarkMode ? 'text-green-400 hover:bg-green-900/30' : 'text-green-600 hover:bg-green-50'}`}><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => { setShowAddCategory(false); setNewCategoryName(''); }} className={`p-1 rounded ${isDarkMode ? 'text-gray-400 hover:bg-neutral-700' : 'text-gray-500 hover:bg-gray-100'}`}><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button onClick={() => setShowAddCategory(true)}
            className={`rounded-lg border px-4 py-3 cursor-pointer transition-all border-dashed flex items-center gap-2 ${
              isDarkMode ? 'border-neutral-700 text-gray-500 hover:border-neutral-600 hover:text-gray-400' : 'border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-500'
            }`}>
            <Plus className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">Add Group</span>
          </button>
        )}
      </div>

      {/* Rename Category Modal */}
      {editingCategory && (
        <div className={`rounded-lg border p-3 flex items-center gap-3 ${cardClass}`}>
          <span className={`text-xs font-medium ${textSecondary}`}>Rename:</span>
          <input type="text" value={editingCategory.name}
            onChange={e => setEditingCategory({ ...editingCategory, name: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') renameCategory(editingCategory.id, editingCategory.name); if (e.key === 'Escape') setEditingCategory(null); }}
            autoFocus
            className={`flex-1 text-xs px-3 py-1.5 rounded border outline-none ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`} />
          <button onClick={() => renameCategory(editingCategory.id, editingCategory.name)}
            className={`px-2 py-1 rounded text-xs font-medium ${isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>Save</button>
          <button onClick={() => setEditingCategory(null)}
            className={`px-2 py-1 rounded text-xs font-medium ${isDarkMode ? 'text-gray-400 hover:bg-neutral-700' : 'text-gray-500 hover:bg-gray-100'}`}>Cancel</button>
        </div>
      )}

      {/* Search and Filters */}
      <div className={`${cardClass} p-4`}>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 ${textTertiary}`} />
            <input
              type="text"
              placeholder="Search vehicles by model or license plate..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onClick={e => e.stopPropagation()}
              className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-xs outline-none transition-all ${
                isDarkMode
                  ? 'bg-neutral-800 border-neutral-700 text-gray-200 placeholder-gray-500 focus:border-blue-500/50'
                  : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-300'
              }`}
            />
          </div>
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setShowStationFilter(!showStationFilter); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                filterStation !== 'all'
                  ? isDarkMode ? 'bg-blue-900/30 border-blue-700/50 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700'
                  : isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span>{filterStation === 'all' ? 'Station' : filterStation}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showStationFilter ? 'rotate-180' : ''}`} />
            </button>
            {showStationFilter && (
              <div className={`absolute top-full mt-2 right-0 z-50 min-w-[200px] rounded-lg border shadow-xl overflow-hidden ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}>
                <button onClick={() => { setFilterStation('all'); setShowStationFilter(false); }}
                  className={`w-full px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                    filterStation === 'all' ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600' : isDarkMode ? 'text-gray-300 hover:bg-neutral-800' : 'text-gray-700 hover:bg-gray-50'
                  }`}>All Stations</button>
                {stations.map(s => (
                  <button key={s} onClick={() => { setFilterStation(s); setShowStationFilter(false); }}
                    className={`w-full px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                      filterStation === s ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600' : isDarkMode ? 'text-gray-300 hover:bg-neutral-800' : 'text-gray-700 hover:bg-gray-50'
                    }`}>{s}</button>
                ))}
              </div>
            )}
          </div>
          {(searchQuery || filterStation !== 'all' || selectedCategory !== 'All') && (
            <button
              onClick={() => { setSearchQuery(''); setFilterStation('all'); setSelectedCategory('All'); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                isDarkMode ? 'bg-red-900/30 border-red-700/50 text-red-400 hover:bg-red-900/50' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
              }`}
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Vehicle Tariff Cards */}
      <div className="space-y-4">
        {filteredVehicles.map(vehicle => {
          const tariff = getTariff(vehicle.id);
          const isExpanded = expandedVehicle === vehicle.id;
          const justSaved = savedIds.includes(vehicle.id);
          const catCfg = categoryConfig[tariff.category];

          return (
            <div key={vehicle.id} className={`${cardClass} overflow-hidden transition-all duration-200 ${
              justSaved ? isDarkMode ? 'ring-2 ring-emerald-500/30 border-emerald-500/50' : 'ring-2 ring-emerald-400/30 border-emerald-400/50' : ''
            }`}>
              {/* Main Row */}
              <div
                className={`flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors ${
                  isDarkMode ? 'hover:bg-neutral-800/40' : 'hover:bg-gray-50/60'
                }`}
                onClick={() => setExpandedVehicle(isExpanded ? null : vehicle.id)}
              >
                {/* Vehicle Info */}
                <div className="flex items-center gap-3 w-[260px]">
                  <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-neutral-800/80' : 'bg-gray-100'}`}>
                    <Car className={`w-4.5 h-4.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${textPrimary}`}>{vehicle.model}</p>
                    <p className={`text-[11px] ${textTertiary}`}>{vehicle.license} · {vehicle.station}</p>
                  </div>
                </div>

                {/* Category + Fuel Badges */}
                <div className="flex items-center gap-1.5 w-[220px] flex-wrap">
                  {(tariff.categories ?? [tariff.category]).map(catName => {
                    const cfg = categoryConfig[catName as VehicleCategory];
                    return (
                      <span key={catName} className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold border ${
                        cfg ? (isDarkMode ? cfg.darkBg + ' ' + cfg.darkText + ' border-transparent' : cfg.bg + ' ' + cfg.text + ' border-transparent')
                        : (isDarkMode ? 'bg-neutral-800 text-gray-300 border-neutral-700' : 'bg-gray-100 text-gray-600 border-gray-200')
                      }`}>{catName}</span>
                    );
                  })}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-medium border ${getFuelColor(vehicle.fuelType)}`}>
                    {vehicle.fuelType}
                  </span>
                </div>

                {/* Quick Price Overview */}
                <div className="flex-1 grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Day</p>
                    <p className={`text-xs font-bold ${textPrimary}`}>{formatCurrency(tariff.daily.rate)}</p>
                    <p className={`text-xs ${textTertiary}`}>{tariff.daily.kmLimit} km incl.</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Week</p>
                    <p className={`text-xs font-bold ${textPrimary}`}>{formatCurrency(tariff.weekly.rate)}</p>
                    <p className={`text-xs ${textTertiary}`}>{tariff.weekly.kmLimit.toLocaleString()} km incl.</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Month</p>
                    <p className={`text-xs font-bold ${textPrimary}`}>{formatCurrency(tariff.monthly.rate)}</p>
                    <p className={`text-xs ${textTertiary}`}>{tariff.monthly.kmLimit.toLocaleString()} km incl.</p>
                  </div>
                </div>

                {/* Extra km + Actions */}
                <div className="flex items-center gap-3 w-[160px] justify-end">
                  <div className="text-right">
                    <p className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Extra km</p>
                    <p className={`text-xs font-bold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>{formatCurrency(tariff.extraKmPrice)}</p>
                  </div>
                  <ChevronRight className={`w-5 h-5 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''} ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                </div>
              </div>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className={`border-t px-3 py-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-800/20' : 'border-gray-100 bg-gray-50/40'}`}>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Pricing Details */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Gauge className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                        <h3 className={`text-base font-semibold ${textPrimary}`}>Pricing & Km Limits</h3>
                      </div>
                      <div className="space-y-2.5">
                        {[
                          { label: 'Daily', rate: tariff.daily.rate, km: tariff.daily.kmLimit },
                          { label: 'Weekly', rate: tariff.weekly.rate, km: tariff.weekly.kmLimit },
                          { label: 'Monthly', rate: tariff.monthly.rate, km: tariff.monthly.kmLimit },
                        ].map(p => (
                          <div key={p.label} className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800' : 'bg-white'}`}>
                            <span className={`text-xs font-medium ${textSecondary}`}>{p.label}</span>
                            <div className="text-right">
                              <span className={`text-xs font-bold ${textPrimary}`}>{formatCurrency(p.rate)}</span>
                              <span className={`text-xs ml-2 ${textTertiary}`}>{p.km.toLocaleString()} km</span>
                            </div>
                          </div>
                        ))}
                        <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-amber-900/20 border border-amber-700/30' : 'bg-amber-50 border border-amber-200/60'}`}>
                          <span className={`text-xs font-medium ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>Extra km</span>
                          <span className={`text-xs font-bold ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>{formatCurrency(tariff.extraKmPrice)} / km</span>
                        </div>
                      </div>
                    </div>

                    {/* Mileage Packages */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Package className={`w-5 h-5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                        <h3 className={`text-base font-semibold ${textPrimary}`}>Mileage Packages</h3>
                      </div>
                      <div className="space-y-2">
                        {tariff.mileagePackages.map(pkg => (
                          <div key={pkg.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800' : 'bg-white'}`}>
                            <div>
                              <p className={`text-xs font-semibold ${textPrimary}`}>+{pkg.km.toLocaleString()} km</p>
                              <p className={`text-xs ${textTertiary}`}>{formatCurrency(pkg.price / pkg.km * 1000).replace('â‚¬', 'â‚¬')}/1000km effective</p>
                            </div>
                            <span className={`text-xs font-bold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>{formatCurrency(pkg.price)}</span>
                          </div>
                        ))}
                        {tariff.mileagePackages.length === 0 && (
                          <p className={`text-xs text-center py-3 ${textTertiary}`}>No packages configured</p>
                        )}
                      </div>
                    </div>

                    {/* Insurance Options */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                        <h3 className={`text-base font-semibold ${textPrimary}`}>Additional Insurance</h3>
                      </div>
                      <div className="space-y-2">
                        {tariff.insurances.map(ins => (
                          <div key={ins.id} className={`px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-neutral-800' : 'bg-white'}`}>
                            <div className="flex items-center justify-between">
                              <p className={`text-xs font-semibold ${textPrimary}`}>{ins.name}</p>
                              <span className={`text-xs font-bold ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>{formatCurrency(ins.dailyPrice)}/day</span>
                            </div>
                            <p className={`text-xs mt-0.5 ${textTertiary}`}>{ins.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Edit Button */}
                  <div className="flex justify-end mt-4 pt-4 border-t border-dashed" style={{ borderColor: isDarkMode ? 'rgba(64,64,64,0.5)' : 'rgba(200,200,200,0.6)' }}>
                    {justSaved ? (
                      <div className="flex items-center gap-1.5 text-emerald-500">
                        <Check className="w-5 h-5" />
                        <span className="text-[10px] font-medium">Saved</span>
                      </div>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); startEditing(vehicle.id); }}
                        className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg shadow-sm hover:shadow-md transition-all text-xs font-semibold"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        Configure Tariff
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredVehicles.length === 0 && (
        <div className={`${cardClass} py-12 text-center`}>
          <Car className={`w-5 h-5 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`text-xs font-medium ${textSecondary}`}>No vehicles match your filters</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className={`text-xs ${textTertiary}`}>Showing {filteredVehicles.length} of {fleetVehicles.length} unique vehicles{totalAssignments > fleetVehicles.length ? ` · ${totalAssignments} total group assignments` : ''}</p>
      </div>

      </div>{/* End of main content wrapper */}

      {/* Edit Modal */}
      {editingVehicle && editTariff && (() => {
        const vehicle = fleetVehicles.find(v => v.id === editingVehicle)!;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={cancelEditing}>
            <div
              className="absolute inset-0 transition-all duration-500 ease-out"
              style={{
                backgroundColor: isEditAnimating ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0)',
              }}
            />
            <div onClick={(e) => e.stopPropagation()}
              className={`relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border shadow-2xl transition-all duration-500 ease-out ${
              isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
            }`}
              style={{
                transform: isEditAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)',
                opacity: isEditAnimating ? 1 : 0,
                boxShadow: isEditAnimating
                  ? '0 25px 60px -12px rgba(0, 0, 0, 0.35), 0 0 40px -8px rgba(59, 130, 246, 0.15)'
                  : '0 10px 30px -12px rgba(0, 0, 0, 0)',
              }}>
              {/* Modal Header */}
              <div className={`sticky top-0 z-10 px-8 pt-7 pb-5 border-b ${isDarkMode ? 'border-neutral-700 bg-neutral-900' : 'border-gray-100 bg-white'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className={`text-base font-bold ${textPrimary}`}>Configure Tariff</h2>
                    <p className={`text-xs mt-0.5 ${textSecondary}`}>{vehicle.model} Â· {vehicle.license}</p>
                  </div>
                  <button onClick={cancelEditing} className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="px-8 py-3 space-y-8">
                {/* Group Assignment */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Tag className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                    <h3 className={`text-base font-semibold ${textPrimary}`}>Groups</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {allCategoryNames.map(catName => {
                      const isIn = (editTariff.categories ?? [editTariff.category]).includes(catName);
                      const cfg = categoryConfig[catName as VehicleCategory];
                      return (
                        <button key={catName} onClick={() => {
                          const cats = editTariff.categories ?? [editTariff.category];
                          const next = isIn ? cats.filter(c => c !== catName) : [...cats, catName];
                          if (next.length === 0) return;
                          setEditTariff({ ...editTariff, categories: next });
                        }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            isIn
                              ? cfg ? (isDarkMode ? cfg.darkBg + ' ' + cfg.darkText + ' ' + cfg.darkBorder : cfg.bg + ' ' + cfg.text + ' ' + cfg.border)
                                    : (isDarkMode ? 'bg-blue-900/30 text-blue-400 border-blue-500/50' : 'bg-blue-50 text-blue-700 border-blue-300')
                              : isDarkMode ? 'bg-neutral-800 text-gray-500 border-neutral-700/50 hover:text-gray-300' : 'bg-gray-50 text-gray-400 border-gray-200 hover:text-gray-600'
                          }`}>
                          {catName}{isIn && <Check className="inline w-3 h-3 ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Pricing & Km Limits */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Gauge className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                    <h3 className={`text-base font-semibold ${textPrimary}`}>Pricing & Kilometer Limits</h3>
                  </div>
                  <div className="space-y-3">
                    {(['daily', 'weekly', 'monthly'] as const).map(period => (
                      <div key={period} className={`grid grid-cols-[120px_1fr_1fr_1fr] gap-3 items-center p-3 rounded-lg ${isDarkMode ? 'bg-neutral-800/40' : 'bg-gray-50'}`}>
                        <span className={`text-xs font-semibold capitalize ${textPrimary}`}>{period}</span>
                        <div>
                          <label className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Rate</label>
                          <div className="relative mt-1">
                            <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs ${textTertiary}`}>â‚¬</span>
                            <input type="number" value={editTariff[period].rate}
                              onChange={e => setEditTariff({ ...editTariff, [period]: { ...editTariff[period], rate: Number(e.target.value) } })}
                              className={`${inputClass} pl-7`} />
                          </div>
                        </div>
                        <div>
                          <label className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Km Limit</label>
                          <div className="relative mt-1">
                            <input type="number" value={editTariff[period].kmLimit}
                              onChange={e => setEditTariff({ ...editTariff, [period]: { ...editTariff[period], kmLimit: Number(e.target.value) } })}
                              className={inputClass} />
                            <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${textTertiary}`}>km</span>
                          </div>
                        </div>
                        <div>
                          <label className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Effective/km</label>
                          <div className={`mt-1 px-3 py-2 rounded-lg text-xs font-medium ${isDarkMode ? 'bg-neutral-700/40 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                            {editTariff[period].kmLimit > 0
                              ? formatCurrency(editTariff[period].rate / editTariff[period].kmLimit)
                              : '—'}
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Extra Km Price */}
                    <div className={`p-3 rounded-lg ${isDarkMode ? 'bg-amber-900/20 border border-amber-700/30' : 'bg-amber-50 border border-amber-200/60'}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>Extra Kilometer Price</span>
                        <div className="w-[140px] relative">
                          <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>â‚¬</span>
                          <input type="number" step="0.01" value={editTariff.extraKmPrice}
                            onChange={e => setEditTariff({ ...editTariff, extraKmPrice: Number(e.target.value) })}
                            className={`${inputClass} pl-7`} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mileage Packages */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Package className={`w-5 h-5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                      <h3 className={`text-base font-semibold ${textPrimary}`}>Mileage Packages</h3>
                    </div>
                    <button onClick={addMileagePackage}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        isDarkMode ? 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      <Plus className="w-3 h-3" /> Add Package
                    </button>
                  </div>
                  <div className="space-y-2">
                    {editTariff.mileagePackages.map(pkg => (
                      <div key={pkg.id} className={`flex items-center gap-3 p-3 rounded-lg ${isDarkMode ? 'bg-neutral-800/40' : 'bg-gray-50'}`}>
                        <div className="flex-1">
                          <label className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Kilometers</label>
                          <div className="relative mt-1">
                            <input type="number" value={pkg.km}
                              onChange={e => updateMileagePackage(pkg.id, 'km', Number(e.target.value))}
                              className={inputClass} />
                            <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${textTertiary}`}>km</span>
                          </div>
                        </div>
                        <div className="flex-1">
                          <label className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Price</label>
                          <div className="relative mt-1">
                            <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs ${textTertiary}`}>â‚¬</span>
                            <input type="number" value={pkg.price}
                              onChange={e => updateMileagePackage(pkg.id, 'price', Number(e.target.value))}
                              className={`${inputClass} pl-7`} />
                          </div>
                        </div>
                        <div className="w-[100px]">
                          <label className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Per km</label>
                          <div className={`mt-1 px-3 py-2 rounded-lg text-xs font-medium ${isDarkMode ? 'bg-neutral-700/40 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                            {formatCurrency(pkg.price / (pkg.km || 1))}
                          </div>
                        </div>
                        <button onClick={() => removeMileagePackage(pkg.id)}
                          className={`mt-4 p-2 rounded-lg transition-colors ${isDarkMode ? 'text-red-400 hover:bg-red-900/30' : 'text-red-500 hover:bg-red-50'}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {editTariff.mileagePackages.length === 0 && (
                      <p className={`text-xs text-center py-3 ${textTertiary}`}>No mileage packages. Click "Add Package" to create one.</p>
                    )}
                  </div>
                </div>

                {/* Insurance Options */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Shield className={`w-5 h-5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                      <h3 className={`text-base font-semibold ${textPrimary}`}>Additional Insurance</h3>
                    </div>
                    <button onClick={addInsurance}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        isDarkMode ? 'bg-purple-900/30 text-purple-400 hover:bg-purple-900/50' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                      }`}
                    >
                      <Plus className="w-3 h-3" /> Add Insurance
                    </button>
                  </div>
                  <div className="space-y-2">
                    {editTariff.insurances.map(ins => (
                      <div key={ins.id} className={`p-3 rounded-lg ${isDarkMode ? 'bg-neutral-800/40' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <label className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Name</label>
                            <input type="text" value={ins.name}
                              onChange={e => updateInsurance(ins.id, 'name', e.target.value)}
                              className={`${inputClass} mt-1`} />
                          </div>
                          <div className="w-[120px]">
                            <label className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Daily Price</label>
                            <div className="relative mt-1">
                              <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs ${textTertiary}`}>â‚¬</span>
                              <input type="number" value={ins.dailyPrice}
                                onChange={e => updateInsurance(ins.id, 'dailyPrice', Number(e.target.value))}
                                className={`${inputClass} pl-7`} />
                            </div>
                          </div>
                          <button onClick={() => removeInsurance(ins.id)}
                            className={`mt-4 p-2 rounded-lg transition-colors ${isDarkMode ? 'text-red-400 hover:bg-red-900/30' : 'text-red-500 hover:bg-red-50'}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="mt-2">
                          <label className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Description</label>
                          <input type="text" value={ins.description}
                            onChange={e => updateInsurance(ins.id, 'description', e.target.value)}
                            className={`${inputClass} mt-1`} />
                        </div>
                      </div>
                    ))}
                    {editTariff.insurances.length === 0 && (
                      <p className={`text-xs text-center py-3 ${textTertiary}`}>No insurance options. Click "Add Insurance" to create one.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className={`sticky bottom-0 px-8 py-3 border-t flex items-center justify-end gap-3 ${isDarkMode ? 'border-neutral-700 bg-neutral-900' : 'border-gray-100 bg-white'}`}>
                <button onClick={cancelEditing}
                  className={`px-3 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                    isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Cancel
                </button>
                <button onClick={saveEditing}
                  className="flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all text-xs font-semibold"
                >
                  <Save className="w-5 h-5" />
                  Save Tariff
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}