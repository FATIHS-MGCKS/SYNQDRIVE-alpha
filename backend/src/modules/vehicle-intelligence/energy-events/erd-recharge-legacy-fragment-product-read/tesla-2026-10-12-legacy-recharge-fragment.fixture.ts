import {
  EnergyEventConfidence,
  EnergyEventKind,
  type VehicleEnergyEvent,
} from '@prisma/client';
import type { LegacyFragmentHvPhysicalAnchor } from './erd-recharge-legacy-fragment-physical-episode.policy';

/** Sanitized Tesla Natural Test #1 — legacy DIMO sliding-window fragmentation (2026-10-12). */
export const TESLA_FRAGMENT_FIXTURE_VEHICLE_ID =
  '68868291-5478-42cd-b0c4-cc77b2a78e21';

const TOKEN = '186946';

function buildRow(input: {
  id: string;
  suffixMs: string;
  startIso: string;
  endIso: string;
  durationSeconds: number;
  energyDeltaKwh: number;
  socDeltaPercent: number;
  energyStartKwh: number;
  energyEndKwh: number;
  socStartPercent: number;
  socEndPercent: number;
}): VehicleEnergyEvent {
  const dimoSegmentId = `dimo-recharge-${TOKEN}-${input.suffixMs}`;
  return {
    id: input.id,
    vehicleId: TESLA_FRAGMENT_FIXTURE_VEHICLE_ID,
    kind: EnergyEventKind.RECHARGE,
    detectionMechanism: 'recharge',
    detectionSource: null,
    canonicalChargeSessionId: null,
    dimoSegmentId,
    startTime: new Date(input.startIso),
    endTime: new Date(input.endIso),
    durationSeconds: input.durationSeconds,
    energyDeltaKwh: input.energyDeltaKwh,
    socDeltaPercent: input.socDeltaPercent,
    confidence: EnergyEventConfidence.HIGH,
    odometerStartKm: null,
    odometerEndKm: null,
    startLatitude: 52.1,
    startLongitude: 13.1,
    endLatitude: 52.1,
    endLongitude: 13.1,
    rawDetectionMeta: {
      energyStartKwh: input.energyStartKwh,
      energyEndKwh: input.energyEndKwh,
      socStartPercent: input.socStartPercent,
      socEndPercent: input.socEndPercent,
      coalescedFromCount: 1,
      coalescedFromSegmentIds: [dimoSegmentId],
    },
    createdAt: new Date(input.startIso),
    updatedAt: new Date(input.startIso),
  } as unknown as VehicleEnergyEvent;
}

export function buildTesla20261012HvPhysicalAnchor(): LegacyFragmentHvPhysicalAnchor {
  return {
    dimoSegmentId: `dimo-recharge-${TOKEN}-1791810415314`,
    startAt: new Date('2026-10-12T13:06:55.314Z'),
    endAt: new Date('2026-10-12T15:10:30.313Z'),
    startSocPercent: 89.17638483965014,
    endSocPercent: 99,
    startEnergyKwh: 49.61999889090657,
    endEnergyKwh: 54.23999878764153,
  };
}

