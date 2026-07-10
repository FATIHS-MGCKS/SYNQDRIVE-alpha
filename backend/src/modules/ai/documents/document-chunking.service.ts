import { Injectable } from '@nestjs/common';
import { DocumentPageBlock } from '@modules/document-extraction/document-page.types';
import { estimateMistralTokens } from './document-token-estimate.util';
import {
  DocumentChunkingInput,
  DocumentChunkingLimits,
  DocumentChunkingResult,
  DocumentTextChunk,
} from './document-chunking.types';

interface PageUnit {
  blockIndex: number;
  pageNumber: number | null;
  text: string;
  chars: number;
  pageBoundaryReliable: boolean;
}

interface PackedChunkDraft {
  units: PageUnit[];
  text: string;
  chars: number;
}

/**
 * Page-aware document chunking for LLM extraction.
 * Prefers keeping pages intact, avoids splitting markdown tables, and never silently truncates.
 */
@Injectable()
export class DocumentChunkingService {
  chunk(input: DocumentChunkingInput): DocumentChunkingResult {
    const warnings: string[] = [];
    const limits = input.limits;
    const units = this.buildUnits(input.pages, limits);

    if (units.length === 0) {
      return {
        chunks: [],
        totalPages: 0,
        totalChars: 0,
        limitExceeded: true,
        limitCode: 'MAX_CHARS',
        limitMessage: 'Document contains no extractable text',
        uncoveredPageNumbers: [],
        warnings,
      };
    }

    const numberedPages = units
      .map((u) => u.pageNumber)
      .filter((n): n is number => n != null);
    const totalPages = numberedPages.length > 0 ? Math.max(...numberedPages) : units.length;
    const totalChars = units.reduce((sum, u) => sum + u.chars, 0);

    if (numberedPages.length > limits.maxPages) {
      return {
        chunks: [],
        totalPages,
        totalChars,
        limitExceeded: true,
        limitCode: 'MAX_PAGES',
        limitMessage: `Document has ${numberedPages.length} pages which exceeds the maximum of ${limits.maxPages}`,
        uncoveredPageNumbers: [...new Set(numberedPages)].sort((a, b) => a - b),
        warnings,
      };
    }

    let drafts = this.packUnits(units, limits);

    if (drafts.length > limits.maxChunks) {
      const { selected, uncovered } = this.selectChunksWithinLimit(drafts, limits.maxChunks);
      drafts = selected;
      warnings.push(
        `Document required ${this.packUnits(units, limits).length} chunks but only ${limits.maxChunks} are allowed — some pages were not sent to the model`,
      );
      return this.finalize(drafts, totalPages, totalChars, true, 'MAX_CHUNKS', warnings, uncovered);
    }

    return this.finalize(drafts, totalPages, totalChars, false, undefined, warnings, []);
  }

  private buildUnits(pages: DocumentPageBlock[], limits: DocumentChunkingLimits): PageUnit[] {
    const units: PageUnit[] = [];
    pages.forEach((page, blockIndex) => {
      const trimmed = page.text.trim();
      if (!trimmed) return;

      if (trimmed.length <= limits.maxChars) {
        units.push({
          blockIndex,
          pageNumber: page.pageNumber,
          text: trimmed,
          chars: trimmed.length,
          pageBoundaryReliable: page.hasReliablePageBoundaries,
        });
        return;
      }

      for (const part of this.splitLargePage(trimmed, limits)) {
        units.push({
          blockIndex,
          pageNumber: page.pageNumber,
          text: part.text,
          chars: part.text.length,
          pageBoundaryReliable: page.hasReliablePageBoundaries,
        });
      }
    });
    return units;
  }

  private packUnits(units: PageUnit[], limits: DocumentChunkingLimits): PackedChunkDraft[] {
    const drafts: PackedChunkDraft[] = [];
    let current: PageUnit[] = [];
    let currentChars = 0;

    const flush = () => {
      if (current.length === 0) return;
      const text = current.map((u) => u.text).join('\n\n');
      drafts.push({ units: [...current], text, chars: text.length });
      current = [];
      currentChars = 0;
    };

    for (const unit of units) {
      const separator = current.length > 0 ? 2 : 0;
      const projected = currentChars + separator + unit.chars;

      if (current.length > 0 && projected > limits.targetChars) {
        flush();
      }

      if (unit.chars > limits.maxChars) {
        flush();
        for (const part of this.splitLargePage(unit.text, limits)) {
          drafts.push({
            units: [{ ...unit, text: part.text, chars: part.text.length }],
            text: part.text,
            chars: part.text.length,
          });
        }
        continue;
      }

      current.push(unit);
      currentChars = current.map((u) => u.text).join('\n\n').length;
    }

    flush();
    return drafts;
  }

