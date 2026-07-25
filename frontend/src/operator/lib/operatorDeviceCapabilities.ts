/**
 * UX-only device/viewport capabilities for the Operator App.
 * Not a security boundary — auth/roles remain in OperatorAccessGuard.
 */

export const OPERATOR_VIEWPORT_BREAKPOINTS = [320, 375, 390, 430, 768, 1024, 1280] as const;

export const OPERATOR_LAYOUT_BREAKPOINTS = {
  tabletMin: 768,
  wideMin: 1280,
  desktopFallbackShellMax: 430,
} as const;

export type OperatorLayoutProfile = 'compact' | 'tablet' | 'wide';
export type OperatorExperienceMode = 'field' | 'desktop-fallback';

export interface OperatorMediaQuerySignals {
  coarsePointer: boolean;
  finePointer: boolean;
  hoverAvailable: boolean;
  anyPointer: boolean;
  anyHover: boolean;
}

export interface OperatorDeviceCapabilityInput {
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio?: number;
  touchAvailable?: boolean;
  media?: Partial<OperatorMediaQuerySignals>;
  cameraApiAvailable?: boolean;
  secureContext?: boolean;
  forceFieldExperience?: boolean;
}

export interface OperatorDeviceCapabilities {
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  layoutProfile: OperatorLayoutProfile;
  experienceMode: OperatorExperienceMode;
  touchAvailable: boolean;
  coarsePointer: boolean;
  finePointer: boolean;
  hoverAvailable: boolean;
  cameraCaptureLikely: boolean;
  fileUploadFallback: boolean;
  supportsSplitLayout: boolean;
  showDesktopFallbackBanner: boolean;
  preferCompactShell: boolean;
}

export interface OperatorCameraCaptureCapabilities {
  cameraCaptureLikely: boolean;
  fileUploadFallback: boolean;
  hint: string | null;
}

export function resolveOperatorLayoutProfile(width: number): OperatorLayoutProfile {
  if (width < OPERATOR_LAYOUT_BREAKPOINTS.tabletMin) return 'compact';
  if (width < OPERATOR_LAYOUT_BREAKPOINTS.wideMin) return 'tablet';
  return 'wide';
}

export function resolveOperatorExperienceMode(input: {
  viewportWidth: number;
  touchAvailable: boolean;
  coarsePointer: boolean;
  finePointer: boolean;
  forceFieldExperience?: boolean;
}): OperatorExperienceMode {
  if (input.forceFieldExperience) return 'field';

  if (input.touchAvailable || input.coarsePointer) return 'field';
  if (input.viewportWidth < OPERATOR_LAYOUT_BREAKPOINTS.wideMin) return 'field';

  // Wide viewport with mouse-primary input → compact desktop fallback shell.
  if (input.finePointer && !input.touchAvailable && input.viewportWidth >= OPERATOR_LAYOUT_BREAKPOINTS.wideMin) {
    return 'desktop-fallback';
  }

  return 'field';
}

export function evaluateCameraCaptureCapabilities(input?: {
  cameraApiAvailable?: boolean;
  secureContext?: boolean;
}): OperatorCameraCaptureCapabilities {
  const secureContext = input?.secureContext ?? true;
  const cameraApiAvailable = input?.cameraApiAvailable ?? false;
  const cameraCaptureLikely = secureContext && cameraApiAvailable;

  return {
    cameraCaptureLikely,
    fileUploadFallback: true,
    hint: cameraCaptureLikely
      ? null
      : 'Kamera nicht verfügbar — bitte Galerie oder Datei-Upload nutzen.',
  };
}

export function evaluateOperatorDeviceCapabilities(
  input: OperatorDeviceCapabilityInput,
): OperatorDeviceCapabilities {
  const media: OperatorMediaQuerySignals = {
    coarsePointer: input.media?.coarsePointer ?? false,
    finePointer: input.media?.finePointer ?? true,
    hoverAvailable: input.media?.hoverAvailable ?? true,
    anyPointer: input.media?.anyPointer ?? true,
    anyHover: input.media?.anyHover ?? true,
  };

  const touchAvailable =
    input.touchAvailable ??
    (media.coarsePointer || (media.anyPointer && !media.finePointer));
  const layoutProfile = resolveOperatorLayoutProfile(input.viewportWidth);
  const experienceMode = resolveOperatorExperienceMode({
    viewportWidth: input.viewportWidth,
    touchAvailable,
    coarsePointer: media.coarsePointer,
    finePointer: media.finePointer,
    forceFieldExperience: input.forceFieldExperience,
  });

  const camera = evaluateCameraCaptureCapabilities({
    cameraApiAvailable: input.cameraApiAvailable,
    secureContext: input.secureContext,
  });

  return {
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    devicePixelRatio: input.devicePixelRatio ?? 1,
    layoutProfile,
    experienceMode,
    touchAvailable,
    coarsePointer: media.coarsePointer,
    finePointer: media.finePointer,
    hoverAvailable: media.hoverAvailable,
    cameraCaptureLikely: camera.cameraCaptureLikely,
    fileUploadFallback: camera.fileUploadFallback,
    supportsSplitLayout: layoutProfile !== 'compact',
    showDesktopFallbackBanner: experienceMode === 'desktop-fallback',
    preferCompactShell: experienceMode === 'desktop-fallback',
  };
}

export function readOperatorMediaQuerySignals(
  matchMedia: (query: string) => { matches: boolean },
): OperatorMediaQuerySignals {
  return {
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    finePointer: matchMedia('(pointer: fine)').matches,
    hoverAvailable: matchMedia('(hover: hover)').matches,
    anyPointer: matchMedia('(any-pointer: coarse)').matches || matchMedia('(any-pointer: fine)').matches,
    anyHover: matchMedia('(any-hover: hover)').matches,
  };
}

export function readOperatorDeviceCapabilitiesFromWindow(
  win: Window & typeof globalThis,
): OperatorDeviceCapabilities {
  const viewportWidth = win.innerWidth;
  const viewportHeight = win.innerHeight;
  const media = readOperatorMediaQuerySignals((q) => win.matchMedia(q));
  const touchAvailable =
    'ontouchstart' in win ||
    win.navigator.maxTouchPoints > 0 ||
    media.coarsePointer ||
    win.matchMedia('(any-pointer: coarse)').matches;

  return evaluateOperatorDeviceCapabilities({
    viewportWidth,
    viewportHeight,
    devicePixelRatio: win.devicePixelRatio,
    touchAvailable,
    media,
    cameraApiAvailable: Boolean(win.navigator.mediaDevices?.getUserMedia),
    secureContext: win.isSecureContext,
    forceFieldExperience: import.meta.env.VITE_ALLOW_OPERATOR_DESKTOP === 'true',
  });
}
