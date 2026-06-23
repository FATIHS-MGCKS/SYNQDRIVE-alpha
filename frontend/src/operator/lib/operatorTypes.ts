export type OperatorTab = 'today' | 'scan' | 'vehicles' | 'tasks' | 'more';

export const OPERATOR_TABS: OperatorTab[] = ['today', 'scan', 'vehicles', 'tasks', 'more'];

export type OperatorAiUploadContextMode =
  | 'general'
  | 'vehicle'
  | 'booking'
  | 'customer'
  | 'damage'
  | 'tire'
  | 'service';

export type OperatorSheetAction =
  | {
      type: 'ai-upload';
      vehicleId: string;
      vehicleLabel: string;
      bookingId?: string;
      customerId?: string;
      customerName?: string;
      damageId?: string;
      initialDocType?: string;
      contextMode?: OperatorAiUploadContextMode;
      onComplete?: () => void;
    }
  | {
      type: 'tire-measure';
      vehicleId: string;
      vehicleLabel: string;
      bookingId?: string;
      initialOdometerKm?: number;
      prefilledTread?: { fl?: number; fr?: number; rl?: number; rr?: number };
      sourceHint?: 'manual' | 'workshop' | 'ai_confirmed';
      onSuccess?: () => void;
    }
  | {
      type: 'task-create';
      vehicleId?: string;
      vehicleLabel: string;
      bookingId?: string;
      onSuccess?: () => void;
    }
  | {
      type: 'task-detail';
      taskId: string;
      task?: import('../../lib/api').ApiTask;
      focusComment?: boolean;
      onUpdated?: () => void;
    };

export interface OperatorSyncState {
  loading: boolean;
  lastSyncAt: string | null;
  error: boolean;
}
