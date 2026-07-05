import { Icon } from '../ui/Icon';
import { useEffect, useRef, useState, useCallback } from 'react';


// V4.6.75 — Canvas-based signature pad with touch + mouse + typed-name
// fallback. Emits both a rendered PNG data URL (for the signature image
// stored in BookingHandoverProtocol.customer/staff_signature_data_url) and
// an optional typed name (stored in the sibling `*_name` column). Either
// may be empty; the parent decides which is required.

interface SignaturePadProps {
  label: string;
  isDarkMode: boolean;
  typedName: string;
  onTypedNameChange: (value: string) => void;
  dataUrl: string | null;
  onDataUrlChange: (value: string | null) => void;
  required?: boolean;
  helperText?: string;
  /** Canvas CSS height (default 140px). Operator handover uses taller pads. */
  canvasHeight?: number | string;
}

type Mode = 'draw' | 'type';

export function SignaturePad({
  label,
  isDarkMode,
  typedName,
  onTypedNameChange,
  dataUrl,
  onDataUrlChange,
  required,
  helperText,
  canvasHeight = 140,
}: SignaturePadProps) {
  const [mode, setMode] = useState<Mode>('draw');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const hasStrokesRef = useRef(false);

  const ink = isDarkMode ? '#f9fafb' : '#111827';

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Preserve existing pixels when DPR changes require a resize so the
    // stroke doesn't vanish mid-interaction. We repaint from the stored
    // dataUrl if present.
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const prevDataUrl = dataUrl;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = ink;
    if (prevDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = prevDataUrl;
    }
  }, [dataUrl, ink]);

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Repaint stroke style if dark mode toggles while open.
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = ink;
  }, [ink]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const commit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasStrokesRef.current) {
      onDataUrlChange(null);
      return;
    }
    try {
      const url = canvas.toDataURL('image/png');
      onDataUrlChange(url);
    } catch {
      onDataUrlChange(null);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = getPoint(e);
    if (!p) return;
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = p;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const p = getPoint(e);
    if (!p) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
    hasStrokesRef.current = true;
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    commit();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokesRef.current = false;
    onDataUrlChange(null);
  };

  const badgeBase = `px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors inline-flex items-center gap-1`;
  const borderColor = isDarkMode ? 'border-neutral-700' : 'border-gray-200';
  const canvasBg = isDarkMode ? 'bg-neutral-950' : 'bg-white';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className={`text-xs font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode('draw')}
            className={`${badgeBase} ${
              mode === 'draw'
                ? isDarkMode
                  ? 'bg-brand/30 text-brand border border-brand/40'
                  : 'bg-brand-soft text-brand border border-border'
                : isDarkMode
                ? 'bg-card text-gray-400 border border-neutral-700 hover:bg-neutral-700'
                : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
            }`}
          >
            <Icon name="pen-tool" className="w-3 h-3" />
            Zeichnen
          </button>
          <button
            type="button"
            onClick={() => setMode('type')}
            className={`${badgeBase} ${
              mode === 'type'
                ? isDarkMode
                  ? 'bg-brand/30 text-brand border border-brand/40'
                  : 'bg-brand-soft text-brand border border-border'
                : isDarkMode
                ? 'bg-card text-gray-400 border border-neutral-700 hover:bg-neutral-700'
                : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
            }`}
          >
            <Icon name="type" className="w-3 h-3" />
            Tippen
          </button>
        </div>
      </div>

      {mode === 'draw' ? (
        <div className={`relative rounded-lg border ${borderColor} ${canvasBg} overflow-hidden`}>
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            style={{
              width: '100%',
              height: typeof canvasHeight === 'number' ? `${canvasHeight}px` : canvasHeight,
              touchAction: 'none',
              cursor: 'crosshair',
            }}
          />
          <button
            type="button"
            onClick={clearCanvas}
            className={`absolute top-2 right-2 p-1.5 rounded-md transition-colors ${
              isDarkMode
                ? 'bg-card/90 text-gray-400 hover:text-red-400 hover:bg-neutral-700'
                : 'bg-white/90 text-gray-500 hover:text-red-500 hover:bg-gray-50 shadow-sm'
            }`}
            title="Unterschrift löschen"
          >
            <Icon name="eraser" className="w-3.5 h-3.5" />
          </button>
          {!dataUrl && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className={`text-[11px] ${isDarkMode ? 'text-gray-600' : 'text-muted-foreground'}`}>
                Hier unterschreiben
              </span>
            </div>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={typedName}
          onChange={(e) => onTypedNameChange(e.target.value)}
          placeholder="Vor- und Nachname"
          className={`w-full px-3 py-2 rounded-lg border text-sm ${
            isDarkMode
              ? 'bg-neutral-900 border-neutral-700 text-gray-100 placeholder-gray-500'
              : 'bg-card border-border text-foreground placeholder:text-muted-foreground'
          } focus:outline-none focus:ring-2 focus:ring-blue-500/40`}
        />
      )}

      {helperText && (
        <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>{helperText}</p>
      )}
    </div>
  );
}
