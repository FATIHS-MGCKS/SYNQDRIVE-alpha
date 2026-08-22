/** Pixels of remaining scroll before the bottom fade hides. */
export const DASHBOARD_PANEL_SCROLL_FADE_THRESHOLD_PX = 8;

export function shouldShowBottomScrollFade(
  element: HTMLElement,
  threshold = DASHBOARD_PANEL_SCROLL_FADE_THRESHOLD_PX,
): boolean {
  const overflow = element.scrollHeight - element.clientHeight > threshold;
  const atBottom =
    element.scrollTop + element.clientHeight >= element.scrollHeight - threshold;
  return overflow && !atBottom;
}
