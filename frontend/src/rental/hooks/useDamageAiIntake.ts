import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import type { VehicleExteriorViewKey } from '../../lib/api';
import { readFileAsDataUrl } from '../lib/damage-image.utils';
import type { CreateVehicleDamageInput } from '../lib/damage.types';
import {
  isDamageAiIntakeEnabled,
  suggestionToCreateInput,
  toEditableSuggestion,
  type AnalyzeExteriorPhotosResponse,
  type EditableAiDamageSuggestion,
} from '../lib/damage-ai-intake';

export type DamageAiIntakeStep = 'upload' | 'analyzing' | 'review' | 'confirming' | 'done';

export interface ViewUploadSlot {
  view: VehicleExteriorViewKey;
  files: File[];
  previews: string[];
}

const EXTERIOR_VIEWS: VehicleExteriorViewKey[] = ['FRONT', 'LEFT', 'RIGHT', 'REAR', 'ROOF'];

function emptySlots(): ViewUploadSlot[] {
  return EXTERIOR_VIEWS.map((view) => ({ view, files: [], previews: [] }));
}

interface UseDamageAiIntakeOptions {
  vehicleId: string | undefined;
  onConfirmed?: () => void;
}

export function useDamageAiIntake({ vehicleId, onConfirmed }: UseDamageAiIntakeOptions) {
  const enabled = isDamageAiIntakeEnabled();
  const [step, setStep] = useState<DamageAiIntakeStep>('upload');
  const [slots, setSlots] = useState<ViewUploadSlot[]>(emptySlots);
  const [suggestions, setSuggestions] = useState<EditableAiDamageSuggestion[]>([]);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeReviewView, setActiveReviewView] = useState<VehicleExteriorViewKey>('FRONT');

  const reset = useCallback(() => {
    setStep('upload');
    setSlots(emptySlots());
    setSuggestions([]);
    setAnalysisWarning(null);
    setError(null);
    setActiveReviewView('FRONT');
  }, []);

  const addFiles = useCallback((view: VehicleExteriorViewKey, files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.view !== view) return slot;
        const nextFiles = [...slot.files, ...list].slice(0, 4);
        const nextPreviews = nextFiles.map((f) => URL.createObjectURL(f));
        slot.previews.forEach((u) => URL.revokeObjectURL(u));
        return { ...slot, files: nextFiles, previews: nextPreviews };
      }),
    );
  }, []);

  const removeFile = useCallback((view: VehicleExteriorViewKey, index: number) => {
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.view !== view) return slot;
        const nextFiles = slot.files.filter((_, i) => i !== index);
        URL.revokeObjectURL(slot.previews[index]);
        const nextPreviews = slot.previews.filter((_, i) => i !== index);
        return { ...slot, files: nextFiles, previews: nextPreviews };
      }),
    );
  }, []);

  const analyze = useCallback(async () => {
    if (!vehicleId || !enabled) return;
    const payloads: Array<{ view: VehicleExteriorViewKey; imageData: string; fileName: string }> =
      [];
    for (const slot of slots) {
      for (const file of slot.files) {
        payloads.push({
          view: slot.view,
          imageData: await readFileAsDataUrl(file),
          fileName: file.name,
        });
      }
    }
    if (!payloads.length) {
      setError('Add at least one exterior photo before analyzing.');
      return;
    }

    setStep('analyzing');
    setError(null);
    try {
      const response = await api.vehicleIntelligence.analyzeExteriorPhotosForDamage(
        vehicleId,
        payloads,
      );
      const typed = response as AnalyzeExteriorPhotosResponse;
      setAnalysisWarning(typed.warning ?? null);
      setSuggestions(typed.suggestions.map(toEditableSuggestion));
      setStep('review');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed.';
      setError(message);
      setStep('upload');
      toast.error('Exterior analysis unavailable', { description: message });
    }
  }, [enabled, slots, vehicleId]);

  const updateSuggestion = useCallback(
    (id: string, patch: Partial<EditableAiDamageSuggestion>) => {
      setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    },
    [],
  );

  const confirmAccepted = useCallback(async () => {
    if (!vehicleId) return;
    const accepted = suggestions.filter((s) => s.accepted && !s.rejected);
    if (!accepted.length) {
      setError('Select at least one suggestion to confirm.');
      return;
    }

    setStep('confirming');
    setError(null);
    try {
      for (const suggestion of accepted) {
        const input: CreateVehicleDamageInput = suggestionToCreateInput(suggestion);
        await api.vehicleIntelligence.createVehicleDamage(vehicleId, input);
      }
      toast.success('Damages created', {
        description: `${accepted.length} confirmed suggestion(s) saved.`,
      });
      setStep('done');
      onConfirmed?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save damages.';
      setError(message);
      setStep('review');
      toast.error('Confirmation failed', { description: message });
    }
  }, [onConfirmed, suggestions, vehicleId]);

  const totalFiles = slots.reduce((n, s) => n + s.files.length, 0);

  return {
    enabled,
    step,
    slots,
    suggestions,
    analysisWarning,
    error,
    activeReviewView,
    setActiveReviewView,
    totalFiles,
    addFiles,
    removeFile,
    analyze,
    updateSuggestion,
    confirmAccepted,
    reset,
  };
}
