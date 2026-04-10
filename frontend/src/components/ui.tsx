import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, color = 'gray' }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-white', blue: 'bg-blue-50 border-blue-200', green: 'bg-emerald-50 border-emerald-200',
    red: 'bg-red-50 border-red-200', yellow: 'bg-amber-50 border-amber-200', indigo: 'bg-indigo-50 border-indigo-200',
    purple: 'bg-purple-50 border-purple-200',
  };
  return (
    <div className={`${colorMap[color] || colorMap.gray} border rounded-xl p-5`}>
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export function Badge({ children, color = 'gray' }: { children: ReactNode; color?: string }) {
  const map: Record<string, string> = {
    green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-800',
    yellow: 'bg-amber-100 text-amber-800', blue: 'bg-blue-100 text-blue-800',
    gray: 'bg-gray-100 text-gray-800', indigo: 'bg-indigo-100 text-indigo-800',
    purple: 'bg-purple-100 text-purple-800', orange: 'bg-orange-100 text-orange-800',
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${map[color] || map.gray}`}>{children}</span>;
}

export function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (['active', 'available', 'connected', 'paid', 'good', 'clean', 'completed', 'resolved'].includes(s)) return 'green';
  if (['rented', 'confirmed', 'in progress', 'qualified', 'business'].includes(s)) return 'blue';
  if (['pending', 'trial', 'new', 'open', 'waiting', 'needs cleaning'].includes(s)) return 'yellow';
  if (['suspended', 'blocked', 'cancelled', 'critical', 'error', 'urgent', 'past_due', 'out_of_service'].includes(s)) return 'red';
  if (['reserved', 'negotiation', 'maintenance'].includes(s)) return 'purple';
  if (['warning', 'contacted', 'in_service'].includes(s)) return 'orange';
  if (['inactive', 'disconnected', 'archived', 'converted'].includes(s)) return 'gray';
  return 'gray';
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              {headers.map((h) => (
                <th key={h} className="text-left px-4 py-3 font-medium text-gray-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</td>;
}

export function Loader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="text-center py-12 text-gray-400">{message}</div>;
}

export function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatCurrency(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents);
}

export function useData<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcher()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error, refetch: () => fetcher().then(setData) };
}

import { useState, useEffect } from 'react';
