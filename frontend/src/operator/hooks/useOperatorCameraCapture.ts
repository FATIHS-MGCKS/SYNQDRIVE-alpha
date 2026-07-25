import { useMemo } from 'react';
import { useOperatorDeviceCapabilities } from './useOperatorDeviceCapabilities';
import type { OperatorCameraCaptureCapabilities } from '../lib/operatorDeviceCapabilities';

export function useOperatorCameraCapture(): OperatorCameraCaptureCapabilities {
  const caps = useOperatorDeviceCapabilities();
  return useMemo(
    () => ({
      cameraCaptureLikely: caps.cameraCaptureLikely,
      fileUploadFallback: caps.fileUploadFallback,
      hint: caps.cameraCaptureLikely
        ? null
        : 'Kamera nicht verfügbar — bitte Galerie oder Datei-Upload nutzen.',
    }),
    [caps.cameraCaptureLikely, caps.fileUploadFallback],
  );
}
