import { api } from '../../lib/api';
import { isApiHttpError } from '../../lib/httpError';
import { deleteUploadBlob, getUploadBlob, putUploadBlob } from './operatorUploadBlobStore';
import {
  createClientUploadId,
  hasBlockingUploads,
  mapServerUploadStatus,
  NON_RETRYABLE_ERROR_CODES,
  OPERATOR_UPLOAD_MAX_RETRIES,
  OPERATOR_UPLOAD_RETRY_BASE_MS,
  type OperatorUploadContext,
  type OperatorUploadEnqueueInput,
  type OperatorUploadQueueItem,
} from './operatorUploadQueue.types';
import {
  redactOperatorUploadErrorMessage,
  sanitizeOperatorUploadClientFileName,
  validateOperatorUploadClientFile,
} from './operatorUploadSanitize';

type QueueListener = () => void;

export class OperatorUploadQueue {
  private items = new Map<string, OperatorUploadQueueItem>();
  private context: OperatorUploadContext | null = null;
  private listeners = new Set<QueueListener>();
  private processing = false;

  setContext(context: OperatorUploadContext | null): void {
    this.context = context;
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getItems(): OperatorUploadQueueItem[] {
    return Array.from(this.items.values());
  }

  hasBlockingUploads(): boolean {
    return hasBlockingUploads(this.getItems());
  }

  async enqueue(input: OperatorUploadEnqueueInput): Promise<OperatorUploadQueueItem> {
    if (!this.context) throw new Error('Upload context not set');
    const clientValidation = validateOperatorUploadClientFile({
      size: input.file.size,
      type: input.mimeType,
    });
    if (clientValidation) {
      throw new Error(clientValidation);
    }
    const safeFileName = sanitizeOperatorUploadClientFileName(input.fileName);
    const clientUploadId = input.clientUploadId ?? createClientUploadId(input.kind.toLowerCase());
    const existing = this.items.get(clientUploadId);
    if (existing && (existing.status === 'uploaded' || existing.status === 'processing')) {
      return existing;
    }

    const blobKey = `blob:${clientUploadId}`;
    await putUploadBlob(blobKey, input.file);

    const item: OperatorUploadQueueItem = {
      clientUploadId,
      kind: input.kind,
      status: 'pending',
      fileName: safeFileName,
      mimeType: input.mimeType,
      required: input.required ?? false,
      progressPercent: 0,
      retryable: true,
      attemptCount: 0,
      maxAttempts: OPERATOR_UPLOAD_MAX_RETRIES,
      errorMessage: null,
      targetRefType: null,
      targetRefId: null,
      blobKey,
      abortController: null,
    };
    this.items.set(clientUploadId, item);
    this.emit();

    await api.operatorUploads.register(this.context.orgId, {
      clientUploadId,
      kind: input.kind,
      bookingId: this.context.bookingId,
      vehicleId: this.context.vehicleId,
      handoverSessionId: this.context.handoverSessionId ?? null,
      handoverKind: this.context.handoverKind ?? null,
      fileName: safeFileName,
      mimeType: input.mimeType,
      requiredForComplete: input.required ?? false,
    });

    void this.processQueue();
    return item;
  }

  async flush(): Promise<void> {
    await this.processQueue(true);
  }

  async cancel(clientUploadId: string): Promise<void> {
    const item = this.items.get(clientUploadId);
    if (!item) return;
    item.abortController?.abort();
    if (this.context) {
      try {
        await api.operatorUploads.cancel(this.context.orgId, clientUploadId);
      } catch {
        /* best effort */
      }
    }
    if (item.blobKey) await deleteUploadBlob(item.blobKey);
    item.status = 'cancelled';
    item.progressPercent = 0;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private patchItem(clientUploadId: string, patch: Partial<OperatorUploadQueueItem>): void {
    const item = this.items.get(clientUploadId);
    if (!item) return;
    Object.assign(item, patch);
    this.emit();
  }

  private async processQueue(waitUntilEmpty = false): Promise<void> {
    if (this.processing) {
      if (waitUntilEmpty) {
        await new Promise<void>((resolve) => {
          const unsub = this.subscribe(() => {
            if (!this.processing && !this.getItems().some((i) => i.status === 'pending' || i.status === 'uploading')) {
              unsub();
              resolve();
            }
          });
        });
      }
      return;
    }
    this.processing = true;
    try {
      const pending = this.getItems().filter((i) => i.status === 'pending' || i.status === 'failed');
      for (const item of pending) {
        if (!item.retryable || item.attemptCount >= item.maxAttempts) continue;
        await this.uploadOne(item);
      }
    } finally {
      this.processing = false;
      this.emit();
    }
  }

  private async uploadOne(item: OperatorUploadQueueItem): Promise<void> {
    if (!this.context || !item.blobKey) return;
    item.abortController?.abort();
    const controller = new AbortController();
    item.abortController = controller;
    this.patchItem(item.clientUploadId, {
      status: 'uploading',
      progressPercent: 5,
      errorMessage: null,
    });

    const blob = await getUploadBlob(item.blobKey);
    if (!blob) {
      this.patchItem(item.clientUploadId, {
        status: 'failed',
        errorMessage: 'Lokale Datei nicht mehr verfügbar',
        retryable: false,
      });
      return;
    }

    let attempt = 0;
    while (attempt < OPERATOR_UPLOAD_MAX_RETRIES) {
      if (controller.signal.aborted) return;
      attempt += 1;
      try {
        this.patchItem(item.clientUploadId, {
          attemptCount: attempt,
          progressPercent: Math.min(90, 10 + attempt * 15),
        });
        const file = new File([blob], item.fileName, { type: item.mimeType });
        const result = await api.operatorUploads.uploadBinary(
          this.context.orgId,
          item.clientUploadId,
          file,
          { signal: controller.signal },
        );
        const status = mapServerUploadStatus(result.status);
        this.patchItem(item.clientUploadId, {
          status,
          progressPercent: 100,
          targetRefType: result.targetRefType,
          targetRefId: result.targetRefId,
          errorMessage: null,
        });
        if (status === 'uploaded' || status === 'processing') {
          await deleteUploadBlob(item.blobKey);
        }
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const errorCode = isApiHttpError(err) ? err.body.code : undefined;
        const retryable = errorCode ? !NON_RETRYABLE_ERROR_CODES.has(errorCode) : true;
        const message = redactOperatorUploadErrorMessage(
          err instanceof Error ? err.message : 'Upload fehlgeschlagen',
        );
        if (!retryable || attempt >= OPERATOR_UPLOAD_MAX_RETRIES) {
          this.patchItem(item.clientUploadId, {
            status: 'failed',
            retryable,
            errorMessage: message,
          });
          return;
        }
        const delay = OPERATOR_UPLOAD_RETRY_BASE_MS * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}

export const operatorUploadQueue = new OperatorUploadQueue();
