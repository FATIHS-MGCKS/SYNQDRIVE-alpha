import type { StatusTone } from '../../../components/patterns';

export function bookingStatusTone(status: string): StatusTone {
  const s = status.toLowerCase();
  if (s.includes('abgeschlossen') || s === 'completed') return 'info';
  if (s.includes('aktiv') || s === 'active') return 'success';
  if (s.includes('bestätigt') || s === 'confirmed') return 'info';
  if (s.includes('ausstehend') || s === 'pending') return 'warning';
  if (s.includes('storniert') || s.includes('no-show')) return 'neutral';
  return 'neutral';
}
