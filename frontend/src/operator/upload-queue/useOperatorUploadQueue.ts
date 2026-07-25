import { useCallback, useEffect, useMemo, useState } from 'react';
import { operatorUploadQueue } from './operatorUploadQueue';
import type { OperatorUploadContext, OperatorUploadEnqueueInput, OperatorUploadQueueItem } from './operatorUploadQueue.types';

export function useOperatorUploadQueue(context: OperatorUploadContext | null) {
  const [items, setItems] = useState<OperatorUploadQueueItem[]>([]);

  useEffect(() => {
    operatorUploadQueue.setContext(context);
    setItems(operatorUploadQueue.getItems());
    return operatorUploadQueue.subscribe(() => {
      setItems([...operatorUploadQueue.getItems()]);
    });
  }, [context]);

  const enqueue = useCallback(
    (input: OperatorUploadEnqueueInput) => operatorUploadQueue.enqueue(input),
    [],
  );

  const flush = useCallback(() => operatorUploadQueue.flush(), []);
  const cancel = useCallback((clientUploadId: string) => operatorUploadQueue.cancel(clientUploadId), []);

  const hasBlockingUploads = useMemo(() => operatorUploadQueue.hasBlockingUploads(), [items]);

  return {
    items,
    enqueue,
    flush,
    cancel,
    hasBlockingUploads,
  };
}