  /**
   * Deterministic selection when chunk budget is exceeded:
   * first chunk, last chunk, then evenly spaced middle chunks.
   */
  private selectChunksWithinLimit(
    drafts: PackedChunkDraft[],
    maxChunks: number,
  ): { selected: PackedChunkDraft[]; uncovered: number[] } {
    if (drafts.length <= maxChunks) {
      return { selected: drafts, uncovered: [] };
    }

    const indexes = new Set<number>();
    indexes.add(0);
    indexes.add(drafts.length - 1);
    const remaining = maxChunks - indexes.size;
    if (remaining > 0) {
      for (let i = 1; i <= remaining; i++) {
        const pos = Math.round((i * (drafts.length - 1)) / (remaining + 1));
        indexes.add(pos);
      }
    }

    const selectedIndexes = [...indexes].sort((a, b) => a - b).slice(0, maxChunks);
    const selected = selectedIndexes.map((i) => drafts[i]);
    const uncovered = this.collectUncoveredPageNumbers(drafts, selectedIndexes);
    return { selected, uncovered };
  }

  private collectUncoveredPageNumbers(
    drafts: PackedChunkDraft[],
    selectedIndexes: number[],
  ): number[] {
    const selected = new Set(selectedIndexes);
    const uncovered = new Set<number>();
    drafts.forEach((draft, idx) => {
      if (selected.has(idx)) return;
      for (const unit of draft.units) {
        if (unit.pageNumber != null) uncovered.add(unit.pageNumber);
      }
    });
    return [...uncovered].sort((a, b) => a - b);
  }

  private splitLargePage(
    text: string,
    limits: DocumentChunkingLimits,
  ): Array<{ text: string }> {
    const blocks = this.splitPreservingTables(text);
    const parts: string[] = [];
    let buf = '';

    const flush = () => {
      if (buf.trim()) parts.push(buf.trim());
      buf = '';
    };

    for (const block of blocks) {
      const candidate = buf ? `${buf}\n\n${block}` : block;
      if (candidate.length > limits.maxChars && buf) {
        flush();
      }
      if (block.length > limits.maxChars) {
        flush();
        let offset = 0;
        while (offset < block.length) {
          const sliceEnd = Math.min(offset + limits.maxChars, block.length);
          let end = sliceEnd;
          if (sliceEnd < block.length) {
            const nl = block.lastIndexOf('\n', sliceEnd);
            if (nl > offset + limits.maxChars * 0.5) end = nl;
          }
          const piece = block.slice(offset, end).trim();
          if (piece) parts.push(piece);
          offset = end;
          if (limits.overlapChars > 0 && offset < block.length) {
            offset = Math.max(offset - limits.overlapChars, offset);
          }
        }
        continue;
      }
      buf = candidate;
    }
    flush();

    if (parts.length === 0 && text.trim()) {
      return [{ text: text.trim() }];
    }
    return parts.map((t) => ({ text: t }));
  }

  /** Split text on paragraph boundaries while keeping markdown table blocks intact. */
  private splitPreservingTables(text: string): string[] {
    const lines = text.split('\n');
    const blocks: string[] = [];
    let buf: string[] = [];
    let inTable = false;

    const flush = () => {
      if (buf.length) {
        blocks.push(buf.join('\n'));
        buf = [];
      }
    };

    for (const line of lines) {
      const isTableLine = /^\s*\|.*\|\s*$/.test(line) || /^\s*\|[-:| ]+\|\s*$/.test(line);
      if (isTableLine) {
        inTable = true;
        buf.push(line);
        continue;
      }
      if (inTable) {
        flush();
        inTable = false;
      }
      if (!line.trim()) {
        flush();
        continue;
      }
      buf.push(line);
    }
    flush();
    return blocks.length > 0 ? blocks : [text];
  }

  private finalize(
    drafts: PackedChunkDraft[],
    totalPages: number,
    totalChars: number,
    limitExceeded: boolean,
    limitCode: DocumentChunkingResult['limitCode'],
    warnings: string[],
    uncoveredPageNumbers: number[],
  ): DocumentChunkingResult {
    const chunks: DocumentTextChunk[] = drafts.map((draft, chunkIndex) => {
      const pageNumbers = [
        ...new Set(
          draft.units
            .map((u) => u.pageNumber)
            .filter((n): n is number => n != null),
        ),
      ].sort((a, b) => a - b);
      return {
        chunkIndex,
        text: draft.text,
        pageNumbers,
        blockIndexes: [...new Set(draft.units.map((u) => u.blockIndex))].sort((a, b) => a - b),
        estimatedTokens: estimateMistralTokens(draft.text),
        pageBoundaryReliable: draft.units.every((u) => u.pageBoundaryReliable),
      };
    });

    return {
      chunks,
      totalPages,
      totalChars,
      limitExceeded,
      limitCode,
      limitMessage: limitExceeded
        ? warnings[warnings.length - 1] ?? 'Document chunk limit exceeded'
        : undefined,
      uncoveredPageNumbers,
      warnings,
    };
  }

  private defaultLimits(): DocumentChunkingLimits {
    return {
      targetChars: 6000,
      maxChars: 8000,
      maxPages: 200,
      maxChunks: 12,
      overlapChars: 0,
    };
  }
}
