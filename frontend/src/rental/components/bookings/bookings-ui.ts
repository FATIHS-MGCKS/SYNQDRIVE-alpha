/** Bookings list / calendar / toolbar surface tokens. */
import { rs } from '../../lib/rental-surface-ui';

export const bookingsUi = {
  panel: rs.card,
  card: rs.cardMd,
  toolbar: 'surface-frosted rounded-xl p-1',
  filterChip: rs.chip,
  filterChipActive: rs.chipActive,
} as const;
