/** Tasks / work orders surface tokens. */
import { rs } from '../../lib/rental-surface-ui';

export const tasksUi = {
  card: rs.cardMd,
  workItem: rs.cardInteractive,
  drawerSection: rs.panel,
} as const;
