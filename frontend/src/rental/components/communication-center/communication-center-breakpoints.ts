/** Communication Center responsive contract (matches Tailwind lg/xl + matchMedia in shell). */
export const COMMUNICATION_MOBILE_MAX_WIDTH_PX = 1023;
export const COMMUNICATION_TABLET_MIN_WIDTH_PX = 1024;
export const COMMUNICATION_TABLET_MAX_WIDTH_PX = 1279;
export const COMMUNICATION_DESKTOP_MIN_WIDTH_PX = 1280;

/** Playwright validation widths (see architecture doc). */
export const COMMUNICATION_TEST_VIEWPORT = {
  mobile: { width: 390, height: 844 },
  mobileCompact: { width: 768, height: 1024 },
  tablet: { width: 1024, height: 768 },
  tabletWide: { width: 1100, height: 900 },
  desktop: { width: 1440, height: 900 },
} as const;

export function communicationMatchMedia(width: number) {
  return {
    isMobile: width <= COMMUNICATION_MOBILE_MAX_WIDTH_PX,
    isTablet:
      width >= COMMUNICATION_TABLET_MIN_WIDTH_PX &&
      width <= COMMUNICATION_TABLET_MAX_WIDTH_PX,
    isDesktop: width >= COMMUNICATION_DESKTOP_MIN_WIDTH_PX,
  };
}
