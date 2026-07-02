export interface FleetVehicleInfo {
  vehicleId: string;
  licensePlate: string | null;
  vehicleName: string | null;
  make: string;
  model: string;
  year: number;
  vin: string;
  fuelType: string;
  tokenId: number | null;
}

export function resolveChatVehicleTokenIds(
  resolvedTokenId: number | null | undefined,
): number[] | undefined {
  if (typeof resolvedTokenId === 'number' && resolvedTokenId > 0) {
    return [resolvedTokenId];
  }
  return undefined;
}

export function formatChatScopeLog(orgId: string, tokenIds?: number[]): string {
  return `orgId=${orgId} hasVehicleScope=${Boolean(tokenIds?.length)} vehicleIdsCount=${tokenIds?.length ?? 0}`;
}

export function normalizePlate(input: string): string {
  return input
    .toUpperCase()
    .replace(/[-–—]/g, ' ')
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

export function tryResolveVehicle(
  message: string,
  fleet: FleetVehicleInfo[],
): FleetVehicleInfo | null {
  const normalized = normalizePlate(message);
  const msgLower = message.toLowerCase();

  for (const v of fleet) {
    if (v.licensePlate && normalizePlate(v.licensePlate) === normalized) {
      return v;
    }
  }

  for (const v of fleet) {
    if (v.licensePlate) {
      const storedNorm = normalizePlate(v.licensePlate);
      if (storedNorm && normalized.includes(storedNorm)) return v;
      if (storedNorm && storedNorm.includes(normalized) && normalized.length >= 4) return v;
    }
  }

  for (const v of fleet) {
    if (v.vehicleName && msgLower.includes(v.vehicleName.toLowerCase())) return v;
  }

  const makeModelMatches = fleet.filter((v) => {
    const make = v.make.toLowerCase();
    const model = v.model.toLowerCase();
    return msgLower.includes(make) && msgLower.includes(model);
  });
  if (makeModelMatches.length === 1) return makeModelMatches[0];
  if (makeModelMatches.length > 1) {
    const withYear = makeModelMatches.filter((v) => msgLower.includes(String(v.year)));
    if (withYear.length === 1) return withYear[0];
  }

  for (const v of fleet) {
    if (v.vin && msgLower.includes(v.vin.toLowerCase())) return v;
  }

  const tokenMatch = message.match(/token\s*(?:id)?\s*[:#=]?\s*(\d+)/i);
  if (tokenMatch) {
    const tid = parseInt(tokenMatch[1], 10);
    const match = fleet.find((v) => v.tokenId === tid);
    if (match) return match;
  }

  return null;
}

export function buildEnrichedChatMessage(
  userMessage: string,
  fleet: FleetVehicleInfo[],
  resolvedVehicle?: FleetVehicleInfo | null,
): string {
  if (fleet.length === 0) return userMessage;

  const vehicleLines = fleet.map((v, i) => {
    const parts = [`#${i + 1}: ${v.make} ${v.model} ${v.year}`];
    if (v.licensePlate) parts.push(`plate="${v.licensePlate}"`);
    if (v.vehicleName) parts.push(`name="${v.vehicleName}"`);
    if (v.vin) parts.push(`VIN=${v.vin}`);
    if (v.tokenId) parts.push(`tokenId=${v.tokenId}`);
    parts.push(`fuel=${v.fuelType}`);
    return parts.join(', ');
  });

  const resolved = resolvedVehicle ?? tryResolveVehicle(userMessage, fleet);
  let resolutionHint = '';
  if (resolved) {
    const platePart = resolved.licensePlate ? ` (plate: ${resolved.licensePlate})` : '';
    const tokenPart = resolved.tokenId ? `, tokenId=${resolved.tokenId}` : '';
    resolutionHint = `\n[System: The user is likely referring to vehicle "${resolved.make} ${resolved.model} ${resolved.year}"${platePart}${tokenPart}. Use this vehicle for data lookups.]`;
    if (!resolved.tokenId) {
      resolutionHint +=
        '\n[System: This vehicle has no DIMO tokenId — do not claim live DIMO telemetry for it.]';
    }
  }

  return `[Fleet context — ${fleet.length} registered vehicles:\n${vehicleLines.join('\n')}\nUse this fleet data to identify vehicles when users refer to them by license plate, name, make/model, or VIN. Only reference live telemetry when a specific vehicle with tokenId is resolved.]${resolutionHint}\n\nUser message: ${userMessage}`;
}

export const FLEET_CHAT_SYSTEM_PROMPT = `You are SynqDrive Fleet Assistant — a helpful AI for fleet and rental operators.
Answer clearly and practically. Do not invent vehicle telemetry, odometer readings, or live DIMO data you were not given.
When fleet context is attached, use it to identify which vehicle the user means.
Prefer German when the user writes in German.`;
