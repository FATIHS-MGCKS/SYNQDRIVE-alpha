import { BadRequestException } from '@nestjs/common';
import type { TaskType } from '@prisma/client';
import { checklistForType } from '../task-templates';
import type { TaskChecklistTemplateItem } from '../task-templates';

export interface TaskAutomationChecklistOverridePayload {
  /** Optional platform template titles to hide — only non-required items allowed. */
  hiddenOptionalTitles?: string[];
  /** Additional checklist rows appended after the platform template. */
  additionalItems?: Array<{
    title: string;
    description?: string;
    isRequired?: boolean;
  }>;
}

export interface TaskAutomationChecklistItemView {
  title: string;
  description?: string;
  sortOrder: number;
  isRequired: boolean;
  source: 'PLATFORM_DEFAULT' | 'ORG_OVERRIDE';
  hidden?: boolean;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

export function parseChecklistOverridePayload(
  value: unknown,
): TaskAutomationChecklistOverridePayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const hiddenOptionalTitles = Array.isArray(raw.hiddenOptionalTitles)
    ? raw.hiddenOptionalTitles.filter((item): item is string => typeof item === 'string')
    : undefined;
  const additionalItems = Array.isArray(raw.additionalItems)
    ? raw.additionalItems
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => ({
          title: String(item.title ?? '').trim(),
          description:
            typeof item.description === 'string' ? item.description.trim() : undefined,
          isRequired: item.isRequired === true,
        }))
        .filter((item) => item.title.length > 0)
    : undefined;

  if (!hiddenOptionalTitles?.length && !additionalItems?.length) {
    return null;
  }

  return { hiddenOptionalTitles, additionalItems };
}

export function validateChecklistOverridePayload(
  taskType: TaskType | null,
  payload: TaskAutomationChecklistOverridePayload | null,
): void {
  if (!payload || !taskType) return;

  const platformItems = checklistForType(taskType);
  const requiredTitles = new Set(
    platformItems.filter((item) => item.isRequired).map((item) => normalizeTitle(item.title)),
  );
  const optionalTitles = new Set(
    platformItems.filter((item) => !item.isRequired).map((item) => normalizeTitle(item.title)),
  );
  const allTitles = new Set(platformItems.map((item) => normalizeTitle(item.title)));

  for (const hidden of payload.hiddenOptionalTitles ?? []) {
    const normalized = normalizeTitle(hidden);
    if (requiredTitles.has(normalized)) {
      throw new BadRequestException(
        `Pflichtpunkt "${hidden}" darf nicht aus der Checkliste entfernt werden`,
      );
    }
    if (!optionalTitles.has(normalized)) {
      throw new BadRequestException(`Unbekannter Checklistenpunkt "${hidden}"`);
    }
  }

  const seenAdditional = new Set<string>();
  for (const item of payload.additionalItems ?? []) {
    const normalized = normalizeTitle(item.title);
    if (allTitles.has(normalized)) {
      throw new BadRequestException(
        `Zusätzlicher Punkt "${item.title}" kollidiert mit dem SynqDrive-Standard`,
      );
    }
    if (seenAdditional.has(normalized)) {
      throw new BadRequestException(`Doppelter zusätzlicher Punkt "${item.title}"`);
    }
    seenAdditional.add(normalized);
  }
}

export function buildEffectiveChecklistItems(input: {
  taskType: TaskType | null;
  checklistOverrides: Record<string, unknown> | null;
}): {
  platformItems: TaskAutomationChecklistItemView[];
  effectiveItems: TaskAutomationChecklistItemView[];
  hasOverride: boolean;
} {
  if (!input.taskType) {
    return { platformItems: [], effectiveItems: [], hasOverride: false };
  }

  const platformTemplate = checklistForType(input.taskType);
  const override = parseChecklistOverridePayload(input.checklistOverrides);
  const hidden = new Set(
    (override?.hiddenOptionalTitles ?? []).map((title) => normalizeTitle(title)),
  );

  const platformItems: TaskAutomationChecklistItemView[] = platformTemplate.map(
    (item: TaskChecklistTemplateItem) => ({
      title: item.title,
      description: item.description,
      sortOrder: item.sortOrder,
      isRequired: item.isRequired,
      source: 'PLATFORM_DEFAULT' as const,
      hidden: !item.isRequired && hidden.has(normalizeTitle(item.title)),
    }),
  );

  const visiblePlatform = platformItems.filter((item) => !item.hidden);
  const additional =
    override?.additionalItems?.map((item, index) => ({
      title: item.title,
      description: item.description,
      sortOrder: platformTemplate.length + index,
      isRequired: item.isRequired ?? false,
      source: 'ORG_OVERRIDE' as const,
    })) ?? [];

  return {
    platformItems,
    effectiveItems: [...visiblePlatform, ...additional],
    hasOverride: Boolean(override),
  };
}
