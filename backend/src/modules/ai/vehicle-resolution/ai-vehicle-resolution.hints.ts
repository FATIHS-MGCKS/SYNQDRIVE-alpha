import {
  normalizeVehiclePlate,
  normalizeVehicleVin,
} from '@modules/document-extraction/vehicle-candidate-matching.util';
import type { AiVehicleResolutionHints, AiVehicleResolutionRecord } from './ai-vehicle-resolution.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VIN_PATTERN = /\b([A-HJ-NPR-Z0-9]{17})\b/i;

const TOKEN_ID_PATTERN = /\btoken\s*(?:id)?\s*[:#=]?\s*(\d{1,12})\b/i;

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

export function sanitizeAiVehicleUserText(input: string): string {
  return input
    .replace(CONTROL_CHARS, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

export function sanitizeAiVehicleLlmField(input: string | null | undefined): string {
  if (!input) return '';
  return sanitizeAiVehicleUserText(input).slice(0, 200);
}

export function buildAiVehicleDisplayName(record: Pick<
  AiVehicleResolutionRecord,
  'make' | 'model' | 'year' | 'vehicleName' | 'licensePlate'
>): string {
  const base = `${record.make} ${record.model} ${record.year}`.trim();
  if (record.vehicleName) {
    return `${sanitizeAiVehicleLlmField(record.vehicleName)} (${base})`;
  }
  return base;
}

function findVinInMessage(message: string): string | null {
  const match = message.match(VIN_PATTERN);
  if (!match?.[1]) return null;
  return normalizeVehicleVin(match[1]);
}

function findTokenIdInMessage(message: string): number | null {
  const match = message.match(TOKEN_ID_PATTERN);
  if (!match?.[1]) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function findUuidInMessage(message: string): string | null {
  const tokens = message.split(/\s+/);
  for (const token of tokens) {
    const cleaned = token.replace(/[^a-zA-Z0-9-]/g, '');
    if (UUID_PATTERN.test(cleaned)) {
      return cleaned.toLowerCase();
    }
  }
  return null;
}

function findPlateHintInMessage(
  message: string,
  fleet: readonly AiVehicleResolutionRecord[],
): string | null {
  const messageNorm = normalizeVehiclePlate(message);
  if (!messageNorm) return null;

  for (const vehicle of fleet) {
    const plateNorm = normalizeVehiclePlate(vehicle.licensePlate);
    if (plateNorm && messageNorm === plateNorm) {
      return vehicle.licensePlate;
    }
  }

  for (const vehicle of fleet) {
    const plateNorm = normalizeVehiclePlate(vehicle.licensePlate);
    if (!plateNorm || plateNorm.length < 4) continue;
    if (messageNorm.includes(plateNorm)) {
      return vehicle.licensePlate;
    }
  }

  return null;
}

function findVehicleNameHint(
  message: string,
  fleet: readonly AiVehicleResolutionRecord[],
): string | null {
  const msgLower = message.toLowerCase();
  const matches = fleet
    .filter((vehicle) => {
      const name = vehicle.vehicleName?.trim();
      if (!name) return false;
      const normalizedName = sanitizeAiVehicleUserText(name).toLowerCase();
      return normalizedName.length >= 3 && msgLower.includes(normalizedName);
    })
    .map((vehicle) => vehicle.vehicleName as string);

  if (matches.length === 1) {
    return matches[0];
  }

  return null;
}

function findMakeModelHints(
  message: string,
  fleet: readonly AiVehicleResolutionRecord[],
): { make: string | null; model: string | null } {
  const msgLower = message.toLowerCase();
  const makes = new Set(fleet.map((vehicle) => vehicle.make.trim().toLowerCase()).filter(Boolean));
  const models = new Set(fleet.map((vehicle) => vehicle.model.trim().toLowerCase()).filter(Boolean));

  let make: string | null = null;
  let model: string | null = null;

  for (const candidate of makes) {
    if (candidate.length >= 2 && msgLower.includes(candidate)) {
      make = candidate;
      break;
    }
  }

  for (const candidate of models) {
    if (candidate.length >= 3 && msgLower.includes(candidate)) {
      model = candidate;
      break;
    }
  }

  return { make, model };
}

export function extractAiVehicleResolutionHints(input: {
  message: string;
  fleet: readonly AiVehicleResolutionRecord[];
  bookingId?: string | null;
  bookingVehicleId?: string | null;
}): AiVehicleResolutionHints {
  const sanitizedMessage = sanitizeAiVehicleUserText(input.message);
  const { make, model } = findMakeModelHints(sanitizedMessage, input.fleet);

  return {
    rawMessage: input.message,
    sanitizedMessage,
    internalVehicleId: findUuidInMessage(sanitizedMessage),
    licensePlate: findPlateHintInMessage(sanitizedMessage, input.fleet),
    vin: findVinInMessage(sanitizedMessage),
    tokenId: findTokenIdInMessage(sanitizedMessage),
    vehicleName: findVehicleNameHint(sanitizedMessage, input.fleet),
    make,
    model,
    bookingId: input.bookingId ?? null,
    bookingVehicleId: input.bookingVehicleId ?? null,
  };
}

/** @deprecated Use normalizeVehiclePlate from document-extraction matching util. */
export function normalizePlate(input: string): string {
  return normalizeVehiclePlate(input) ?? '';
}
