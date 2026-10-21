import type { RecoveryExistingEnergyEvent } from './energy-events-recovery-read.repository';
import type { AuditedFleetSignalProfile } from './energy-events-recovery.constants';

export function inferFleetCapabilitiesFromEvents(
  events: RecoveryExistingEnergyEvent[],
): Pick<
  AuditedFleetSignalProfile,
  'relativeFuel' | 'absoluteFuel' | 'rechargeSoc' | 'powertrain'
> {
  const hasRefuel = events.some((event) => event.kind === 'REFUEL');
  const hasRecharge = events.some((event) => event.kind === 'RECHARGE');
  const relativeFuel =
    events.some((event) => event.fuelDeltaPercent != null) || hasRefuel;
  const absoluteFuel =
    events.some((event) => event.fuelDeltaLiters != null) || hasRefuel;
  const rechargeSoc =
    events.some(
      (event) =>
        event.socDeltaPercent != null || event.energyDeltaKwh != null,
    ) || hasRecharge;

  let powertrain: 'ICE' | 'EV' = 'ICE';
  if (hasRecharge && !hasRefuel) {
    powertrain = 'EV';
  }

  return { relativeFuel, absoluteFuel, rechargeSoc, powertrain };
}

export function resolveQuickModeProfile(
  tokenId: number,
  profiles: AuditedFleetSignalProfile[],
): AuditedFleetSignalProfile | undefined {
  return profiles.find((profile) => profile.tokenId === tokenId);
}
