import { isBatteryV2PublicationEnabled } from '@config/battery-health-v2.config';
import {
  evaluateLegacyPublicationSafety,
  type LegacyPublicationSafetyInput,
  type LegacyPublicationSafetyResult,
} from './battery-legacy-publication-safety';

export function resolveBatteryV2UserFacingSohPct(
  publishedSohPct: number | null | undefined,
  safetyInput: LegacyPublicationSafetyInput,
): {
  userFacingSohPct: number | null;
  legacyPublicationSafety: LegacyPublicationSafetyResult;
} {
  const legacyPublicationSafety = evaluateLegacyPublicationSafety(safetyInput);
  const publicationEnabled = isBatteryV2PublicationEnabled();
  const userFacingSohPct =
    publicationEnabled && legacyPublicationSafety.decisionCapable
      ? publishedSohPct ?? null
      : null;
  return { userFacingSohPct, legacyPublicationSafety };
}

export function isLvPublishedSohCustomerVisible(
  legacyPublicationSafety: LegacyPublicationSafetyResult,
): boolean {
  return isBatteryV2PublicationEnabled() && legacyPublicationSafety.decisionCapable;
}
