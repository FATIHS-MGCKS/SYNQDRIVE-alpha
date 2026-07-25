const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

export function focusFirstElement(root: HTMLElement): void {
  const [first] = getFocusableElements(root);
  first?.focus();
}

export function trapTabKey(event: KeyboardEvent, root: HTMLElement): void {
  if (event.key !== 'Tab') return;
  const focusable = getFocusableElements(root);
  if (focusable.length === 0) return;

  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  const active = document.activeElement as HTMLElement | null;

  if (event.shiftKey) {
    if (active === first || !root.contains(active)) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last) {
    event.preventDefault();
    first.focus();
  }
}

export function operatorFieldDescribedBy(
  ...ids: Array<string | null | undefined>
): string | undefined {
  const value = ids.filter(Boolean).join(' ');
  return value || undefined;
}

export const OPERATOR_MAIN_ID = 'operator-main-content';
export const OPERATOR_SKIP_LINK_ID = 'operator-skip-link';
