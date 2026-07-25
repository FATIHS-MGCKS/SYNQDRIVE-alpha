import { useOperatorDeviceCapabilities } from './useOperatorDeviceCapabilities';

/**
 * UX-only helper — the Operator App is always reachable.
 * Kept for backward compatibility with older call sites.
 */
export function useIsOperatorDevice(): boolean {
  useOperatorDeviceCapabilities();
  return true;
}
