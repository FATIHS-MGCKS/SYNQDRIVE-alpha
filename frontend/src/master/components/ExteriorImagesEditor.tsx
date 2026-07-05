import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  AlertCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import type {
  VehicleExteriorImageDto,
  VehicleExteriorModelImageDto,
  VehicleExteriorModelTemplateSummary,
  VehicleExteriorViewKey,
} from '../../lib/api';

/**
 * V4.7.50 — Reusable editor for the five canonical exterior photos that
 * power the Rental Damages "Vehicle damage map" carousel. Used both in
 * the Master-Admin vehicle detail drawer (`PlatformVehiclesView`) and as
 * an optional section inside `VehicleRegistrationModal`.
 *
 * Two modes:
 *   1. PERSISTED: a real `vehicleId` exists → uploads/deletes go straight
 *      to the API (`api.vehicles.exteriorImages.*`).
 *   2. BUFFERED: no `vehicleId` yet (e.g. mid-registration) → changes are
 *      held in-memory and surfaced via `onBufferedChange`. After the host
 *      form has the vehicleId, the parent flushes the buffer using
 *      `flushBufferedExteriorImages`.
 */

export interface ExteriorImageBufferEntry {
  view: VehicleExteriorViewKey;
  imageData: string; // base64 data URI
  caption?: string | null;
}

interface ExteriorImagesEditorProps {
  isDarkMode: boolean;
  vehicleId?: string | null;
  /** Optional title — defaults to "Exterior Photos". */
  title?: string;
  /** Optional subtitle below the title. */
  subtitle?: string;
  /** Vehicle identity used for reusable model-level templates. */
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  /** Buffered-mode hook: parent receives the working set. */
  onBufferedChange?: (buffered: ExteriorImageBufferEntry[]) => void;
}

interface ViewConfig {
  key: VehicleExteriorViewKey;
  label: string;
  hint: string;
}

const VIEWS: ViewConfig[] = [
  { key: 'FRONT', label: 'Front',  hint: 'Headlights, grille, bumper' },
  { key: 'LEFT',  label: 'Left',   hint: 'Driver-side profile' },
  { key: 'RIGHT', label: 'Right',  hint: 'Passenger-side profile' },
  { key: 'REAR',  label: 'Rear',   hint: 'Tail lights, trunk, bumper' },
  { key: 'ROOF',  label: 'Roof',   hint: 'Top-down view' },
];

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const TARGET_COMPRESSED_BYTES = 420 * 1024;
const MAX_IMAGE_EDGE_PX = 1280;
const MIN_IMAGE_EDGE_PX = 720;
const INITIAL_IMAGE_QUALITY = 0.72;
const MIN_IMAGE_QUALITY = 0.46;

type UploadTarget = 'vehicle' | 'model';

function estimateDataUrlBytes(value: string): number {
  const idx = value.indexOf(',');
  const base64 = idx >= 0 ? value.slice(idx + 1) : value;
  return Math.floor((base64.length * 3) / 4);
}

function canvasToDataUrl(canvas: HTMLCanvasElement, mimeType: 'image/webp' | 'image/jpeg', quality: number): string {
  const dataUrl = canvas.toDataURL(mimeType, quality);
  // Safari and older browsers can silently fall back when WebP encoding is not available.
  if (mimeType === 'image/webp' && !dataUrl.startsWith('data:image/webp')) {
    return canvas.toDataURL('image/jpeg', quality);
  }
  return dataUrl;
}

function loadImageForCompression(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image could not be decoded.'));
    };
    img.src = url;
  });
}

