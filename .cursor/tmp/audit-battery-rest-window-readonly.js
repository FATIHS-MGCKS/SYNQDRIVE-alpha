/* READ-ONLY one-off — Prompt 3/8 rest window analysis */
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const DAYS = 30;
const since = new Date(Date.now() - DAYS * 24 * 3600 * 1000);
const REST_60M_MS = 60 * 60_000;
const REST_6H_MS = 6 * REST_60M_MS;
const BATTERY_MAX_SAMPLE_AGE_MS = 5 * 60_000;
const MARKERS = [5, 30, 60, 120, 360, 720].map((m) => m * 60_000); // min offsets in ms

function pct(arr, q) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor(q * (s.length - 1)));
  return s[i];
}
const median = (arr) => pct(arr, 0.5);

function loadEnv() {
  const envPath = '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

async function chQuery(sql) {
  const url = process.env.CLICKHOUSE_URL || 'http://127.0.0.1:8123';
  const user = process.env.CLICKHOUSE_USER || 'default';
  const pass = process.env.CLICKHOUSE_PASSWORD || '';
  const db = process.env.CLICKHOUSE_DATABASE || 'synqdrive';
  const u = new URL(url);
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');
  const res = await fetch(`${u.origin}/?database=${encodeURIComponent(db)}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'text/plain' },
    body: sql,
  });
  if (!res.ok) throw new Error(`CH ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  if (!text.trim()) return [];
  return text.trim().split('\n').map((l) => l.split('\t'));
}

function label(v) {
  return v.licensePlate === 'KS FH 660E' ? 'KS FH 660E' : `veh-${v.id.slice(0, 8)}`;
}

function isIce(v) {
  const ft = (v.fuelType || '').toUpperCase();
  return ft !== 'ELECTRIC' && ft !== 'EV' && ft !== 'BEV';
}

function classifyWindow(w) {
  const tags = [];
  if (w.restDurationMs < REST_60M_MS) tags.push('SHORT');
  if (!w.hasChData) tags.push('NO_PROVIDER_DATA');
  if (w.staleRepeatPct >= 90) tags.push('STALE_REPEATED_SAMPLE');
  if (w.capture60m && w.capture60m.suspicious) tags.push(...w.capture60m.suspicious);
  if (w.capture6h && w.capture6h.suspicious) tags.push(...w.capture6h.suspicious);
  if (w.wakeContaminated) tags.push('WAKE_CONTAMINATED');
  if (w.chargingContaminated) tags.push('CHARGING_CONTAMINATED');
  if (w.timestampInconsistent) tags.push('TIMESTAMP_INCONSISTENT');
  if (w.misclassified) tags.push('CURRENT_IMPLEMENTATION_MISCLASSIFIED');
  if (!w.assessable) return 'NOT_ASSESSABLE';
  if (tags.includes('WAKE_CONTAMINATED') || tags.includes('CHARGING_CONTAMINATED')) {
    return tags.includes('STALE_REPEATED_SAMPLE') ? 'STALE_REPEATED_SAMPLE' : 'WAKE_CONTAMINATED';
  }
  if (tags.includes('STALE_REPEATED_SAMPLE') && !w.capture60m && !w.capture6h) return 'STALE_REPEATED_SAMPLE';
  if (!w.hasChData) return 'NO_PROVIDER_DATA';
  if (w.capture60m?.valid || w.capture6h?.valid) return 'VALID_REST_SAMPLE';
  if (w.misclassified) return 'CURRENT_IMPLEMENTATION_MISCLASSIFIED';
  if (tags.includes('TIMESTAMP_INCONSISTENT')) return 'TIMESTAMP_INCONSISTENT';
  return 'NOT_ASSESSABLE';
}

function analyzeCapture(snap, restStartMs, nextTripStartMs, chAtCapture, thresholdMs) {
  if (!snap) return null;
  const observedMs = new Date(snap.recordedAt).getTime();
  const restMs = observedMs - restStartMs;
  const suspicious = [];
  const v = snap.restingVoltage ?? snap.voltageV;
  if (v > 13.2) suspicious.push('HIGH_VOLTAGE_GT_13_2');
  if (snap.engineRunning) suspicious.push('ENGINE_RUNNING_TRUE');
  const ch = chAtCapture;
  if (ch) {
    if (ch.speed_kmh > 5) suspicious.push('SPEED_GT_5');
    if (ch.is_ignition_on === '1' || ch.is_ignition_on === 'true') suspicious.push('IGNITION_ON');
    if (ch.traction_kw && parseFloat(ch.traction_kw) > 1) suspicious.push('TRACTION_ACTIVE');
  }
  const sampleAgeAtPoll = ch?.provider_fetch_age_ms
    ? parseFloat(ch.provider_fetch_age_ms)
    : null;
  if (sampleAgeAtPoll != null && sampleAgeAtPoll > BATTERY_MAX_SAMPLE_AGE_MS) {
    suspicious.push('STALE_SAMPLE_AGE_GT_5M');
  }
  const nearWake =
    nextTripStartMs != null && Math.abs(observedMs - nextTripStartMs) < 15 * 60_000;
  if (nearWake) suspicious.push('NEAR_NEXT_TRIP_START');
  const valid =
    suspicious.length === 0 &&
    restMs >= thresholdMs - 2 * 60_000 &&
    restMs <= thresholdMs + 30 * 60_000;
  return {
    voltage: v,
    recordedAt: snap.recordedAt,
    restMinutes: Math.round(restMs / 60_000),
    suspicious,
    valid,
    engineRunning: snap.engineRunning,
  };
}

(async () => {
  loadEnv();
  const p = new PrismaClient();
  const out = {
    generatedAt: new Date().toISOString(),
    periodDays: DAYS,
    since: since.toISOString(),
    methodology: {},
    fleet: [],
    restWindows: { ice: [], bev: [] },
    aggregates: {},
    suspicious: {},
    batteryFeatures: [],
    examples: {},
  };

  const vehicles = await p.vehicle.findMany({
    where: { dimoVehicleId: { not: null } },
    select: {
      id: true,
      licensePlate: true,
      fuelType: true,
      make: true,
      model: true,
    },
  });

  for (const v of vehicles) {
    const lbl = label(v);
    const ice = isIce(v);
    out.fleet.push({ id: v.id, label: lbl, ice, fuelType: v.fuelType, makeModel: `${v.make ?? ''} ${v.model ?? ''}`.trim() });

    const [trips, bhs, evidence, features, detState, vls] = await Promise.all([
      p.vehicleTrip.findMany({
        where: { vehicleId: v.id, endTime: { not: null, gte: since } },
        orderBy: { endTime: 'asc' },
        select: { id: true, startTime: true, endTime: true, outsideTemperatureStartC: true },
      }),
      p.batteryHealthSnapshot.findMany({
        where: { vehicleId: v.id, recordedAt: { gte: since } },
        orderBy: { recordedAt: 'asc' },
        select: {
          id: true,
          recordedAt: true,
          voltageV: true,
          restingVoltage: true,
          engineRunning: true,
          temperatureC: true,
        },
      }),
      p.batteryEvidence.findMany({
        where: {
          vehicleId: v.id,
          observedAt: { gte: since },
          valueType: { in: ['RESTING_VOLTAGE_V', 'VOLTAGE_V'] },
        },
        orderBy: { observedAt: 'asc' },
        select: { valueType: true, numericValue: true, observedAt: true, sourceType: true },
      }),
      p.batteryFeatures.findUnique({ where: { vehicleId: v.id } }),
      p.vehicleTripDetectionState.findUnique({
        where: { vehicleId: v.id },
        select: { state: true, lastActivityAt: true, updatedAt: true },
      }),
      p.vehicleLatestState.findUnique({
        where: { vehicleId: v.id },
        select: {
          lvBatteryVoltage: true,
          sourceTimestamp: true,
          providerFetchedAt: true,
          speedKmh: true,
          isIgnitionOn: true,
          evSoc: true,
          tractionBatteryIsCharging: true,
        },
      }),
    ]);

    if (features) {
      out.batteryFeatures.push({
        vehicleId: v.id,
        label: lbl,
        restWindowStartedAt: features.restWindowStartedAt,
        rest60mCapturedAt: features.rest60mCapturedAt,
        rest6hCapturedAt: features.rest6hCapturedAt,
        vOff60m: features.vOff60m,
        vOff6h: features.vOff6h,
        restObservationCount: features.restObservationCount,
      });
    }

    // CH bulk load
    let chRows = [];
    try {
      const chData = await chQuery(`
        SELECT
          toString(recorded_at) AS recorded_at,
          toString(speed_kmh) AS speed_kmh,
          toString(is_ignition_on) AS is_ignition_on,
          toString(ev_soc) AS ev_soc,
          toString(traction_kw) AS traction_kw,
          toString(inserted_at) AS inserted_at
        FROM telemetry_snapshots
        WHERE vehicle_id = '${v.id}'
          AND recorded_at >= parseDateTimeBestEffort('${since.toISOString().slice(0, 19)}')
        ORDER BY inserted_at ASC
        FORMAT TabSeparated
      `);
      chRows = chData.map((r) => ({
        recordedAt: new Date(r[0] + 'Z'),
        recordedAtMs: new Date(r[0] + 'Z').getTime(),
        speedKmh: r[1] === '\\N' || r[1] === '' ? null : parseFloat(r[1]),
        isIgnitionOn: r[2] === '1' || r[2] === 'true',
        evSoc: r[3] === '\\N' ? null : parseFloat(r[3]),
        tractionKw: r[4] === '\\N' ? null : parseFloat(r[4]),
        insertedAt: new Date(r[5] + 'Z'),
        insertedAtMs: new Date(r[5] + 'Z').getTime(),
      }));
    } catch (e) {
      out.chErrors = out.chErrors || [];
      out.chErrors.push({ vehicle: lbl, error: e.message });
    }

    const restingSnaps = bhs.filter((s) => s.restingVoltage != null);

    for (let i = 0; i < trips.length; i++) {
      const trip = trips[i];
      const restStart = trip.endTime;
      const restStartMs = restStart.getTime();
      const nextTrip = trips[i + 1];
      const nextStartMs = nextTrip ? nextTrip.startTime.getTime() : Date.now();
      const restDurationMs = nextStartMs - restStartMs;
      if (restDurationMs < REST_60M_MS) continue;

      const chInWindow = chRows.filter(
        (r) => r.insertedAtMs >= restStartMs - 60_000 && r.insertedAtMs <= nextStartMs,
      );

      const uniqueRecordedAt = new Set(chInWindow.map((r) => r.recordedAtMs)).size;
      let repeatPairs = 0;
      let totalPairs = 0;
      for (let j = 1; j < chInWindow.length; j++) {
        totalPairs++;
        if (chInWindow[j].recordedAtMs === chInWindow[j - 1].recordedAtMs) repeatPairs++;
      }
      const staleRepeatPct = totalPairs ? (repeatPairs / totalPairs) * 100 : 100;

      const markerData = {};
      for (const off of MARKERS) {
        const target = restStartMs + off;
        const near = chInWindow.filter(
          (r) => Math.abs(r.insertedAtMs - target) < 3 * 60_000,
        );
        const uniqueAt = new Set(near.map((r) => r.recordedAtMs));
        markerData[`${off / 60_000}m`] = {
          pollRowsNear: near.length,
          uniqueProviderTs: uniqueAt.size,
          speed: near.length ? near[Math.floor(near.length / 2)].speedKmh : null,
          recordedAt: near.length ? near[Math.floor(near.length / 2)].recordedAt : null,
        };
      }

      const firstAfterRest = chInWindow[0] ?? null;
      const lastBeforeNext = chInWindow[chInWindow.length - 1] ?? null;
      const firstNewTs = (() => {
        if (!firstAfterRest) return null;
        const base = firstAfterRest.recordedAtMs;
        return chInWindow.find((r) => r.recordedAtMs > base) ?? null;
      })();

      const windowSnaps = restingSnaps.filter((s) => {
        const t = new Date(s.recordedAt).getTime();
        return t >= restStartMs && t <= nextStartMs;
      });

      const snap60 = windowSnaps.find((s) => {
        const t = new Date(s.recordedAt).getTime() - restStartMs;
        return t >= REST_60M_MS - 2 * 60_000 && t <= REST_60M_MS + 30 * 60_000;
      });
      const snap6h = windowSnaps.find((s) => {
        const t = new Date(s.recordedAt).getTime() - restStartMs;
        return t >= REST_6H_MS - 2 * 60_000 && t <= REST_6H_MS + 60 * 60_000;
      });

      const findChNear = (ts) => {
        if (!ts) return null;
        const ms = new Date(ts).getTime();
        const near = chInWindow.find((r) => Math.abs(r.insertedAtMs - ms) < 90_000);
        return near;
      };

      const capture60m = analyzeCapture(snap60, restStartMs, nextTrip?.startTime?.getTime() ?? null, findChNear(snap60?.recordedAt), REST_60M_MS);
      const capture6h = analyzeCapture(snap6h, restStartMs, nextTrip?.startTime?.getTime() ?? null, findChNear(snap6h?.recordedAt), REST_6H_MS);

      const wakeCh = nextTrip
        ? chInWindow.filter(
            (r) =>
              r.insertedAtMs >= nextTrip.startTime.getTime() - 5 * 60_000 &&
              r.insertedAtMs <= nextTrip.startTime.getTime() + 10 * 60_000,
          )
        : [];

      const wakeContaminated =
        capture60m?.suspicious?.includes('NEAR_NEXT_TRIP_START') ||
        capture6h?.suspicious?.includes('NEAR_NEXT_TRIP_START') ||
        capture60m?.suspicious?.includes('SPEED_GT_5') ||
        capture6h?.suspicious?.includes('SPEED_GT_5');

      const sameObservedAt =
        features?.rest60mCapturedAt &&
        features?.rest6hCapturedAt &&
        features.rest60mCapturedAt.getTime() === features.rest6hCapturedAt.getTime();

      const timestampInconsistent =
        capture60m?.suspicious?.includes('STALE_SAMPLE_AGE_GT_5M') ||
        capture6h?.suspicious?.includes('STALE_SAMPLE_AGE_GT_5M');

      const misclassified =
        (capture60m && capture60m.suspicious.length > 0 && capture60m.suspicious.every((s) => s !== 'NEAR_NEXT_TRIP_START')) ||
        (capture6h && capture6h.suspicious.length > 0);

      const tempC = trip.outsideTemperatureStartC ?? null;

      const w = {
        vehicleId: v.id,
        label: lbl,
        ice,
        tripId: trip.id,
        restStart: restStart.toISOString(),
        restDurationHours: +(restDurationMs / 3600_000).toFixed(2),
        nextTripStart: nextTrip?.startTime?.toISOString() ?? null,
        tempC,
        hasChData: chInWindow.length > 0,
        chRows: chInWindow.length,
        uniqueProviderTs: uniqueRecordedAt,
        staleRepeatPct: +staleRepeatPct.toFixed(1),
        markerData,
        firstAfterRest: firstAfterRest
          ? { speed: firstAfterRest.speedKmh, recordedAt: firstAfterRest.recordedAt, ignition: firstAfterRest.isIgnitionOn }
          : null,
        firstNewProviderTs: firstNewTs
          ? { recordedAt: firstNewTs.recordedAt, speed: firstNewTs.speedKmh, afterRestMin: Math.round((firstNewTs.insertedAtMs - restStartMs) / 60_000) }
          : null,
        lastChBeforeWake: lastBeforeNext
          ? { recordedAt: lastBeforeNext.recordedAt, speed: lastBeforeNext.speedKmh }
          : null,
        restingSnapshots: windowSnaps.length,
        capture60m,
        capture6h,
        has60mCapture: !!capture60m,
        has6hCapture: !!capture6h,
        wakeContaminated,
        chargingContaminated: false,
        timestampInconsistent,
        misclassified,
        assessable: ice && chInWindow.length > 0,
        sameObservedAt60m6h: snap60 && snap6h && snap60.recordedAt.getTime() === snap6h.recordedAt.getTime(),
        wakeSamples: wakeCh.slice(0, 3).map((r) => ({
          speed: r.speedKmh,
          recordedAt: r.recordedAt,
          ignition: r.isIgnitionOn,
        })),
      };
      w.classification = classifyWindow(w);
      (ice ? out.restWindows.ice : out.restWindows.bev).push(w);
    }
  }

  // Aggregates
  const agg = (arr) => {
    const ge60 = arr.length;
    const ge6h = arr.filter((w) => w.restDurationHours >= 6).length;
    const cap60 = arr.filter((w) => w.has60mCapture).length;
    const cap6h = arr.filter((w) => w.has6hCapture).length;
    const valid60 = arr.filter((w) => w.capture60m?.valid).length;
    const valid6h = arr.filter((w) => w.capture6h?.valid).length;
    const susp60 = arr.filter((w) => w.capture60m?.suspicious?.length > 0).length;
    const susp6h = arr.filter((w) => w.capture6h?.suspicious?.length > 0).length;
    const highV = arr.filter((w) => (w.capture60m?.voltage > 13.2) || (w.capture6h?.voltage > 13.2)).length;
    const sameTs = arr.filter((w) => w.sameObservedAt60m6h).length;
    const stale = arr.filter((w) => w.staleRepeatPct >= 90).length;
    const noData = arr.filter((w) => !w.hasChData).length;
    const wake = arr.filter((w) => w.wakeContaminated).length;
    const classCounts = {};
    for (const w of arr) classCounts[w.classification] = (classCounts[w.classification] || 0) + 1;
    return {
      windowsGe60m: ge60,
      windowsGe6h: ge6h,
      capture60m: cap60,
      capture6h: cap6h,
      capture60mRatePct: ge60 ? +((cap60 / ge60) * 100).toFixed(1) : 0,
      capture6hRatePct: ge6h ? +((cap6h / ge6h) * 100).toFixed(1) : 0,
      valid60m: valid60,
      valid6h: valid6h,
      valid60mRatePct: ge60 ? +((valid60 / ge60) * 100).toFixed(1) : 0,
      valid6hRatePct: ge6h ? +((valid6h / ge6h) * 100).toFixed(1) : 0,
      suspicious60m: susp60,
      suspicious6h: susp6h,
      highVoltageGt132: highV,
      identical60m6hTs: sameTs,
      staleRepeatGe90Pct: stale,
      noProviderData: noData,
      wakeContaminated: wake,
      classCounts,
      medianStaleRepeatPct: median(arr.map((w) => w.staleRepeatPct)),
    };
  };

  out.aggregates.ice = agg(out.restWindows.ice);
  out.aggregates.bev = agg(out.restWindows.bev);
  out.aggregates.all = agg([...out.restWindows.ice, ...out.restWindows.bev]);

  // Global suspicious from all resting snapshots
  const allRestSnaps = await p.batteryHealthSnapshot.findMany({
    where: { recordedAt: { gte: since }, restingVoltage: { not: null } },
    select: { vehicleId: true, recordedAt: true, restingVoltage: true, engineRunning: true, voltageV: true },
  });
  out.suspicious = {
    totalRestingSnapshots: allRestSnaps.length,
    gt132V: allRestSnaps.filter((s) => (s.restingVoltage ?? s.voltageV) > 13.2).length,
    engineRunningTrue: allRestSnaps.filter((s) => s.engineRunning).length,
    identicalTimestampsPairs: 0,
  };

  // identical 60m/6h in battery_features across fleet
  const featPairs = out.batteryFeatures.filter(
    (f) =>
      f.rest60mCapturedAt &&
      f.rest6hCapturedAt &&
      new Date(f.rest60mCapturedAt).getTime() === new Date(f.rest6hCapturedAt).getTime(),
  );
  out.suspicious.identical60m6hInFeatures = featPairs.length;

  // Examples
  const pick = (arr, pred, n = 3) => arr.filter(pred).slice(0, n);
  out.examples = {
    validRest: pick(out.restWindows.ice, (w) => w.classification === 'VALID_REST_SAMPLE'),
    staleNoCapture: pick(out.restWindows.ice, (w) => w.classification === 'STALE_REPEATED_SAMPLE' && !w.has60mCapture),
    wakeContaminated: pick(out.restWindows.ice, (w) => w.wakeContaminated || w.capture60m?.suspicious?.includes('HIGH_VOLTAGE_GT_13_2')),
    capturedSuspicious: pick(out.restWindows.ice, (w) => w.has60mCapture && w.capture60m?.suspicious?.length > 0),
  };

  // Trip + snapshot counts
  out.totals = {
    completedTrips: await p.vehicleTrip.count({ where: { endTime: { not: null, gte: since } } }),
    restingSnapshots: allRestSnaps.length,
    evidenceResting: await p.batteryEvidence.count({
      where: { observedAt: { gte: since }, valueType: 'RESTING_VOLTAGE_V' },
    }),
  };

  await p.$disconnect();

  const json = JSON.stringify(out, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
  const outPath = '/tmp/battery-rest-window-data.json';
  fs.writeFileSync(outPath, json);
  console.log('WROTE', outPath, 'bytes', json.length);
  console.log('ICE windows>=60m:', out.aggregates.ice.windowsGe60m, 'capture60m:', out.aggregates.ice.capture60m);
  console.log('ICE windows>=6h:', out.aggregates.ice.windowsGe6h, 'capture6h:', out.aggregates.ice.capture6h);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
