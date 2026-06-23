import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { prepareDamageImageDataUrl } from './operatorDamageImage.utils';

export interface OperatorDamagePhotoItem {
  id: string;
  previewUrl: string;
  dataUrl: string;
  caption?: string;
}

interface Props {
  photos: OperatorDamagePhotoItem[];
  onPhotosChange: (photos: OperatorDamagePhotoItem[]) => void;
  error?: string | null;
}

const MAX_PHOTOS = 6;

export function OperatorDamagePhotoStep({ photos, onPhotosChange, error }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || photos.length >= MAX_PHOTOS) return;
    setLocalError(null);
    setBusy(true);
    try {
      const next = [...photos];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_PHOTOS) break;
        const dataUrl = await prepareDamageImageDataUrl(file);
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          previewUrl: dataUrl,
          dataUrl,
        });
      }
      onPhotosChange(next);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Foto konnte nicht verarbeitet werden.');
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = (id: string) => {
    onPhotosChange(photos.filter((p) => p.id !== id));
  };

  const displayError = error ?? localError;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Schadenfotos aufnehmen oder aus der Galerie wählen. Mehrere Bilder sind möglich.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || photos.length >= MAX_PHOTOS}
          onClick={() => cameraRef.current?.click()}
          className="sq-press flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]/40 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-8 w-8 animate-spin text-[color:var(--brand)]" />
          ) : (
            <Camera className="h-8 w-8 text-[color:var(--brand)]" />
          )}
          <span className="text-sm font-semibold text-foreground">Kamera</span>
        </button>
        <button
          type="button"
          disabled={busy || photos.length >= MAX_PHOTOS}
          onClick={() => galleryRef.current?.click()}
          className="sq-press flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/70 bg-card/50 disabled:opacity-50"
        >
          <ImagePlus className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Galerie</span>
        </button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((photo) => (
            <div key={photo.id} className="relative overflow-hidden rounded-xl border border-border bg-muted/30">
              <img
                src={photo.previewUrl}
                alt="Schadenfoto"
                className="aspect-[4/3] w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                className="sq-press absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-lg bg-background/90 text-[color:var(--status-critical)] shadow-sm"
                aria-label="Foto entfernen"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {photos.length}/{MAX_PHOTOS} Fotos · Große Bilder werden vor dem Upload komprimiert.
      </p>

      {displayError && (
        <p className="text-xs text-[color:var(--status-critical)]">{displayError}</p>
      )}
    </div>
  );
}
