/* READ-ONLY DIMO Tesla HV capability audit — no writes, no secrets in output */
const fs = require('fs');
const axios = require('axios');
const { Wallet } = require('ethers');
const { PrismaClient } = require('@prisma/client');

const DAYS = 31;
const PLATE = 'KS FH 660E';

function loadEnv() {
  const envPath = '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function pctl(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx];
}

function cv(arr) {
  if (arr.length < 2) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  if (mean === 0) return null;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance) / mean;
}

async function getDeveloperJwt() {
  const clientId = process.env.DIMO_CLIENT_ID;
  const privateKey = process.env.DIMO_PRIVATE_KEY;
  const domain = process.env.DIMO_REDIRECT_URI || 'https://auth.dimo.zone';
  const authUrl = 'https://auth.dimo.zone';
  const normalizedKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  const wallet = new Wallet(normalizedKey);
  const challengeRes = await axios.post(
    `${authUrl}/auth/web3/generate_challenge`,
    null,
    {
      params: {
        client_id: clientId,
        domain,
        scope: 'openid email',
        response_type: 'code',
        address: clientId,
      },
      timeout: 15000,
    },
  );
  const { challenge, state } = challengeRes.data;
  const signature = await wallet.signMessage(challenge);
  const submitBody = new URLSearchParams({
    client_id: clientId,
    domain,
    grant_type: 'authorization_code',
    state,
    signature,
  });
  const submitRes = await axios.post(`${authUrl}/auth/web3/submit_challenge`, submitBody.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  const token =
    submitRes.data?.developer_jwt ?? submitRes.data?.access_token ?? submitRes.data?.token;
  if (!token) throw new Error('No developer JWT');
  return token;
}

async function getVehicleJwt(developerJwt, tokenId) {
  const nft = process.env.DIMO_VEHICLE_NFT_CONTRACT || '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
  const url = process.env.DIMO_TOKEN_EXCHANGE_URL || 'https://token-exchange-api.dimo.zone';
  const res = await axios.post(
    `${url}/v1/tokens/exchange`,
    { nftContractAddress: nft, privileges: [1, 2, 3, 4, 5, 6], tokenId },
    { headers: { Authorization: `Bearer ${developerJwt}` }, timeout: 15000 },
  );
  const jwt = res.data?.token ?? res.data?.access_token ?? res.data?.jwt;
  if (!jwt) throw new Error('No vehicle JWT');
  return jwt;
}

async function gql(vehicleJwt, query) {
  const url = process.env.DIMO_TELEMETRY_API_URL || 'https://telemetry-api.dimo.zone/query';
  const res = await axios.post(url, { query }, {
    headers: { Authorization: `Bearer ${vehicleJwt}`, 'Content-Type': 'application/json' },
    timeout: 20000,
  });
  if (res.data?.errors?.length && !res.data?.data) {
    throw new Error(res.data.errors.map((e) => e.message).join('; '));
  }
  return res.data;
}

function sigField(sl, name) {
  const f = sl?.[name];
  if (!f) return { value: null, timestamp: null, source: null, present: false };
  return {
    value: typeof f.value === 'number' ? f.value : f.value ?? null,
    timestamp: f.timestamp ?? null,
    source: f.source ?? null,
    present: f.value != null && f.value !== undefined,
  };
}

function classifyLatest(docName, field, lastSeen) {
  if (!field) return 'NOT_LISTED';
  if (field.queryError) return 'QUERY_ERROR';
  const inAvailable = field.inAvailableList;
  if (!inAvailable && field.value == null) return 'NOT_LISTED';
  if (field.value == null) return 'AVAILABLE_BUT_NULL';
  const ts = field.timestamp ? new Date(field.timestamp).getTime() : null;
  const ls = lastSeen ? new Date(lastSeen).getTime() : null;
  if (ts && ls && ls - ts > 6 * 3600 * 1000) return 'STALE';
  return 'AVAILABLE_WITH_DATA';
}

const HV_SIGNALS = [
  'powertrainTractionBatteryStateOfHealth',
  'powertrainTractionBatteryGrossCapacity',
  'powertrainTractionBatteryStateOfChargeCurrent',
  'powertrainTractionBatteryStateOfChargeCurrentEnergy',
  'powertrainTractionBatteryChargingAddedEnergy',
  'powertrainTractionBatteryChargingIsCharging',
  'powertrainTractionBatteryChargingIsChargingCableConnected',
  'powertrainTractionBatteryChargingPower',
  'powertrainTractionBatteryCurrentPower',
  'powertrainTractionBatteryCurrentVoltage',
  'powertrainTractionBatteryTemperatureAverage',
  'powertrainTractionBatteryRange',
  'powertrainTractionBatteryChargingChargeLimit',
  'powertrainTractionBatteryChargingChargeCurrentAC',
  'powertrainTractionBatteryChargingChargeVoltageUnknownType',
  'powertrainRange',
  'speed',
  'exteriorAirTemperature',
  'powertrainTransmissionTravelledDistance',
];

const DOC_SEMANTICS = {
  powertrainTractionBatteryStateOfHealth: { unit: '%', semantics: 'SOH 0-100 rated capacity', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryGrossCapacity: { unit: 'kWh', semantics: 'Gross battery capacity', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryStateOfChargeCurrent: { unit: '%', semantics: 'Physical SOC net capacity', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryStateOfChargeCurrentEnergy: { unit: 'kWh', semantics: 'Remaining energy (physical SOC)', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryChargingAddedEnergy: { unit: 'kWh', semantics: 'Energy added current charging session', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryChargingIsCharging: { unit: '0/1', semantics: 'Charging ongoing', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryChargingIsChargingCableConnected: { unit: '0/1', semantics: 'Cable connected', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryChargingPower: { unit: 'kW', semantics: 'Charging power to traction battery', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryCurrentPower: { unit: 'W', semantics: 'Battery power in/out (+ charge)', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryCurrentVoltage: { unit: 'V', semantics: 'Pack voltage', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryTemperatureAverage: { unit: '°C', semantics: 'Avg pack temperature', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryRange: { unit: 'km', semantics: 'Remaining EV range', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryChargingChargeLimit: { unit: '%', semantics: 'Target charge limit SOC', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryChargingChargeCurrentAC: { unit: 'A', semantics: 'AC charge current RMS', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTractionBatteryChargingChargeVoltageUnknownType: { unit: 'V', semantics: 'Charge inlet voltage', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainRange: { unit: 'km', semantics: 'Range all energy sources', agg: 'FloatAggregation', latest: true, hist: true },
  speed: { unit: 'km/h', semantics: 'Vehicle speed', agg: 'FloatAggregation', latest: true, hist: true },
  exteriorAirTemperature: { unit: '°C', semantics: 'Outside air temp', agg: 'FloatAggregation', latest: true, hist: true },
  powertrainTransmissionTravelledDistance: { unit: 'km', semantics: 'Odometer', agg: 'FloatAggregation', latest: true, hist: true },
  lastSeen: { unit: 'UTC', semantics: 'Last signal matching filter', agg: 'Time', latest: true, hist: false },
  availableSignals: { unit: 'N/A', semantics: 'Queryable signal names with stored data', agg: '[String]', latest: true, hist: false },
};

function buildLatestQuery(tokenId) {
  const fields = HV_SIGNALS.map((s) => `${s} { timestamp value }`).join('\n        ');
  return `query LatestHV {
    availableSignals(tokenId: ${tokenId})
    signalsLatest(tokenId: ${tokenId}) {
      lastSeen
      ${fields}
    }
  }`;
}

function buildHistoricalBlock(tokenId, from, to, interval) {
  const metrics = [
    'powertrainTractionBatteryStateOfChargeCurrent',
    'powertrainTractionBatteryStateOfChargeCurrentEnergy',
    'powertrainTractionBatteryChargingAddedEnergy',
    'powertrainTractionBatteryChargingIsCharging',
    'powertrainTractionBatteryChargingIsChargingCableConnected',
    'powertrainTractionBatteryChargingPower',
    'powertrainTractionBatteryCurrentPower',
    'powertrainTractionBatteryCurrentVoltage',
    'powertrainTractionBatteryTemperatureAverage',
    'powertrainTractionBatteryRange',
    'powertrainTractionBatteryGrossCapacity',
    'powertrainTractionBatteryStateOfHealth',
    'powertrainTractionBatteryChargingChargeLimit',
    'exteriorAirTemperature',
    'speed',
  ];
  const lines = metrics
    .map((m) => `${m}(agg: LAST)`)
    .join('\n        ');
  return `query Hist {
    signals(tokenId: ${tokenId}, from: "${from.toISOString()}", to: "${to.toISOString()}", interval: "${interval}") {
      timestamp
      ${lines}
    }
  }`;
}

function buildRechargeSegmentsQuery(tokenId, from, to, after) {
  const extra = [
    'powertrainTractionBatteryChargingAddedEnergy',
    'powertrainTractionBatteryChargingPower',
    'powertrainTractionBatteryTemperatureAverage',
    'powertrainTractionBatteryCurrentVoltage',
    'powertrainTractionBatteryChargingChargeLimit',
    'powertrainTractionBatteryChargingIsCharging',
  ]
    .flatMap((n) => [`{ name: "${n}", agg: MIN }`, `{ name: "${n}", agg: MAX }`, `{ name: "${n}", agg: AVG }`])
    .join('\n          ');
  const afterArg = after ? `after: "${after}"` : '';
  return `query RechargeSegments {
    segments(
      tokenId: ${tokenId}
      from: "${from.toISOString()}"
      to: "${to.toISOString()}"
      mechanism: recharge
      limit: 50
      ${afterArg}
      signalRequests: [
        { name: "powertrainTractionBatteryStateOfChargeCurrent", agg: MIN }
        { name: "powertrainTractionBatteryStateOfChargeCurrent", agg: MAX }
        { name: "powertrainTractionBatteryStateOfChargeCurrentEnergy", agg: MIN }
        { name: "powertrainTractionBatteryStateOfChargeCurrentEnergy", agg: MAX }
        ${extra}
      ]
    ) {
      start { timestamp value { latitude longitude } }
      end { timestamp value { latitude longitude } }
      duration
      isOngoing
      startedBeforeRange
      signals { name agg value }
    }
  }`;
}

function analyzeSeries(rows) {
  const gaps = [];
  let dup = 0;
  let prevTs = null;
  const timestamps = rows.map((r) => r.timestamp);
  const uniqueTs = new Set(timestamps);
  for (let i = 1; i < rows.length; i++) {
    const a = new Date(rows[i - 1].timestamp).getTime();
    const b = new Date(rows[i].timestamp).getTime();
    const g = (b - a) / 1000;
    gaps.push(g);
    if (rows[i].timestamp === rows[i - 1].timestamp) dup++;
  }
  return {
    buckets: rows.length,
    uniqueTimestamps: uniqueTs.size,
    duplicateAdjacent: dup,
    duplicatePct: rows.length > 1 ? Math.round((dup / (rows.length - 1)) * 1000) / 10 : 0,
    gapMedianSec: median(gaps),
    gapP95Sec: pctl(gaps, 95),
    gapMaxSec: gaps.length ? Math.max(...gaps) : null,
  };
}

function extractSessionBounds(rows) {
  const charging = rows.map((r) => ({
    ts: r.timestamp,
    isCharging: r.soc != null ? r.isCharging : null,
    cable: r.cable,
    power: r.chargingPowerKw,
    added: r.addedEnergy,
    soc: r.soc,
  }));
  const starts = [];
  const ends = [];
  for (let i = 1; i < charging.length; i++) {
    const p = charging[i - 1];
    const c = charging[i];
    if (p.isCharging === 0 && c.isCharging === 1) starts.push(c.ts);
    if (p.isCharging === 1 && c.isCharging === 0) ends.push(c.ts);
    if (p.cable === 0 && c.cable === 1) starts.push(c.ts);
    if (p.cable === 1 && c.cable === 0) ends.push(c.ts);
  }
  return { chargeStarts: starts.length, chargeEnds: ends.length };
}

function parseHistRow(row) {
  const num = (k) => (typeof row[k] === 'number' ? row[k] : null);
  const cp = num('powertrainTractionBatteryCurrentPower');
  return {
    timestamp: row.timestamp,
    soc: num('powertrainTractionBatteryStateOfChargeCurrent'),
    currentEnergy: num('powertrainTractionBatteryStateOfChargeCurrentEnergy'),
    addedEnergy: num('powertrainTractionBatteryChargingAddedEnergy'),
    isCharging: num('powertrainTractionBatteryChargingIsCharging'),
    cable: num('powertrainTractionBatteryChargingIsChargingCableConnected'),
    chargingPowerKw: num('powertrainTractionBatteryChargingPower'),
    currentPowerKw: cp != null ? cp / 1000 : null,
    voltage: num('powertrainTractionBatteryCurrentVoltage'),
    temperature: num('powertrainTractionBatteryTemperatureAverage'),
    rangeKm: num('powertrainTractionBatteryRange'),
    grossCapacity: num('powertrainTractionBatteryGrossCapacity'),
    soh: num('powertrainTractionBatteryStateOfHealth'),
    chargeLimit: num('powertrainTractionBatteryChargingChargeLimit'),
    exteriorTemp: num('exteriorAirTemperature'),
    speed: num('speed'),
  };
}

function method2Capacity(rows) {
  const est = [];
  for (const r of rows) {
    if (r.soc == null || r.currentEnergy == null) continue;
    if (r.soc <= 0 || r.soc < 10 || r.soc > 90) continue;
    est.push(r.currentEnergy / (r.soc / 100));
  }
  if (!est.length) return null;
  return {
    n: est.length,
    median: Math.round(median(est) * 100) / 100,
    p10: Math.round(pctl(est, 10) * 100) / 100,
    p90: Math.round(pctl(est, 90) * 100) / 100,
    cv: Math.round((cv(est) ?? 0) * 1000) / 1000,
  };
}

function method3Session(rows) {
  const socStart = rows.find((r) => r.soc != null)?.soc;
  const socEnd = [...rows].reverse().find((r) => r.soc != null)?.soc;
  const addStart = rows.find((r) => r.addedEnergy != null)?.addedEnergy;
  const addEnd = [...rows].reverse().find((r) => r.addedEnergy != null)?.addedEnergy;
  if (socStart == null || socEnd == null || addStart == null || addEnd == null) return null;
  const dSoc = socEnd - socStart;
  const dAdd = addEnd - addStart;
  if (dSoc < 20 || dAdd <= 0) return { rejected: true, reason: 'delta_soc_or_energy', dSoc, dAdd };
  const cap = dAdd / (dSoc / 100);
  return { estimatedKwh: Math.round(cap * 100) / 100, dSoc, dAdd, monotonicAdded: rows.every((r, i) => i === 0 || r.addedEnergy == null || rows[i - 1].addedEnergy == null || r.addedEnergy >= rows[i - 1].addedEnergy) };
}

function integratePower(rows) {
  let kwh = 0;
  for (let i = 1; i < rows.length; i++) {
    const p = rows[i].chargingPowerKw ?? rows[i].currentPowerKw;
    const pPrev = rows[i - 1].chargingPowerKw ?? rows[i - 1].currentPowerKw;
    const power = p != null && p > 0 ? p : pPrev;
    if (power == null || power <= 0) continue;
    const dtH = (new Date(rows[i].timestamp).getTime() - new Date(rows[i - 1].timestamp).getTime()) / 3600000;
    if (dtH > 0 && dtH < 1) kwh += power * dtH;
  }
  return Math.round(kwh * 1000) / 1000;
}

(async () => {
  loadEnv();
  const p = new PrismaClient();
  const out = { auditAt: new Date().toISOString(), plate: PLATE };

  const vehicle = await p.vehicle.findFirst({
    where: { licensePlate: PLATE },
    include: {
      dimoVehicle: true,
      batterySpecs: { take: 1, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!vehicle) throw new Error('Vehicle not found');

  const vls = await p.vehicleLatestState.findUnique({ where: { vehicleId: vehicle.id } });
  const tokenIdFinal = vehicle.dimoVehicle?.tokenId ?? vls?.dimoTokenId;
  const nft = process.env.DIMO_VEHICLE_NFT_CONTRACT || '0xbA5738a18d83D41847dfFbDC6101d37C69c9B0cF';
  const chainId = 137;
  const tokenDid = tokenIdFinal ? `did:erc721:${chainId}:${nft}:${tokenIdFinal}` : null;

  out.vehicle = {
    vehicleId: vehicle.id,
    organizationId: vehicle.organizationId,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    fuelType: vehicle.fuelType,
    dimoTokenId: tokenIdFinal,
    tokenDidMasked: tokenDid ? `${tokenDid.slice(0, 32)}…${String(tokenIdFinal)}` : null,
    dimoExternalId: vehicle.dimoVehicle?.externalId ?? null,
    powertrainType: vehicle.dimoVehicle?.powertrainType ?? null,
    hvBatteryCapacityKwhRepo: vehicle.hvBatteryCapacityKwh ?? null,
    batterySpec: vehicle.batterySpecs?.[0]
      ? { type: vehicle.batterySpecs[0].batteryType, source: vehicle.batterySpecs[0].source }
      : null,
    verifiedReferenceCapacityKwh: vehicle.hvBatteryCapacityKwh ?? null,
    referenceCapacityNote:
      vehicle.hvBatteryCapacityKwh != null
        ? 'From vehicles.hv_battery_capacity_kwh in repo (57 kWh cited in prior audits)'
        : 'No verified reference — SOH percent will not be computed',
  };

  const devJwt = await getDeveloperJwt();
  const vehJwt = await getVehicleJwt(devJwt, tokenIdFinal);

  // ── Webhook signals (developer JWT only) ──
  try {
    const whRes = await axios.get('https://vehicle-triggers-api.dimo.zone/v1/webhooks/signals', {
      headers: { Authorization: `Bearer ${devJwt}` },
      timeout: 15000,
    });
    const signals = whRes.data?.signals ?? whRes.data ?? [];
    const names = Array.isArray(signals) ? signals.map((s) => s.name ?? s) : [];
    const hvWebhook = names.filter((n) =>
      /tractionBattery|charging|StateOfHealth|StateOfCharge/i.test(String(n)),
    );
    out.webhookSignals = {
      totalListed: names.length,
      hvRelatedCount: hvWebhook.length,
      hvRelatedSample: hvWebhook.slice(0, 25),
      chargingTriggerExample: hvWebhook.includes('powertrainTractionBatteryChargingIsCharging'),
    };
  } catch (e) {
    out.webhookSignals = { error: e.message };
  }

  // ── signalsLatest + availableSignals (separate root field per current schema) ──
  const latestData = await gql(vehJwt, buildLatestQuery(tokenIdFinal));
  const sl = latestData?.data?.signalsLatest;
  const available = new Set(latestData?.data?.availableSignals ?? []);
  out.latest = {
    lastSeen: sl?.lastSeen ?? null,
    availableSignalsCount: available.size,
    availableHvCount: HV_SIGNALS.filter((s) => available.has(s)).length,
  };

  out.latestMatrix = {};
  for (const name of HV_SIGNALS) {
    const f = sigField(sl, name);
    const status = classifyLatest(name, { ...f, inAvailableList: available.has(name) }, sl?.lastSeen);
    let dynamicHint = null;
    if (f.value != null) dynamicHint = 'DYNAMIC';
    out.latestMatrix[name] = {
      classification: status,
      inAvailableSignals: available.has(name),
      value: f.value,
      timestamp: f.timestamp,
      source: f.source,
      dynamicHint,
    };
  }

  // Doc delta matrix
  out.docDelta = Object.entries(DOC_SEMANTICS).map(([name, d]) => ({
    signal: name,
    ...d,
    sessionSohUse:
      name.includes('AddedEnergy') || name.includes('ChargingPower') || name.includes('StateOfCharge')
        ? 'Session capacity / bounds'
        : name.includes('StateOfHealth')
          ? 'Direct SOH'
          : name.includes('GrossCapacity')
            ? 'Reference capacity'
            : 'Context',
    risk:
      name === 'powertrainTractionBatteryStateOfChargeCurrentEnergy'
        ? 'Field name says energy; DIMO: physical SOC energy'
        : name === 'powertrainTractionBatteryChargingAddedEnergy'
          ? 'Session cumulative; reset behavior must be verified'
          : name === 'powertrainTractionBatteryCurrentPower'
            ? 'Unit watts not kW in docs'
            : null,
  }));

  // ── Recharge segments ──
  const to = new Date();
  const from = new Date(to.getTime() - DAYS * 24 * 3600 * 1000);
  let allSegments = [];
  let after = null;
  for (let page = 0; page < 5; page++) {
    const segQ = buildRechargeSegmentsQuery(tokenIdFinal, from, to, after);
    const segRes = await gql(vehJwt, segQ);
    const batch = segRes?.data?.segments ?? [];
    if (!batch.length) break;
    allSegments.push(...batch);
    const lastStart = batch[batch.length - 1]?.start?.timestamp;
    if (!lastStart || batch.length < 50) break;
    after = lastStart;
  }

  out.rechargeSegments = {
    count: allSegments.length,
    segments: allSegments.map((s, i) => {
      const sig = {};
      for (const x of s.signals ?? []) sig[`${x.name}_${x.agg}`] = x.value;
      const socMin = sig.powertrainTractionBatteryStateOfChargeCurrent_MIN;
      const socMax = sig.powertrainTractionBatteryStateOfChargeCurrent_MAX;
      return {
        index: i + 1,
        start: s.start?.timestamp,
        end: s.end?.timestamp,
        durationSec: s.duration,
        isOngoing: s.isOngoing,
        socDelta: socMin != null && socMax != null ? Math.round((socMax - socMin) * 10) / 10 : null,
        energyDelta:
          sig.powertrainTractionBatteryStateOfChargeCurrentEnergy_MAX != null &&
          sig.powertrainTractionBatteryStateOfChargeCurrentEnergy_MIN != null
            ? Math.round(
                (sig.powertrainTractionBatteryStateOfChargeCurrentEnergy_MAX -
                  sig.powertrainTractionBatteryStateOfChargeCurrentEnergy_MIN) *
                  100,
              ) / 100
            : null,
        addedEnergyDelta:
          sig.powertrainTractionBatteryChargingAddedEnergy_MAX != null &&
          sig.powertrainTractionBatteryChargingAddedEnergy_MIN != null
            ? Math.round(
                (sig.powertrainTractionBatteryChargingAddedEnergy_MAX -
                  sig.powertrainTractionBatteryChargingAddedEnergy_MIN) *
                  100,
              ) / 100
            : null,
        maxChargingPowerKw: sig.powertrainTractionBatteryChargingPower_MAX ?? null,
        avgTemp: sig.powertrainTractionBatteryTemperatureAverage_AVG ?? null,
        classification:
          s.duration >= 600 && (socMax - socMin) >= 5 ? 'SEGMENT_RELIABLE' : 'SEGMENT_PARTIAL',
      };
    }),
  };

  // ── HV snapshots charging periods from DB ──
  const hvCharging = await p.$queryRaw`
    SELECT DATE_TRUNC('day', recorded_at) AS day,
      COUNT(*) FILTER (WHERE is_charging = true)::int AS charging_rows,
      COUNT(*)::int AS total
    FROM hv_battery_health_snapshots
    WHERE vehicle_id = ${vehicle.id} AND recorded_at >= ${from}
    GROUP BY 1 ORDER BY 1
  `;
  out.hvSnapshotChargingDays = hvCharging;

  const hvSessionsDb = await p.$queryRaw`
    WITH o AS (
      SELECT recorded_at, is_charging, soc_percent,
        LAG(is_charging) OVER (ORDER BY recorded_at) AS prev_c
      FROM hv_battery_health_snapshots
      WHERE vehicle_id = ${vehicle.id} AND recorded_at >= ${from}
    )
    SELECT COUNT(*) FILTER (WHERE is_charging = true AND prev_c = false)::int AS starts
    FROM o WHERE prev_c IS NOT NULL
  `;
  out.hvDbChargeStarts = hvSessionsDb[0]?.starts ?? 0;

  // Pick sessions for historical analysis: prefer DIMO segments, else DB charging clusters
  const sessionWindows = allSegments
    .filter((s) => s.start?.timestamp && s.duration >= 300)
    .slice(0, 5)
    .map((s) => ({
      label: `dimo-seg-${s.start.timestamp}`,
      from: new Date(new Date(s.start.timestamp).getTime() - 30 * 60000),
      to: new Date(
        (s.end?.timestamp ? new Date(s.end.timestamp) : to).getTime() + 30 * 60000,
      ),
      dimoStart: s.start.timestamp,
      dimoEnd: s.end?.timestamp ?? null,
    }));

  if (sessionWindows.length < 3) {
    out.sessionShortfall = `Only ${sessionWindows.length} DIMO recharge segments >=5min; will analyze all available`;
  }

  out.sessions = [];
  const method3Results = [];

  for (const win of sessionWindows.slice(0, 3)) {
    const rows = [];
    const blockMs = 6 * 3600 * 1000;
    for (let t = win.from.getTime(); t < win.to.getTime(); t += blockMs) {
      const bFrom = new Date(t);
      const bTo = new Date(Math.min(t + blockMs, win.to.getTime()));
      try {
        const hist = await gql(vehJwt, buildHistoricalBlock(tokenIdFinal, bFrom, bTo, '1m'));
        const batch = hist?.data?.signals ?? [];
        for (const row of batch) rows.push(parseHistRow(row));
      } catch (e) {
        out.sessions.push({ label: win.label, blockError: e.message });
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    const cadence = analyzeSeries(rows);
    const bounds = extractSessionBounds(rows);
    const m2 = method2Capacity(rows);
    const m3 = method3Session(rows);
    if (m3 && !m3.rejected) method3Results.push(m3.estimatedKwh);
    const m4 = integratePower(rows);
    const socStart = rows.find((r) => r.soc != null)?.soc;
    const socEnd = [...rows].reverse().find((r) => r.soc != null)?.soc;
    const dSoc = socStart != null && socEnd != null ? socEnd - socStart : null;
    const m4Cap = dSoc != null && dSoc >= 20 && m4 > 0 ? Math.round((m4 / (dSoc / 100)) * 100) / 100 : null;

    // Added energy behavior
    const addedVals = rows.map((r) => r.addedEnergy).filter((v) => v != null);
    let addedResets = 0;
    for (let i = 1; i < addedVals.length; i++) if (addedVals[i] < addedVals[i - 1]) addedResets++;

    const grossVals = [...new Set(rows.map((r) => r.grossCapacity).filter((v) => v != null))];
    const sohVals = [...new Set(rows.map((r) => r.soh).filter((v) => v != null))];

    out.sessions.push({
      label: win.label,
      dimoStart: win.dimoStart,
      dimoEnd: win.dimoEnd,
      windowFrom: win.from.toISOString(),
      windowTo: win.to.toISOString(),
      cadence,
      bounds,
      addedEnergy: {
        samples: addedVals.length,
        start: addedVals[0] ?? null,
        end: addedVals[addedVals.length - 1] ?? null,
        resets: addedResets,
        nearZeroStart: addedVals[0] != null ? addedVals[0] < 1 : null,
      },
      currentEnergyMethod: m2,
      addedEnergyMethod: m3,
      powerIntegrationKwh: m4,
      powerIntegrationCapacity: m4Cap,
      grossCapacityDistinct: grossVals,
      sohDistinct: sohVals,
      temperatureRange:
        rows.length
          ? {
              min: Math.min(...rows.map((r) => r.temperature).filter((v) => v != null)),
              max: Math.max(...rows.map((r) => r.temperature).filter((v) => v != null)),
            }
          : null,
    });
  }

  // Provider SOH from latest + historical union
  const sohLatest = out.latestMatrix.powertrainTractionBatteryStateOfHealth?.value ?? null;
  out.providerSoh = {
    latestValue: sohLatest,
    latestTimestamp: out.latestMatrix.powertrainTractionBatteryStateOfHealth?.timestamp,
    historicalDistinct: [
      ...new Set(
        out.sessions.flatMap((s) => s.sohDistinct ?? []),
      ),
    ],
    method1Feasible:
      sohLatest != null && sohLatest > 0 && sohLatest <= 100
        ? 'PROVIDER_DEPENDENT'
        : 'UNAVAILABLE',
  };

  out.methodConsensus = {
    method1_directSoh: {
      status: out.providerSoh.method1Feasible,
      note: sohLatest == null ? 'null in signalsLatest (matches prior audit)' : 'value present',
    },
    method2_energySoc: {
      status: out.sessions.some((s) => s.currentEnergyMethod?.n >= 10) ? 'SHADOW_CANDIDATE' : 'VALIDATION_ONLY',
      medians: out.sessions.map((s) => s.currentEnergyMethod?.median).filter((v) => v != null),
    },
    method3_addedSoc: {
      status:
        method3Results.length >= 3
          ? 'SHADOW_CANDIDATE'
          : method3Results.length > 0
            ? 'VALIDATION_ONLY'
            : 'REJECTED',
      estimates: method3Results,
      note: 'Requires delta SOC >=20% and monotonic added energy',
    },
    method4_powerIntegral: {
      status: 'VALIDATION_ONLY',
      note: 'Fallback; cadence 1m',
    },
    method5_batteryPower: {
      status: 'VALIDATION_ONLY',
      note: 'Compare sign convention vs added energy',
    },
    grossCapacity: {
      status:
        out.latestMatrix.powertrainTractionBatteryGrossCapacity?.value != null
          ? 'PROVIDER_DEPENDENT'
          : 'UNAVAILABLE',
      values: out.sessions.flatMap((s) => s.grossCapacityDistinct ?? []),
    },
  };

  const ref = vehicle.hvBatteryCapacityKwh;
  if (ref && method3Results.length) {
    out.sohFromSessionMedian =
      Math.round((median(method3Results) / ref) * 1000) / 10;
  }

  out.recommendation = {
    ownHvSohEstimate:
      method3Results.length >= 3 || (sohLatest != null && sohLatest > 0)
        ? method3Results.length >= 3
          ? 'SHADOW_MODE_FIRST'
          : 'PROVIDER_DEPENDENT_ONLY'
        : 'NOT_FEASIBLE',
    bestSessionDetection: allSegments.length > 0 ? 'DIMO recharge segment primary' : 'isCharging flanks (weak)',
    bestCapacityMethod:
      method3Results.length >= 3
        ? 'Added Energy / delta SOC (sessions)'
        : out.sessions.some((s) => s.currentEnergyMethod?.n >= 20)
          ? 'Current Energy / SOC (shadow)'
          : 'None production-ready',
  };

  out.vpsDeployedCommit = require('child_process')
    .execSync('cd /opt/synqdrive/current && git rev-parse --short HEAD 2>/dev/null || echo unknown', {
      encoding: 'utf8',
    })
    .trim();

  const replacer = (_, v) => (typeof v === 'bigint' ? Number(v) : v);
  console.log(JSON.stringify(out, replacer, 2));
  await p.$disconnect();
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
