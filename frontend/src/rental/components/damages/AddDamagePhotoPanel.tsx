import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import { validateDamageImageFile } from '../../lib/damage-image.utils';

interface AddDamagePhotoPanelProps {
  busy?: boolean;
  onUpload: (file: File, caption?: string) => Promise<void>;
}

export function AddDamagePhotoPanel({ busy, onUpload }: AddDamagePhotoPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePick = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const validationError = validateDamageImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);
    try {
      await onUpload(pendingFile, caption.trim() || undefined);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPendingFile(null);
      setCaption('');
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPendingFile(null);
    setCaption('');
    setError(null);
  };

  return (
    <div className="rounded-lg border border-border/70 bg-muted/15 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-foreground">Add evidence photo</p>
        <label className="sq-press text-[11px] font-semibold inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-border/70 cursor-pointer">
          <Icon name="camera" className="w-3.5 h-3.5" />
          Choose file
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={busy || uploading}
            onChange={(e) => {
              handlePick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      {previewUrl && pendingFile && (
        <div className="space-y-2">
          <img src={previewUrl} alt="Upload preview" className="w-full max-h-40 object-cover rounded-lg border border-border/70" />
          <p className="text-[10px] text-muted-foreground truncate">{pendingFile.name}</p>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[12px]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || uploading}
              onClick={() => void handleUpload()}
              className="sq-cta px-3 py-1.5 rounded-lg text-[11px] font-semibold disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload photo'}
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={handleClear}
              className="sq-press px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {!previewUrl && (
        <p className="text-[10px] text-muted-foreground">JPG, PNG, WebP or GIF · max 6 MB</p>
      )}
    </div>
  );
}
