import { DocumentClassificationPageMeta } from './document-classification.types';

export interface ClassificationTextSample {
  documentText: string;
  truncated: boolean;
  sampledPageNumbers: number[];
  omittedPageNumbers: number[];
}

type PageBlock = {
  pageNumber: number | null;
  text: string;
};

function formatPageBlock(block: PageBlock): string {
  const header = block.pageNumber != null ? `--- PAGE ${block.pageNumber} ---\n` : '';
  return `${header}${block.text}`;
}

/**
 * Builds a classification prompt excerpt from page blocks when available.
 * Prefers whole pages (first + last) instead of a blind head-only truncation.
 */
export function buildClassificationDocumentText(params: {
  fullText: string;
  pages?: DocumentClassificationPageMeta[];
  maxChars: number;
}): ClassificationTextSample {
  const { fullText, pages, maxChars } = params;
  const blocks: PageBlock[] = (pages ?? [])
    .filter((page) => page.text?.trim())
    .map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text!.trim(),
    }));

  if (blocks.length === 0) {
    const truncated = fullText.length > maxChars;
    return {
      documentText: truncated ? fullText.slice(0, maxChars) : fullText,
      truncated,
      sampledPageNumbers: [],
      omittedPageNumbers: [],
    };
  }

  const allPageNumbers = blocks
    .map((b) => b.pageNumber)
    .filter((n): n is number => n != null);

  const totalChars = blocks.reduce((sum, block) => sum + block.text.length, 0);
  if (totalChars <= maxChars) {
    return {
      documentText: blocks.map(formatPageBlock).join('\n\n'),
      truncated: false,
      sampledPageNumbers: allPageNumbers,
      omittedPageNumbers: [],
    };
  }

  const selected: PageBlock[] = [];
  const lastBlock = blocks[blocks.length - 1];
  const reserveForLast = Math.min(Math.floor(maxChars * 0.3), 8_000);
  let budget = maxChars - reserveForLast;

  for (let i = 0; i < blocks.length - 1; i++) {
    const block = blocks[i];
    const blockLen = block.text.length + (block.pageNumber != null ? 16 : 0);
    if (selected.length > 0 && budget - blockLen < 0) break;
    if (blockLen > budget && selected.length > 0) break;
    selected.push(block);
    budget -= blockLen;
  }

  if (lastBlock) {
    const alreadyHasLast = selected.some((b) => b.pageNumber === lastBlock.pageNumber && b.text === lastBlock.text);
    if (!alreadyHasLast) {
      const remaining = Math.max(0, maxChars - selected.reduce((sum, b) => sum + b.text.length + 24, 0));
      if (lastBlock.text.length <= remaining) {
        selected.push(lastBlock);
      } else if (remaining > 80) {
        selected.push({
          pageNumber: lastBlock.pageNumber,
          text: `${lastBlock.text.slice(0, remaining - 1)}…`,
        });
      }
    }
  }

  const sampledPageNumbers = [
    ...new Set(selected.map((b) => b.pageNumber).filter((n): n is number => n != null)),
  ].sort((a, b) => a - b);

  const omittedPageNumbers = allPageNumbers.filter((n) => !sampledPageNumbers.includes(n));

  return {
    documentText: selected.map(formatPageBlock).join('\n\n'),
    truncated: true,
    sampledPageNumbers,
    omittedPageNumbers,
  };
}
