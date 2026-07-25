import { describe, expect, it } from 'vitest';
import {
  OPERATOR_VIEWPORT_BREAKPOINTS,
  evaluateCameraCaptureCapabilities,
  evaluateOperatorDeviceCapabilities,
  resolveOperatorExperienceMode,
  resolveOperatorLayoutProfile,
} from './operatorDeviceCapabilities';

describe('operatorDeviceCapabilities', () => {
  describe('resolveOperatorLayoutProfile', () => {
    it.each([
      [320, 'compact'],
      [375, 'compact'],
      [390, 'compact'],
      [430, 'compact'],
      [767, 'compact'],
      [768, 'tablet'],
      [1024, 'tablet'],
      [1279, 'tablet'],
      [1280, 'wide'],
    ] as const)('maps width %ipx to %s', (width, profile) => {
      expect(resolveOperatorLayoutProfile(width)).toBe(profile);
    });

    it('covers all required audit breakpoints', () => {
      for (const width of OPERATOR_VIEWPORT_BREAKPOINTS) {
        expect(resolveOperatorLayoutProfile(width)).toBeDefined();
      }
    });
  });

  describe('resolveOperatorExperienceMode', () => {
    it('keeps iPad/Surface/large touch tablets in field mode', () => {
      expect(
        resolveOperatorExperienceMode({
          viewportWidth: 1366,
          touchAvailable: true,
          coarsePointer: false,
          finePointer: true,
        }),
      ).toBe('field');
    });

    it('keeps vehicle terminals and foldables with touch in field mode', () => {
      expect(
        resolveOperatorExperienceMode({
          viewportWidth: 1920,
          touchAvailable: true,
          coarsePointer: true,
          finePointer: true,
        }),
      ).toBe('field');
    });

    it('uses desktop fallback only for wide mouse-primary desktops', () => {
      expect(
        resolveOperatorExperienceMode({
          viewportWidth: 1440,
          touchAvailable: false,
          coarsePointer: false,
          finePointer: true,
        }),
      ).toBe('desktop-fallback');
    });

    it('does not desktop-fallback narrow or zoomed viewports', () => {
      expect(
        resolveOperatorExperienceMode({
          viewportWidth: 1024,
          touchAvailable: false,
          coarsePointer: false,
          finePointer: true,
        }),
      ).toBe('field');
    });

    it('respects force field override', () => {
      expect(
        resolveOperatorExperienceMode({
          viewportWidth: 1920,
          touchAvailable: false,
          coarsePointer: false,
          finePointer: true,
          forceFieldExperience: true,
        }),
      ).toBe('field');
    });
  });

  describe('evaluateOperatorDeviceCapabilities', () => {
    it('enables split layout from 768px without blocking access', () => {
      const caps = evaluateOperatorDeviceCapabilities({
        viewportWidth: 768,
        viewportHeight: 1024,
        touchAvailable: true,
        media: { coarsePointer: true, finePointer: false, hoverAvailable: false, anyPointer: true, anyHover: false },
        cameraApiAvailable: true,
        secureContext: true,
      });
      expect(caps.supportsSplitLayout).toBe(true);
      expect(caps.experienceMode).toBe('field');
      expect(caps.showDesktopFallbackBanner).toBe(false);
    });

    it('shows desktop fallback banner without denying access', () => {
      const caps = evaluateOperatorDeviceCapabilities({
        viewportWidth: 1280,
        viewportHeight: 800,
        touchAvailable: false,
        media: { coarsePointer: false, finePointer: true, hoverAvailable: true, anyPointer: true, anyHover: true },
        cameraApiAvailable: false,
        secureContext: true,
      });
      expect(caps.experienceMode).toBe('desktop-fallback');
      expect(caps.preferCompactShell).toBe(true);
      expect(caps.showDesktopFallbackBanner).toBe(true);
      expect(caps.fileUploadFallback).toBe(true);
    });

    it('does not treat coarse pointer alone as desktop-only block', () => {
      const caps = evaluateOperatorDeviceCapabilities({
        viewportWidth: 1440,
        viewportHeight: 900,
        touchAvailable: true,
        media: { coarsePointer: true, finePointer: true, hoverAvailable: true, anyPointer: true, anyHover: true },
        cameraApiAvailable: true,
        secureContext: true,
      });
      expect(caps.experienceMode).toBe('field');
      expect(caps.preferCompactShell).toBe(false);
    });
  });

  describe('evaluateCameraCaptureCapabilities', () => {
    it('keeps manual upload fallback when camera API is unavailable', () => {
      const camera = evaluateCameraCaptureCapabilities({
        cameraApiAvailable: false,
        secureContext: true,
      });
      expect(camera.fileUploadFallback).toBe(true);
      expect(camera.cameraCaptureLikely).toBe(false);
      expect(camera.hint).toContain('Galerie');
    });
  });
});
