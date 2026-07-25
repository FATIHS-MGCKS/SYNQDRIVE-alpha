import { useOperatorDeviceCapabilities } from './useOperatorDeviceCapabilities';

/**
 * Split-pane / two-column operator layouts (tablet, landscape, large touch terminals).
 */
export function useOperatorTabletLayout(): boolean {
  const capabilities = useOperatorDeviceCapabilities();
  return capabilities.supportsSplitLayout;
}
