import { Injectable } from '@nestjs/common';
import type {
  FleetChatEvidenceApiResponse,
  FleetChatEvidenceComposeInput,
  FleetChatEvidencePrepareResult,
} from './fleet-chat-evidence-response.types';
import {
  composeFleetChatEvidenceResponse,
  finalizeFleetChatEvidenceResponse,
  prepareFleetChatEvidenceResponse,
} from './fleet-chat-evidence-response.composer';

@Injectable()
export class FleetChatEvidenceResponseComposerService {
  prepare(input: FleetChatEvidenceComposeInput): FleetChatEvidencePrepareResult {
    return prepareFleetChatEvidenceResponse(input);
  }

  finalize(
    input: FleetChatEvidenceComposeInput,
    responseType: FleetChatEvidencePrepareResult['responseType'],
    llmRawText: string | null,
  ): FleetChatEvidenceApiResponse {
    return finalizeFleetChatEvidenceResponse(input, responseType, llmRawText);
  }

  compose(input: FleetChatEvidenceComposeInput): FleetChatEvidenceApiResponse {
    return composeFleetChatEvidenceResponse(input);
  }
}
