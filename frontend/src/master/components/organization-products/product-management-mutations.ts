import { classifyMasterProductApiError } from '../../organizations/product-management.policy';

/** Applies admin product API result; awaits refresh on success. */
export async function applyMasterProductApiResult(
  status: number,
  errorMessage: string | undefined,
  onSuccess: () => Promise<void>,
  setActionError: (msg: string) => void,
): Promise<boolean> {
  if (status >= 200 && status < 300) {
    try {
      await onSuccess();
      return true;
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Aktualisierung nach erfolgreicher Aktion fehlgeschlagen';
      setActionError(msg);
      throw e;
    }
  }
  setActionError(classifyMasterProductApiError(status, errorMessage ?? ''));
  return false;
}