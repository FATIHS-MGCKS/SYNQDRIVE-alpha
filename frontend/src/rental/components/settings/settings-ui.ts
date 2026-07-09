/** Settings cluster surface tokens — forms, section cards, secondary controls. */
import { rs } from '../../lib/rental-surface-ui';

export const settingsUi = {
  sectionCard: `${rs.cardMd} p-4 shadow-[var(--shadow-1)]`,
  input: rs.inputLg,
  inputSm: rs.input,
  buttonSecondary: rs.buttonSecondary,
  popover: rs.popoverMenu,
} as const;
