import { FileText, DollarSign, Shield, Car, Receipt, ClipboardList, Wrench, Download } from 'lucide-react';
import { VehicleData } from '../data/vehicles';

interface DocumentsViewProps {
  isDarkMode: boolean;
  vehicle?: VehicleData | null;
}

type TuvRow = { date: string; org: string; km: string; result: string; next: string };
type ServiceRow = { date: string; art: string; workshop: string; km: string; cost: string };
type RepairRow = { date: string; repair: string; workshop: string; km: string; cost: string };

const tuvHistory: TuvRow[] = [];
const serviceHistory: ServiceRow[] = [];
const repairHistory: RepairRow[] = [];

export function DocumentsView({ isDarkMode, vehicle }: DocumentsViewProps) {
  const cardClass = `rounded-lg border shadow-sm ${
    isDarkMode
      ? 'bg-neutral-900 border-neutral-700'
      : 'bg-white border-gray-200'
  }`;

  const thClass = `text-left text-xs uppercase tracking-wider font-semibold pb-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`;
  const tdClass = `py-2 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`;

  const dash = '—';
  const monthlyLines = [
    { label: 'Leasing/Finanzierung', value: vehicle?.leasingRate ?? dash },
    { label: 'Versicherung (mtl.)', value: vehicle?.insuranceCost ?? dash },
    { label: 'Kfz-Steuer (mtl.)', value: vehicle?.taxCost ?? dash },
    { label: 'Wartung & Service (Ø)', value: dash },
    { label: 'Reparaturen (Ø)', value: dash },
  ];

  const emptyStateClass = `text-xs text-center py-6 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`;

  return (
    <div className="space-y-5">
      {/* Top Row: Fahrzeug Dokumente + Monatliche Fixkosten */}
      <div className="grid grid-cols-2 gap-3">
        {/* Fahrzeug Dokumente */}
        <div className={`${cardClass} p-4`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
              <FileText className="w-4.5 h-4.5 text-gray-600" />
            </div>
            <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Fahrzeug Dokumente</h3>
          </div>
          <p className={emptyStateClass}>No data available</p>
          <button
            type="button"
            disabled
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg border text-xs font-medium transition-all opacity-50 cursor-not-allowed ${
              isDarkMode
                ? 'bg-neutral-800 border-neutral-700 text-gray-500'
                : 'bg-white border-gray-200 text-gray-400'
            }`}
          >
            <Download className="w-5 h-5" />
            Alle Dokumente anzeigen
          </button>
        </div>

        {/* Monatliche Fixkosten */}
        <div className={`${cardClass} p-4 border-l-4 ${isDarkMode ? 'border-l-green-500/50' : 'border-l-green-400'}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
              <DollarSign className="w-4.5 h-4.5 text-green-600" />
            </div>
            <h3 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Monatliche Fixkosten</h3>
          </div>
          <div className="space-y-3.5">
            {monthlyLines.map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{item.label}</span>
                <span className={`text-xs font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{item.value}</span>
              </div>
            ))}
            <div className={`pt-3 mt-1 border-t flex items-center justify-between ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
              <span className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Gesamt pro Monat</span>
              <span className={`text-[10px] font-bold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {vehicle?.totalMonthlyCost ?? dash}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Middle Row: 4 Document Cards */}
      <div className="grid grid-cols-4 gap-3">
        {/* Leasing/Finanzierung */}
        <div className={`${cardClass} p-4 border-l-4 ${isDarkMode ? 'border-l-blue-500/50' : 'border-l-blue-400'}`}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-5 h-5 rounded-lg bg-blue-100 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-blue-600" />
            </div>
            <h4 className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Leasing/Finanzierung</h4>
          </div>
          <p className={`${emptyStateClass} mb-3`}>No data available</p>
          <button
            type="button"
            disabled
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-500/50 text-white text-xs font-semibold cursor-not-allowed opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            Vertrag herunterladen
          </button>
        </div>

        {/* Versicherung */}
        <div className={`${cardClass} p-4 border-l-4 ${isDarkMode ? 'border-l-green-500/50' : 'border-l-green-400'}`}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-5 h-5 rounded-lg bg-green-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-green-600" />
            </div>
            <h4 className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Versicherung</h4>
          </div>
          <p className={`${emptyStateClass} mb-3`}>No data available</p>
          <button
            type="button"
            disabled
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-500/50 text-white text-xs font-semibold cursor-not-allowed opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            Police herunterladen
          </button>
        </div>

        {/* Kfz-Steuer */}
        <div className={`${cardClass} p-4 border-l-4 ${isDarkMode ? 'border-l-amber-500/50' : 'border-l-amber-400'}`}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-5 h-5 rounded-lg bg-amber-100 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-amber-600" />
            </div>
            <h4 className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Kfz-Steuer</h4>
          </div>
          <p className={`${emptyStateClass} mb-3`}>No data available</p>
          <button
            type="button"
            disabled
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-amber-500/50 text-white text-xs font-semibold cursor-not-allowed opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            Bescheid herunterladen
          </button>
        </div>

        {/* Zulassungspapiere */}
        <div className={`${cardClass} p-4 border-l-4 ${isDarkMode ? 'border-l-purple-500/50' : 'border-l-purple-400'}`}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-5 h-5 rounded-lg bg-purple-100 flex items-center justify-center">
              <Car className="w-5 h-5 text-purple-600" />
            </div>
            <h4 className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Zulassungspapiere</h4>
          </div>
          <p className={`${emptyStateClass} mb-3`}>No data available</p>
          <button
            type="button"
            disabled
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500/50 text-white text-xs font-semibold cursor-not-allowed opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            Dokumente herunterladen
          </button>
        </div>
      </div>

      {/* Bottom Row: TÜV, Service, Reparatur */}
      <div className="grid grid-cols-3 gap-3">
        {/* TÜV Nachweise */}
        <div className={`${cardClass} p-4`}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-5 h-5 rounded-lg bg-green-100 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-green-600" />
            </div>
            <h4 className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>TÜV Nachweise</h4>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className={thClass}>Datum</th>
                <th className={thClass}>Prüforg.</th>
                <th className={thClass}>KM-Stand</th>
                <th className={thClass}>Ergebnis</th>
                <th className={thClass}>Nächste HU</th>
                <th className={thClass}>Dokument</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
              {tuvHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${tdClass} py-8 text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    No data available
                  </td>
                </tr>
              ) : (
                tuvHistory.map((row, i) => (
                  <tr key={i}>
                    <td className={tdClass}>{row.date}</td>
                    <td className={tdClass}>{row.org}</td>
                    <td className={tdClass}>{row.km}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
                        {row.result}
                      </span>
                    </td>
                    <td className={tdClass}>{row.next}</td>
                    <td className="py-2">
                      <button type="button" className="text-red-400 hover:text-red-600 transition-colors">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Service Nachweise */}
        <div className={`${cardClass} p-4`}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-5 h-5 rounded-lg bg-blue-100 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-blue-600" />
            </div>
            <h4 className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Service Nachweise</h4>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className={thClass}>Datum</th>
                <th className={thClass}>Art</th>
                <th className={thClass}>Werkstatt</th>
                <th className={thClass}>KM-Stand</th>
                <th className={thClass}>Kosten</th>
                <th className={thClass}>Dokument</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
              {serviceHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${tdClass} py-8 text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    No data available
                  </td>
                </tr>
              ) : (
                serviceHistory.map((row, i) => (
                  <tr key={i}>
                    <td className={tdClass}>{row.date}</td>
                    <td className={tdClass}>{row.art}</td>
                    <td className={tdClass}>{row.workshop}</td>
                    <td className={tdClass}>{row.km}</td>
                    <td className={tdClass}>{row.cost}</td>
                    <td className="py-2">
                      <button type="button" className="text-red-400 hover:text-red-600 transition-colors">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Reparatur Nachweise */}
        <div className={`${cardClass} p-4`}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-5 h-5 rounded-lg bg-red-100 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-red-600" />
            </div>
            <h4 className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Reparatur Nachweise</h4>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className={thClass}>Datum</th>
                <th className={thClass}>Reparatur</th>
                <th className={thClass}>Werkstatt</th>
                <th className={thClass}>KM-Stand</th>
                <th className={thClass}>Kosten</th>
                <th className={thClass}>Dokument</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
              {repairHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${tdClass} py-8 text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    No data available
                  </td>
                </tr>
              ) : (
                repairHistory.map((row, i) => (
                  <tr key={i}>
                    <td className={tdClass}>{row.date}</td>
                    <td className={tdClass}>{row.repair}</td>
                    <td className={tdClass}>{row.workshop}</td>
                    <td className={tdClass}>{row.km}</td>
                    <td className={tdClass}>{row.cost}</td>
                    <td className="py-2">
                      <button type="button" className="text-red-400 hover:text-red-600 transition-colors">
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