export function buildTesla20261012LegacyRechargeFragmentFixture(): VehicleEnergyEvent[] {
  return [
    buildRow({
      id: '420c253b-676a-4ab6-8e89-7528d538a7d8',
      suffixMs: '1791810415314',
      startIso: '2026-10-12T13:06:55.314Z',
      endIso: '2026-10-12T15:10:30.313Z',
      durationSeconds: 7414,
      energyDeltaKwh: 5.259999882429838,
      socDeltaPercent: 10.82361516034986,
      energyStartKwh: 49.61999889090657,
      energyEndKwh: 54.87999877333641,
      socStartPercent: 89.17638483965014,
      socEndPercent: 100,
    }),
    buildRow({
      id: 'f78ceec9-0ace-42d7-b519-781f13dc593b',
      suffixMs: '1791811135313',
      startIso: '2026-10-12T13:18:55.313Z',
      endIso: '2026-10-12T14:02:55.313Z',
      durationSeconds: 2640,
      energyDeltaKwh: 1.879999957978725,
      socDeltaPercent: 4.141038180057393,
      energyStartKwh: 50.1199988797307,
      energyEndKwh: 51.99999883770943,
      socStartPercent: 90.3684786574243,
      socEndPercent: 94.5095168374817,
    }),
    buildRow({
      id: '0f64f9ea-f715-4727-89e5-251e1f884a46',
      suffixMs: '1791812035313',
      startIso: '2026-10-12T13:33:55.313Z',
      endIso: '2026-10-12T14:17:55.313Z',
      durationSeconds: 2639,
      energyDeltaKwh: 1.879999957978725,
      socDeltaPercent: 4.186655731623205,
      energyStartKwh: 50.73999886587262,
      energyEndKwh: 52.61999882385135,
      socStartPercent: 91.70927684441197,
      socEndPercent: 95.89593257603518,
    }),
    buildRow({
      id: '97f2710d-4e17-465e-83ef-682279b42b3d',
      suffixMs: '1791812935313',
      startIso: '2026-10-12T13:48:55.313Z',
      endIso: '2026-10-12T14:32:55.313Z',
      durationSeconds: 2640,
      energyDeltaKwh: 1.879999957978725,
      socDeltaPercent: 4.159498686224211,
      energyStartKwh: 51.4999988488853,
      energyEndKwh: 53.37999880686402,
      socStartPercent: 93.19926873857403,
      socEndPercent: 97.35876742479824,
    }),
    buildRow({
      id: 'c595252a-7067-4491-b872-a4ed15dfe2a6',
      suffixMs: '1791813835313',
      startIso: '2026-10-12T14:03:55.313Z',
      endIso: '2026-10-12T14:47:55.313Z',
      durationSeconds: 2640,
      energyDeltaKwh: 1.879999957978725,
      socDeltaPercent: 4.204798383756668,
      energyStartKwh: 52.11999883502722,
      energyEndKwh: 53.99999879300594,
      socStartPercent: 94.54612005856515,
      socEndPercent: 98.75091844232182,
    }),
    buildRow({
      id: '910d9136-b3d3-4946-a763-6c27114f352d',
      suffixMs: '1791814735313',
      startIso: '2026-10-12T14:18:55.313Z',
      endIso: '2026-10-12T14:51:55.313Z',
      durationSeconds: 1979,
      energyDeltaKwh: 1.479999966919422,
      socDeltaPercent: 2.957493587394652,
      energyStartKwh: 52.7599988207221,
      energyEndKwh: 54.23999878764153,
      socStartPercent: 96.04250641260535,
      socEndPercent: 99,
    }),
    buildRow({
      id: '6122c743-8276-4a3f-82e8-9a99ba1eb644',
      suffixMs: '1791815635313',
      startIso: '2026-10-12T14:33:55.313Z',
      endIso: '2026-10-12T15:10:30.313Z',
      durationSeconds: 2194,
      energyDeltaKwh: 1.379999969154596,
      socDeltaPercent: 2.604548789435071,
      energyStartKwh: 53.49999880418181,
      energyEndKwh: 54.87999877333641,
      socStartPercent: 97.39545121056493,
      socEndPercent: 100,
    }),
    buildRow({
      id: '2f1fbf26-fe19-48b8-8d5a-f622b17a461a',
      suffixMs: '1791816535313',
      startIso: '2026-10-12T14:48:55.313Z',
      endIso: '2026-10-12T15:10:30.313Z',
      durationSeconds: 1294,
      energyDeltaKwh: 0.7599999830126762,
      socDeltaPercent: 1.138868479059525,
      energyStartKwh: 54.11999879032373,
      energyEndKwh: 54.87999877333641,
      socStartPercent: 98.86113152094048,
      socEndPercent: 100,
    }),
  ];
}