async function compressExteriorImage(file: File): Promise<{ dataUrl: string; originalBytes: number; compressedBytes: number }> {
  const originalBytes = file.size;
  const img = await loadImageForCompression(file);
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  if (!sourceWidth || !sourceHeight) {
    throw new Error('Image has invalid dimensions.');
  }

  let maxEdge = MAX_IMAGE_EDGE_PX;
  let quality = INITIAL_IMAGE_QUALITY;
  let bestDataUrl = '';
  let bestBytes = Number.POSITIVE_INFINITY;

  // Iterate dimension and quality downward until the payload is small enough
  // for fast DB-backed damage-map rendering while keeping the view usable.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image compression is not supported in this browser.');

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvasToDataUrl(canvas, 'image/webp', quality);
    const bytes = estimateDataUrlBytes(dataUrl);
    if (bytes < bestBytes) {
      bestBytes = bytes;
      bestDataUrl = dataUrl;
    }
    if (bytes <= TARGET_COMPRESSED_BYTES || (quality <= MIN_IMAGE_QUALITY && maxEdge <= MIN_IMAGE_EDGE_PX)) {
      break;
    }

    if (quality > MIN_IMAGE_QUALITY) {
      quality = Math.max(MIN_IMAGE_QUALITY, quality - 0.08);
    } else {
      maxEdge = Math.max(MIN_IMAGE_EDGE_PX, Math.round(maxEdge * 0.82));
    }
  }

  if (!bestDataUrl) throw new Error('Image compression failed.');
  return { dataUrl: bestDataUrl, originalBytes, compressedBytes: bestBytes };
}

