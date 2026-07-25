import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  WorkflowAiCommunicationFact,
  WorkflowAiLlmStructuredOutput,
} from './workflow-ai-communication.types';
import { WorkflowAiCommunicationSafetyService } from './workflow-ai-communication-safety.service';

@Injectable()
export class WorkflowAiCommunicationFactCheckService {
  constructor(private readonly safety: WorkflowAiCommunicationSafetyService) {}

  validate(params: {
    output: WorkflowAiLlmStructuredOutput;
    facts: WorkflowAiCommunicationFact[];
    verifiedDiagnosis?: boolean;
    eventType: string;
  }): { passed: boolean; reason?: string } {
    const factIds = new Set(params.facts.map((f) => f.id));
    const unknownCitations = (params.output.citedFactIds ?? []).filter((id) => !factIds.has(id));
    if (unknownCitations.length > 0) {
      return {
        passed: false,
        reason: `AI cited unknown fact ids: ${unknownCitations.join(', ')}`,
      };
    }

    if ((params.output.citedFactIds?.length ?? 0) === 0 && params.facts.length > 0) {
      return { passed: false, reason: 'AI message must cite at least one structured fact' };
    }

    if (params.output.claimsDiagnosis && !params.verifiedDiagnosis) {
      return {
        passed: false,
        reason: 'AI claimed technical diagnosis without verifiedDiagnosis=true',
      };
    }

    if (
      params.eventType.startsWith('vehicle.health')
      && this.safety.detectUnsafeDiagnosisLanguage(params.output.message)
      && !params.verifiedDiagnosis
    ) {
      return {
        passed: false,
        reason: 'Message contains unverified diagnostic language for vehicle health event',
      };
    }

    if (params.output.claimsCertainty && !params.verifiedDiagnosis) {
      return {
        passed: false,
        reason: 'AI expressed certainty without verified facts',
      };
    }

    return { passed: true };
  }

  assertPassed(result: { passed: boolean; reason?: string }): void {
    if (!result.passed) {
      throw new BadRequestException(result.reason ?? 'AI fact check failed');
    }
  }
}
