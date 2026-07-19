import type { OverallConnectivityState } from '../../../lib/api';
import { StatusChip } from '../../../components/patterns';
import {
  overallStateLabel,
  overallStateTone,
  showLiveDot,
  type FleetConnectivityTranslator,
} from './fleet-connectivity.presentation';

export function OverallStateChip({
  state,
  t,
}: {
  state: OverallConnectivityState;
  t: FleetConnectivityTranslator;
}) {
  return (
    <StatusChip tone={overallStateTone(state)} dot={showLiveDot(state)}>
      {overallStateLabel(state, t)}
    </StatusChip>
  );
}