export function ExteriorImagesEditor({
  isDarkMode,
  vehicleId,
  title = 'Exterior Photos',
  subtitle = 'Upload one photo per view. They power the Rental damage map carousel.',
  vehicleMake,
  vehicleModel,
  onBufferedChange,
}: ExteriorImagesEditorProps) {
  const persisted = !!vehicleId;
  const [persistedImages, setPersistedImages] = useState<Record<string, VehicleExteriorImageDto>>({});
  const [modelImages, setModelImages] = useState<Record<string, VehicleExteriorModelImageDto>>({});
  const [modelTemplates, setModelTemplates] = useState<VehicleExteriorModelTemplateSummary[]>([]);
  const [modelKey, setModelKey] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>('vehicle');
  const [buffered, setBuffered] = useState<Record<string, ExteriorImageBufferEntry>>({});
  const [loading, setLoading] = useState(false);
  const [busyView, setBusyView] = useState<VehicleExteriorViewKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const canUseModelTemplates = persisted && !!vehicleMake?.trim() && !!vehicleModel?.trim();

  // Load existing photos when we have a vehicleId
  useEffect(() => {
    if (!persisted || !vehicleId) {
      setPersistedImages({});
      setModelImages({});
      setModelKey(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.vehicles.exteriorImages
      .listEffectiveAdmin(vehicleId)
      .then((response) => {
        if (cancelled) return;
        const map: Record<string, VehicleExteriorImageDto> = {};
        response.vehicle.forEach((r) => { map[r.view] = r; });
        const modelMap: Record<string, VehicleExteriorModelImageDto> = {};
        response.model.forEach((r) => { modelMap[r.view] = r; });
        setPersistedImages(map);
        setModelImages(modelMap);
        setModelKey(response.modelKey);
      })
      .catch(() => {
        if (!cancelled) {
          setPersistedImages({});
          setModelImages({});
          setModelKey(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [persisted, vehicleId]);

  useEffect(() => {
    if (!persisted) {
      setModelTemplates([]);
      return;
    }
    let cancelled = false;
    api.vehicles.exteriorImages
      .listModelTemplates()
      .then((rows) => {
        if (cancelled) return;
        const summaries = rows.filter((row): row is VehicleExteriorModelTemplateSummary => {
          return 'modelKey' in row && 'views' in row && Array.isArray(row.views);
        });
        setModelTemplates(summaries);
      })
      .catch(() => { if (!cancelled) setModelTemplates([]); });
    return () => { cancelled = true; };
  }, [persisted]);

  // Surface buffered set to parent (only meaningful in buffered mode)
  useEffect(() => {
    if (persisted) return;
    onBufferedChange?.(Object.values(buffered));
  }, [buffered, persisted, onBufferedChange]);

  const filledCount = useMemo(() => {
    return persisted
      ? new Set([...Object.keys(modelImages), ...Object.keys(persistedImages)]).size
      : Object.keys(buffered).length;
  }, [persisted, persistedImages, modelImages, buffered]);

  const triggerPick = (view: VehicleExteriorViewKey) => {
    const input = fileInputRefs.current[view];
    if (input) {
      input.value = '';
      input.click();
    }
  };

  const readAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const onFile = async (view: VehicleExteriorViewKey, file: File | null) => {
    if (!file) return;
    setError(null);
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) {
      setError(`'${file.name}' is not a supported image (PNG, JPG, WEBP, GIF).`);
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setError(`'${file.name}' is too large (${Math.round(file.size / 1024)} KB). Max ${MAX_SOURCE_BYTES / (1024 * 1024)} MB source size per view.`);
      return;
    }
    setBusyView(view);
    try {
      let dataUrl: string;
      try {
        const compressed = await compressExteriorImage(file);
        dataUrl = compressed.dataUrl;
        if (compressed.compressedBytes > MAX_BYTES) {
          throw new Error(`Compressed image is still too large (${Math.round(compressed.compressedBytes / 1024)} KB).`);
        }
      } catch (compressionError) {
        // Keep the upload functional on browsers/files that cannot be decoded by canvas.
        // The backend still enforces the canonical 5 MB cap.
        if (file.size > MAX_BYTES) throw compressionError;
        dataUrl = await readAsDataUrl(file);
      }
      if (persisted && vehicleId) {
        if (uploadTarget === 'model') {
          if (!vehicleMake?.trim() || !vehicleModel?.trim()) {
            throw new Error('Vehicle make/model is required to save a reusable model template.');
          }
          const saved = await api.vehicles.exteriorImages.upsertModelTemplate(view, {
            make: vehicleMake,
            model: vehicleModel,
            imageData: dataUrl,
            caption: null,
            sourceVehicleId: vehicleId,
          });
          setModelImages((prev) => ({ ...prev, [view]: saved }));
          setModelKey(saved.modelKey);
          setModelTemplates((prev) => {
            const existing = prev.find((item) => item.modelKey === saved.modelKey);
            if (!existing) {
              return [...prev, {
                modelKey: saved.modelKey,
                make: saved.make,
                model: saved.model,
                views: [saved.view],
                count: 1,
                updatedAt: saved.updatedAt,
              }];
            }
            return prev.map((item) => item.modelKey === saved.modelKey
              ? {
                  ...item,
                  views: item.views.includes(saved.view) ? item.views : [...item.views, saved.view],
                  count: item.views.includes(saved.view) ? item.count : item.count + 1,
                  updatedAt: saved.updatedAt,
                }
              : item);
          });
        } else {
          const saved = await api.vehicles.exteriorImages.upsert(vehicleId, view, {
            imageData: dataUrl,
            caption: null,
          });
          setPersistedImages((prev) => ({ ...prev, [view]: saved }));
        }
      } else {
        setBuffered((prev) => ({
          ...prev,
          [view]: { view, imageData: dataUrl, caption: null },
        }));
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Upload failed.';
      setError(message);
    } finally {
      setBusyView(null);
    }
  };

  const removeImage = async (view: VehicleExteriorViewKey) => {
    setError(null);
    setBusyView(view);
    try {
      if (persisted && vehicleId) {
        await api.vehicles.exteriorImages.delete(vehicleId, view);
        setPersistedImages((prev) => {
          const next = { ...prev };
          delete next[view];
          return next;
        });
      } else {
        setBuffered((prev) => {
          const next = { ...prev };
          delete next[view];
          return next;
        });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Delete failed.';
      setError(message);
    } finally {
      setBusyView(null);
    }
  };

  const saveVehicleImageAsModel = async (view: VehicleExteriorViewKey) => {
    if (!persisted || !vehicleId) return;
    setError(null);
    setBusyView(view);
    try {
      const saved = await api.vehicles.exteriorImages.saveAsModelTemplate(vehicleId, view);
      setModelImages((prev) => ({ ...prev, [view]: saved }));
      setModelKey(saved.modelKey);
      setModelTemplates((prev) => {
        const existing = prev.find((item) => item.modelKey === saved.modelKey);
        if (!existing) {
          return [...prev, {
            modelKey: saved.modelKey,
            make: saved.make,
            model: saved.model,
            views: [saved.view],
            count: 1,
            updatedAt: saved.updatedAt,
          }];
        }
        return prev.map((item) => item.modelKey === saved.modelKey
          ? {
              ...item,
              views: item.views.includes(saved.view) ? item.views : [...item.views, saved.view],
              count: item.views.includes(saved.view) ? item.count : item.count + 1,
              updatedAt: saved.updatedAt,
            }
          : item);
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Saving model template failed.';
      setError(message);
    } finally {
      setBusyView(null);
    }
  };

  const applyModelTemplate = async (view: VehicleExteriorViewKey, selectedModelKey: string) => {
    if (!persisted || !vehicleId || !selectedModelKey) return;
    setError(null);
    setBusyView(view);
    try {
      const saved = await api.vehicles.exteriorImages.applyModelTemplate(vehicleId, view, {
        modelKey: selectedModelKey,
      });
      setPersistedImages((prev) => ({ ...prev, [view]: saved }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Applying model template failed.';
      setError(message);
    } finally {
      setBusyView(null);
    }
  };

  const cardClass = `rounded-xl border ${
    isDarkMode ? 'bg-card/40 border-neutral-700' : 'bg-gray-50/60 border-gray-200'
  }`;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
            {title}
          </p>
          <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
            {subtitle} Images are compressed before upload.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {canUseModelTemplates && (
            <div className={`inline-flex rounded-full p-0.5 border ${
              isDarkMode ? 'bg-neutral-900/60 border-neutral-700' : 'bg-white border-gray-200'
            }`}>
              {(['vehicle', 'model'] as UploadTarget[]).map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setUploadTarget(target)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize transition-colors ${
                    uploadTarget === target
                      ? 'sq-tone-info'
                      : (isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800')
                  }`}
                >
                  {target}
                </button>
              ))}
            </div>
          )}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            filledCount === 5
              ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-300' : 'bg-emerald-50 text-emerald-700')
              : filledCount > 0
                ? (isDarkMode ? 'bg-amber-500/15 text-amber-300' : 'bg-amber-50 text-amber-700')
                : (isDarkMode ? 'bg-neutral-700/60 text-gray-400' : 'bg-muted text-muted-foreground')
          }`}>
            <Camera className="w-3 h-3" /> {filledCount}/5
          </span>
        </div>
      </div>

      {persisted && (
        <p className={`text-[10px] leading-tight ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
          Vehicle uploads override the selected vehicle only. Model uploads are reusable for every vehicle with the same model
          {modelKey ? ` (${modelKey})` : ''}; any library template can also be copied into this vehicle.
        </p>
      )}

      {error && (
        <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-[11px] ${
          isDarkMode ? 'bg-red-900/20 border border-red-800/30 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {VIEWS.map((v) => {
          const persistedImg = persistedImages[v.key];
          const modelImg = modelImages[v.key];
          const bufferedImg = buffered[v.key];
          const dataUrl = persistedImg?.imageData ?? bufferedImg?.imageData ?? modelImg?.imageData ?? null;
          const sourceLabel = persistedImg || bufferedImg
            ? 'Vehicle'
            : modelImg
              ? 'Model'
              : null;
          const selectableTemplates = modelTemplates.filter((template) => template.views.includes(v.key));
          const isBusy = busyView === v.key;
          return (
            <div key={v.key} className={`${cardClass} p-2 flex flex-col gap-2`}>
              <div className="flex items-center justify-between">
                <p className={`text-[11px] font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{v.label}</p>
                {(persistedImg || bufferedImg) && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => removeImage(v.key)}
                    title="Remove photo"
                    className={`p-1 rounded-md transition-colors ${
                      isDarkMode ? 'text-gray-500 hover:text-red-400 hover:bg-red-500/10' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                    } disabled:opacity-50`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={isBusy || (loading && persisted)}
                onClick={() => triggerPick(v.key)}
                className={`relative w-full aspect-[4/3] rounded-lg overflow-hidden border transition-all flex items-center justify-center ${
                  dataUrl
                    ? (isDarkMode ? 'border-neutral-700' : 'border-gray-200')
                    : `border-dashed ${isDarkMode ? 'border-neutral-700 hover:border-brand/50 bg-neutral-900/40' : 'border-gray-300 hover:border-brand bg-white'}`
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {dataUrl ? (
                  <>
                    <img
                      src={dataUrl}
                      alt={`${v.label} view`}
                      className="absolute inset-0 w-full h-full object-cover"
                      draggable={false}
                    />
                    {isBusy && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      </span>
                    )}
                    {sourceLabel && (
                      <span className={`absolute top-1 left-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                        sourceLabel === 'Model'
                          ? 'bg-brand text-brand-foreground'
                          : 'bg-emerald-500/80 text-white'
                      }`}>
                        {sourceLabel}
                      </span>
                    )}
                    <span className="absolute bottom-1 right-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/55 text-white text-[10px] font-semibold backdrop-blur-sm">
                      <Pencil className="w-2.5 h-2.5" /> Replace
                    </span>
                  </>
                ) : (
                  <div className={`flex flex-col items-center gap-1 ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
                    {isBusy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider">Upload</span>
                      </>
                    )}
                  </div>
                )}
              </button>
              <p className={`text-[10px] leading-tight ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
                {v.hint}
              </p>
              {persisted && (
                <div className="space-y-1">
                  {persistedImg && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => saveVehicleImageAsModel(v.key)}
                      className={`w-full px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                        isDarkMode
                          ? 'bg-brand-soft text-brand hover:bg-brand-soft/80'
                          : 'bg-status-info-soft text-status-info hover:bg-status-info-soft'
                      } disabled:opacity-50`}
                    >
                      Save as model template
                    </button>
                  )}
                  {selectableTemplates.length > 0 && (
                    <select
                      value=""
                      disabled={isBusy}
                      onChange={(e) => {
                        void applyModelTemplate(v.key, e.target.value);
                        e.currentTarget.value = '';
                      }}
                      className={`w-full rounded-lg border px-2 py-1 text-[10px] font-semibold outline-none ${
                        isDarkMode
                          ? 'bg-neutral-900 border-neutral-700 text-gray-300'
                          : 'bg-white border-gray-200 text-gray-600'
                      } disabled:opacity-50`}
                    >
                      <option value="">Copy from model library</option>
                      {selectableTemplates.map((template) => (
                        <option key={`${template.modelKey}-${v.key}`} value={template.modelKey}>
                          {template.make} {template.model} ({template.count}/5)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              <input
                ref={(el) => { fileInputRefs.current[v.key] = el; }}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => onFile(v.key, e.target.files?.[0] ?? null)}
              />
            </div>
          );
        })}
      </div>

      {!persisted && (
        <p className={`text-[10px] flex items-center gap-1 ${isDarkMode ? 'text-amber-400/80' : 'text-amber-600'}`}>
          <Upload className="w-3 h-3" />
          Photos will be uploaded after the vehicle is registered.
        </p>
      )}
    </div>
  );
}

/**
 * V4.7.50 — Helper for buffered mode: after the host form persists the
 * vehicle and gets a real `vehicleId`, push every buffered exterior image
 * to the backend in parallel. Errors are collected per view and returned
 * so the host can decide how loud to fail (we do best-effort here so the
 * registration itself doesn't get blocked by a single failed upload).
 */
export async function flushBufferedExteriorImages(
  vehicleId: string,
  buffered: ExteriorImageBufferEntry[],
): Promise<{ uploaded: number; failed: { view: VehicleExteriorViewKey; error: string }[] }> {
  if (!vehicleId || !buffered.length) {
    return { uploaded: 0, failed: [] };
  }
  const results = await Promise.allSettled(
    buffered.map((b) =>
      api.vehicles.exteriorImages.upsert(vehicleId, b.view, {
        imageData: b.imageData,
        caption: b.caption ?? null,
      }),
    ),
  );
  const failed: { view: VehicleExteriorViewKey; error: string }[] = [];
  let uploaded = 0;
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled') uploaded += 1;
    else {
      const message = r.reason instanceof Error ? r.reason.message : 'Upload failed.';
      failed.push({ view: buffered[idx].view, error: message });
    }
  });
  return { uploaded, failed };
}
