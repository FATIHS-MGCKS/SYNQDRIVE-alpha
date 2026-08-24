import type { ReactElement } from 'react';
import { escapeHtml } from './safe-markdown.utils';

function renderBoldSegments(text: string): (string | ReactElement)[] {
  const parts: (string | ReactElement)[] = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={`b-${key++}`}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export interface SafeMarkdownOptions {
  isDarkMode?: boolean;
}

export function renderSafeMarkdown(
  text: string,
  options: SafeMarkdownOptions = {},
): ReactElement[] {
  const { isDarkMode = false } = options;
  const textWrapClass = 'min-w-0 break-words [overflow-wrap:anywhere]';
  const safeText = escapeHtml(text);
  const lines = safeText.split('\n');
  const elements: ReactElement[] = [];
  let tableMode = false;
  let tableRows: string[][] = [];
  let tableHeaders: string[] = [];

  const flushTable = () => {
    if (tableHeaders.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} className="my-3 overflow-x-auto">
          <table className="w-full text-xs text-foreground">
            <thead>
              <tr className={isDarkMode ? 'border-b border-neutral-700' : 'border-b border-border'}>
                {tableHeaders.map((h, i) => (
                  <th
                    key={i}
                    className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground"
                  >
                    {h.trim()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, ri) => (
                <tr
                  key={ri}
                  className={isDarkMode ? 'border-b border-neutral-800' : 'border-b border-border'}
                >
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-xs">
                      {cell.trim()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    }
    tableHeaders = [];
    tableRows = [];
    tableMode = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.split('|').filter((c) => c.trim() !== '');
      if (!tableMode) {
        tableMode = true;
        tableHeaders = cells;
        continue;
      }
      if (cells.every((c) => /^[-:]+$/.test(c.trim()))) continue;
      tableRows.push(cells);
      continue;
    } else if (tableMode) {
      flushTable();
    }

    if (!line.trim()) {
      elements.push(<div key={`br-${i}`} className="h-2" aria-hidden="true" />);
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const content = line.replace(/^\d+\.\s/, '');
      const number = line.match(/^\d+/)?.[0] ?? '';
      elements.push(
        <div key={`li-${i}`} className={`flex gap-2 ml-1 mb-1 min-w-0 ${textWrapClass}`}>
          <span className="text-xs shrink-0 text-muted-foreground">
            {number}.
          </span>
          <span className="text-[10px] min-w-0 break-words [overflow-wrap:anywhere]">
            {renderBoldSegments(content)}
          </span>
        </div>,
      );
      continue;
    }

    if (line.startsWith('- ')) {
      const content = line.slice(2);
      elements.push(
        <div key={`bullet-${i}`} className={`flex gap-2 ml-1 mb-1 min-w-0 ${textWrapClass}`}>
          <span
            className={`text-xs shrink-0 mt-1 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`}
            aria-hidden="true"
          >
            •
          </span>
          <span className="text-[10px] min-w-0 break-words [overflow-wrap:anywhere]">
            {renderBoldSegments(content)}
          </span>
        </div>,
      );
      continue;
    }

    elements.push(
      <p key={`p-${i}`} className={`text-xs mb-1 min-w-0 break-words [overflow-wrap:anywhere]`}>
        {renderBoldSegments(line)}
      </p>,
    );
  }

  if (tableMode) flushTable();

  return elements;
}
