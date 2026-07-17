import { Injectable } from '@nestjs/common';
import {
  buildEntityLinkSuggestions,
  type ArchiveEntityLinkSuggestion,
} from '../document-archive-extraction.rules';
import {
  DOCUMENT_ACTION_EXECUTION_STATUSES,
  DOCUMENT_EXECUTOR_ACTION_TYPES,
  type AcceptedEntityLink,
} from '../document-action.types';
import type { DocumentActionExecutor } from '../document-action-executor.interface';
import { DocumentActionBusinessError, DOCUMENT_ACTION_ERROR_CODES } from '../document-action.errors';

function readAcceptedEntityLinks(data: Record<string, unknown>): AcceptedEntityLink[] {
  const raw = data.acceptedEntityLinks;
  if (!Array.isArray(raw)) return [];

  const links: AcceptedEntityLink[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const entityType = typeof row.entityType === 'string' ? row.entityType.trim() : '';
    const entityId = typeof row.entityId === 'string' ? row.entityId.trim() : '';
    if (!entityType || !entityId) continue;
    links.push({
      entityType,
      entityId,
      label: typeof row.label === 'string' ? row.label : null,
    });
  }
  return links;
}

function resolveSuggestions(context: {
  confirmedData: Record<string, unknown>;
  planMetadata?: Record<string, unknown>;
}): ArchiveEntityLinkSuggestion[] {
  const fromPlan = context.planMetadata?.entityLinkSuggestions;
  if (Array.isArray(fromPlan) && fromPlan.length > 0) {
    return fromPlan as ArchiveEntityLinkSuggestion[];
  }
  return buildEntityLinkSuggestions(context.confirmedData);
}

function validateAcceptedLinks(
  accepted: AcceptedEntityLink[],
  suggestions: ArchiveEntityLinkSuggestion[],
): void {
  for (const link of accepted) {
    const suggestionMatch = suggestions.find(
      (row) =>
        row.explicitId === link.entityId ||
        (row.entityType === link.entityType && row.label === link.label),
    );
    const mentionedMatch = suggestions.some((row) => row.explicitId === link.entityId);
    if (!suggestionMatch && !mentionedMatch) {
      throw new DocumentActionBusinessError(
        DOCUMENT_ACTION_ERROR_CODES.BUSINESS_RULE_VIOLATION,
        `Accepted entity link is not supported by extraction suggestions: ${link.entityType}/${link.entityId}`,
        { link, suggestions },
      );
    }
  }
}

@Injectable()
export class LinkEntityDocumentActionExecutor implements DocumentActionExecutor<
  typeof DOCUMENT_EXECUTOR_ACTION_TYPES.SUGGEST_ENTITY_LINK
> {
  readonly actionType = DOCUMENT_EXECUTOR_ACTION_TYPES.SUGGEST_ENTITY_LINK;

  async execute(context: import('../document-action-executor.interface').DocumentActionExecutionContext) {
    if (context.priorResult?.status === DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED) {
      return context.priorResult;
    }

    const suggestions = resolveSuggestions({
      confirmedData: context.confirmedData,
      planMetadata: context.plan.metadata,
    });

    if (suggestions.length === 0) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SKIPPED,
        output: { reason: 'NO_ENTITY_LINK_SUGGESTIONS' },
      };
    }

    const accepted = readAcceptedEntityLinks(context.confirmedData);
    if (accepted.length === 0) {
      return {
        status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
        resultEntityType: 'entity_link_suggestions',
        resultEntityId: context.extractionId,
        output: {
          suggestionOnly: true,
          suggestions,
        },
      };
    }

    validateAcceptedLinks(accepted, suggestions);

    return {
      status: DOCUMENT_ACTION_EXECUTION_STATUSES.SUCCEEDED,
      resultEntityType: 'entity_link',
      resultEntityId: accepted[0]?.entityId ?? context.extractionId,
      output: {
        suggestionOnly: false,
        links: accepted,
        suggestions,
      },
    };
  }
}
