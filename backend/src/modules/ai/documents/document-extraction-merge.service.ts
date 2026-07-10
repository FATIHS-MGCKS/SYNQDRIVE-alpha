import { Injectable } from '@nestjs/common';
import { DocumentAiField } from './document-ai-extraction.types';
import { normalizeExtractedFieldValue } from './document-ai-extraction.schema.util';

export interface ChunkFieldCandidate {
  value: unknown;
  normalized: string;
  sourcePages: number[];
  chunkIndex: number;
}

export interface FieldExtractionEvidence {
  key: string;
  selectedValue: unknown;
  candidateValues: Array<{
    value: unknown;
    sourcePages: number[];
    chunkIndex: number;
  }>;
  sourcePages: number[];
  conflict: boolean;
}

export interface ChunkExtractionPayload {
  chunkIndex: number;
  pageNumbers: number[];
  fields: Record<string, unknown>;
  recommendedHumanReviewNotes: string[];
}

export interface DocumentExtractionMergeResult {
  fields: Record<string, unknown>;
  fieldEvidence: FieldExtractionEvidence[];
  conflicts: FieldExtractionEvidence[];
  recommendedHumanReviewNotes: string[];
}

/** Fields where conflicting values require mandatory human review (null selected). */
const CONFLICT_NULL_FIELDS = new Set([
  'odometerKm',
  'eventDate',
  'invoiceDate',
  'validUntil',
  'vin',
  'licensePlate',
]);

/** Fields where conflicting values are safety-critical blockers. */
const CONFLICT_BLOCKER_FIELDS = new Set(['odometerKm', 'vin']);

@Injectable()
export class DocumentExtractionMergeService {
  merge(
    schema: DocumentAiField[],
    chunkResults: ChunkExtractionPayload[],
  ): DocumentExtractionMergeResult {
    const byKey = new Map<string, ChunkFieldCandidate[]>();
    const notes = new Set<string>();

    for (const chunk of chunkResults) {
      for (const note of chunk.recommendedHumanReviewNotes) {
        if (note.trim()) notes.add(note.trim());
      }
      this.collectCandidates(schema, chunk, byKey);
    }

    const fieldEvidence: FieldExtractionEvidence[] = [];
    const conflicts: FieldExtractionEvidence[] = [];
    const fields: Record<string, unknown> = {};

    for (const field of schema) {
      const evidence = this.mergeField(field.key, byKey.get(field.key) ?? []);
      this.setNested(fields, field.key, evidence.selectedValue);
      fieldEvidence.push(evidence);
      if (evidence.conflict) {
        conflicts.push(evidence);
        const label = field.label || field.key;
        notes.add(
          `Conflicting values for "${label}" across document sections (pages: ${evidence.sourcePages.join(', ') || 'unknown'}) — please verify manually`,
        );
      }
    }

    return {
      fields,
      fieldEvidence,
      conflicts,
      recommendedHumanReviewNotes: [...notes].slice(0, 30),
    };
  }

  private collectCandidates(
    schema: DocumentAiField[],
    chunk: ChunkExtractionPayload,
    byKey: Map<string, ChunkFieldCandidate[]>,
  ): void {
    for (const field of schema) {
      const raw = this.readNested(chunk.fields, field.key);
      const normalized = this.normalizeForCompare(field, raw);
      if (normalized == null) continue;

      const list = byKey.get(field.key) ?? [];
      const existing = list.find(
        (c) => c.normalized === normalized && c.chunkIndex === chunk.chunkIndex,
      );
      if (existing) {
        existing.sourcePages = [
          ...new Set([...existing.sourcePages, ...chunk.pageNumbers]),
        ].sort((a, b) => a - b);
        continue;
      }
      list.push({
        value: raw,
        normalized,
        sourcePages: [...chunk.pageNumbers],
        chunkIndex: chunk.chunkIndex,
      });
      byKey.set(field.key, list);
    }
  }

  private mergeField(key: string, candidates: ChunkFieldCandidate[]): FieldExtractionEvidence {
    const candidateValues = candidates.map((c) => ({
      value: c.value,
      sourcePages: c.sourcePages,
      chunkIndex: c.chunkIndex,
    }));

    if (candidates.length === 0) {
      return {
        key,
        selectedValue: null,
        candidateValues: [],
        sourcePages: [],
        conflict: false,
      };
    }

    const distinct = [...new Set(candidates.map((c) => c.normalized))];
    const sourcePages = [
      ...new Set(candidates.flatMap((c) => c.sourcePages)),
    ].sort((a, b) => a - b);

    if (distinct.length === 1) {
      return {
        key,
        selectedValue: candidates[0].value,
        candidateValues,
        sourcePages,
        conflict: false,
      };
    }

    const conflict = true;
    const leafKey = key.split('.').pop() ?? key;
    const selectedValue = CONFLICT_NULL_FIELDS.has(leafKey)
      ? null
      : this.pickDeterministicWinner(candidates).value;

    return {
      key,
      selectedValue,
      candidateValues,
      sourcePages,
      conflict,
    };
  }

  /** Lowest page number first; tie-break by lowest chunk index; then lexicographic normalized value. */
  private pickDeterministicWinner(candidates: ChunkFieldCandidate[]): ChunkFieldCandidate {
    return [...candidates].sort((a, b) => {
      const pageA = a.sourcePages[0] ?? Number.MAX_SAFE_INTEGER;
      const pageB = b.sourcePages[0] ?? Number.MAX_SAFE_INTEGER;
      if (pageA !== pageB) return pageA - pageB;
      if (a.chunkIndex !== b.chunkIndex) return a.chunkIndex - b.chunkIndex;
      return a.normalized.localeCompare(b.normalized);
    })[0];
  }

  private normalizeForCompare(field: DocumentAiField, value: unknown): string | null {
    const normalized = normalizeExtractedFieldValue(value);
    if (normalized == null) return null;
    if (field.type === 'number' && typeof normalized === 'number') {
      return String(normalized);
    }
    if (typeof normalized === 'object') {
      return JSON.stringify(normalized);
    }
    return String(normalized).trim().toLowerCase();
  }

  private readNested(source: Record<string, unknown>, key: string): unknown {
    if (!key.includes('.')) return source[key];
    const [parent, child] = key.split('.');
    const obj = source[parent];
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
    return (obj as Record<string, unknown>)[child];
  }

  private setNested(target: Record<string, unknown>, key: string, value: unknown): void {
    if (!key.includes('.')) {
      target[key] = value;
      return;
    }
    const [parent, child] = key.split('.');
    const obj = (target[parent] as Record<string, unknown>) ?? {};
    obj[child] = value;
    target[parent] = obj;
  }

  isBlockerConflict(key: string): boolean {
    return CONFLICT_BLOCKER_FIELDS.has(key.split('.').pop() ?? key);
  }
}
