import { AlertCircle, CheckCircle2, CloudOff, Loader2, RefreshCw, Upload, WifiOff } from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  OPERATOR_CONNECTIVITY_BANNER_SLOT_PX,
  type OperatorConnectivityStateId,
  type OperatorConnectivityTone,
} from '../connectivity/operatorConnectivity.types';
import { useOperatorConnectivityBanner } from '../connectivity/useOperatorConnectivityStatus';

const TONE_CLASS: Record<OperatorConnectivityTone, string> = {
  error:
    'border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.08] text-[color:var(--status-critical)]',
  watch:
    'border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.08] text-[color:var(--status-watch)]',
  info: 'border-[color:var(--status-info)]/30 bg-[color:var(--status-info)]/[0.08] text-[color:var(--status-info)]',
  success:
    'border-[color:var(--status-good)]/30 bg-[color:var(--status-good)]/[0.08] text-[color:var(--status-good)]',
};

function StateIcon({ stateId, tone }: { stateId: OperatorConnectivityStateId | null; tone: OperatorConnectivityTone }) {
  const className = `h-3.5 w-3.5 shrink-0 ${tone === 'info' || tone === 'success' ? '' : ''}`;
  switch (stateId) {
    case 'auth-expired':
    case 'upload-failed':
    case 'draft-save-failed':
      return <AlertCircle className={className} aria-hidden />;
    case 'backend-unreachable':
      return <CloudOff className={className} aria-hidden />;
    case 'browser-offline':
      return <WifiOff className={className} aria-hidden />;
    case 'upload-service-degraded':
    case 'queue-pending':
      return <Upload className={className} aria-hidden />;
    case 'connection-restored':
    case 'syncing':
      return <RefreshCw className={`${className} ${stateId === 'syncing' ? 'animate-spin' : ''}`} aria-hidden />;
    case 'api-partial':
      return <AlertCircle className={className} aria-hidden />;
    case 'synced':
      return <CheckCircle2 className={className} aria-hidden />;
    default:
      return <Loader2 className={`${className} animate-spin`} aria-hidden />;
  }
}

/**
 * Action-oriented connectivity banner driven by aggregated health, queue, draft, and auth signals.
 */
export function OperatorConnectivityBanner() {
  const banner = useOperatorConnectivityBanner();
  const liveRef = useRef<HTMLSpanElement>(null);
  const previousMessageRef = useRef('');

  useEffect(() => {
    if (!banner.announce || !banner.visible) return;
    if (banner.message === previousMessageRef.current) return;
    previousMessageRef.current = banner.message;
  }, [banner.announce, banner.message, banner.visible]);

  return (
    <div
      className="shrink-0 border-b border-transparent"
      style={{ minHeight: OPERATOR_CONNECTIVITY_BANNER_SLOT_PX }}
      data-connectivity-state={banner.stateId ?? 'hidden'}
    >
      <div
        className={`flex items-center justify-center gap-2 px-4 py-2 text-center text-[11px] font-medium transition-opacity duration-200 ${
          banner.visible ? 'opacity-100' : 'pointer-events-none opacity-0'
        } ${banner.visible ? TONE_CLASS[banner.tone] : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-hidden={!banner.visible}
      >
        {banner.visible && <StateIcon stateId={banner.stateId} tone={banner.tone} />}
        <span ref={liveRef} className="leading-snug">
          {banner.visible ? banner.message : '\u00a0'}
        </span>
      </div>
    </div>
  );
}
