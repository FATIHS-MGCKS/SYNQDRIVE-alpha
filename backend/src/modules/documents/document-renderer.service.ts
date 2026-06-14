import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  DocumentRenderer,
  DocumentRenderInput,
  RenderableDocument,
  RenderSection,
  RenderTableColumn,
} from './renderers/render-model';

const PAGE = { size: 'A4' as const, margin: 48 };
const COLORS = {
  text: '#1f2933',
  muted: '#6b7280',
  line: '#d1d5db',
  accent: '#111827',
  heading: '#111827',
  zebra: '#f3f4f6',
};

/**
 * Default renderer: pure-JS PDF generation via pdfkit (no headless browser).
 *
 * Produces clean, professional A4 documents: company header, optional party
 * blocks, a meta grid, then a stack of structured sections (key/values, tables,
 * totals, paragraphs, legal references, signatures) and a footer. Manual
 * page-break checks keep tables and signature blocks from splitting awkwardly.
 *
 * Bound to the DOCUMENT_RENDERER token — a future Chromium/HTML renderer can
 * replace it without touching templates or services.
 */
@Injectable()
export class DocumentRendererService implements DocumentRenderer {
  private readonly logger = new Logger(DocumentRendererService.name);

  async renderPdf(input: DocumentRenderInput): Promise<Buffer> {
    const { document } = input;
    const doc = new PDFDocument({
      size: PAGE.size,
      margin: PAGE.margin,
      info: { Title: document.documentTitle },
      autoFirstPage: true,
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolveBuf, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolveBuf(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    try {
      this.drawHeader(doc, document);
      this.drawTitle(doc, document);
      if (document.parties?.length) this.drawParties(doc, document);
      if (document.meta?.length) this.drawMeta(doc, document.meta);
      for (const section of document.sections) {
        this.drawSection(doc, section);
      }
      this.drawFooter(doc, document);
    } catch (err) {
      this.logger.warn(`Render error for ${input.documentType}: ${(err as Error).message}`);
      // Still finalise so the buffer is valid rather than hanging.
    }

    doc.end();
    return done;
  }

  // ── layout helpers ───────────────────────────────────────────────────────

  private get left() {
    return PAGE.margin;
  }

  private contentWidth(doc: PDFKit.PDFDocument): number {
    return doc.page.width - PAGE.margin * 2;
  }

  private bottom(doc: PDFKit.PDFDocument): number {
    return doc.page.height - PAGE.margin;
  }

  private ensureSpace(doc: PDFKit.PDFDocument, height: number): void {
    if (doc.y + height > this.bottom(doc)) {
      doc.addPage();
    }
  }

  private drawHeader(doc: PDFKit.PDFDocument, d: RenderableDocument): void {
    const startY = doc.y;
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(COLORS.accent)
      .text(d.org.name || 'SynqDrive', this.left, startY, { width: this.contentWidth(doc) * 0.6 });

    const rightLines = [...d.org.addressLines, ...d.org.contactLines].filter(Boolean);
    if (d.org.taxId) rightLines.push(`USt-IdNr.: ${d.org.taxId}`);
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
    const rightWidth = this.contentWidth(doc) * 0.38;
    const rightX = doc.page.width - PAGE.margin - rightWidth;
    doc.text(rightLines.join('\n'), rightX, startY, { width: rightWidth, align: 'right' });

    const y = Math.max(doc.y, startY) + 8;
    doc.moveTo(this.left, y).lineTo(doc.page.width - PAGE.margin, y).strokeColor(COLORS.line).lineWidth(1).stroke();
    doc.y = y + 14;
  }

  private drawTitle(doc: PDFKit.PDFDocument, d: RenderableDocument): void {
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.heading);
    doc.text(d.documentTitle, this.left, y, { width: this.contentWidth(doc) * 0.62 });

    const metaLines: string[] = [];
    if (d.documentNumber) metaLines.push(`Nr.: ${d.documentNumber}`);
    if (d.documentDate) metaLines.push(`Datum: ${d.documentDate}`);
    if (metaLines.length) {
      doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted);
      const w = this.contentWidth(doc) * 0.36;
      doc.text(metaLines.join('\n'), doc.page.width - PAGE.margin - w, y, { width: w, align: 'right' });
    }
    doc.y = Math.max(doc.y, y) + 14;
    doc.x = this.left;
  }

  private drawParties(doc: PDFKit.PDFDocument, d: RenderableDocument): void {
    const parties = d.parties!.slice(0, 2);
    const colW = (this.contentWidth(doc) - 20) / parties.length;
    const startY = doc.y;
    let maxY = startY;
    parties.forEach((p, i) => {
      const x = this.left + i * (colW + 20);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.muted).text(p.heading.toUpperCase(), x, startY, { width: colW });
      doc.font('Helvetica').fontSize(10).fillColor(COLORS.text).text(p.lines.filter(Boolean).join('\n') || '—', x, doc.y + 2, { width: colW });
      maxY = Math.max(maxY, doc.y);
    });
    doc.y = maxY + 14;
    doc.x = this.left;
  }

  private drawMeta(doc: PDFKit.PDFDocument, rows: { label: string; value: string }[]): void {
    const colCount = 2;
    const gap = 16;
    const colW = (this.contentWidth(doc) - gap) / colCount;
    let i = 0;
    while (i < rows.length) {
      this.ensureSpace(doc, 18);
      const rowY = doc.y;
      for (let c = 0; c < colCount && i < rows.length; c++, i++) {
        const x = this.left + c * (colW + gap);
        const r = rows[i];
        doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.muted).text(`${r.label}: `, x, rowY, { continued: true, width: colW });
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.text).text(r.value || '—');
      }
      doc.y = rowY + 16;
      doc.x = this.left;
    }
    doc.moveDown(0.4);
  }

  private drawSectionHeading(doc: PDFKit.PDFDocument, heading?: string): void {
    if (!heading) return;
    this.ensureSpace(doc, 24);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.heading).text(heading, this.left, doc.y, { width: this.contentWidth(doc) });
    doc.y += 4;
    doc.x = this.left;
  }

  private drawSection(doc: PDFKit.PDFDocument, section: RenderSection): void {
    switch (section.kind) {
      case 'keyValues':
        this.drawSectionHeading(doc, section.heading);
        this.drawMeta(doc, section.rows.map((r) => ({ label: r.label, value: r.value })));
        break;
      case 'table':
        this.drawSectionHeading(doc, section.heading);
        this.drawTable(doc, section.columns, section.rows);
        break;
      case 'totals':
        this.drawSectionHeading(doc, section.heading);
        this.drawTotals(doc, section.rows);
        break;
      case 'paragraph':
        this.drawSectionHeading(doc, section.heading);
        this.ensureSpace(doc, 28);
        doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.text).text(section.text, this.left, doc.y, {
          width: this.contentWidth(doc),
          align: 'left',
          lineGap: 2,
        });
        doc.moveDown(0.6);
        doc.x = this.left;
        break;
      case 'note':
        this.drawNote(doc, section.text);
        break;
      case 'legalRefs':
        this.drawSectionHeading(doc, section.heading);
        this.drawMeta(doc, section.items.map((r) => ({ label: r.label, value: r.value })));
        break;
      case 'signatures':
        this.drawSignatures(doc, section);
        break;
    }
  }

  private drawTable(doc: PDFKit.PDFDocument, columns: RenderTableColumn[], rows: string[][]): void {
    const totalWeight = columns.reduce((s, c) => s + (c.width ?? 1), 0);
    const widths = columns.map((c) => ((c.width ?? 1) / totalWeight) * this.contentWidth(doc));
    const padX = 6;

    const drawRow = (cells: string[], opts: { header?: boolean; zebra?: boolean }) => {
      const font = opts.header ? 'Helvetica-Bold' : 'Helvetica';
      const fontSize = opts.header ? 8.5 : 9;
      doc.font(font).fontSize(fontSize);
      // measure tallest cell
      let rowH = 0;
      cells.forEach((cell, i) => {
        const h = doc.heightOfString(cell || '', { width: widths[i] - padX * 2 });
        rowH = Math.max(rowH, h);
      });
      rowH += 8;
      this.ensureSpace(doc, rowH);
      const y = doc.y;
      if (opts.header) {
        doc.rect(this.left, y, this.contentWidth(doc), rowH).fill('#111827');
      } else if (opts.zebra) {
        doc.rect(this.left, y, this.contentWidth(doc), rowH).fill(COLORS.zebra);
      }
      let x = this.left;
      cells.forEach((cell, i) => {
        doc
          .fillColor(opts.header ? '#ffffff' : COLORS.text)
          .font(font)
          .fontSize(fontSize)
          .text(cell || '', x + padX, y + 4, {
            width: widths[i] - padX * 2,
            align: columns[i].align ?? 'left',
          });
        x += widths[i];
      });
      doc.y = y + rowH;
      doc.x = this.left;
    };

    drawRow(columns.map((c) => c.header), { header: true });
    rows.forEach((r, idx) => drawRow(r, { zebra: idx % 2 === 1 }));
    doc.moveDown(0.5);
  }

  private drawTotals(doc: PDFKit.PDFDocument, rows: { label: string; value: string; emphasize?: boolean }[]): void {
    const boxW = this.contentWidth(doc) * 0.5;
    const x = doc.page.width - PAGE.margin - boxW;
    rows.forEach((r) => {
      this.ensureSpace(doc, 18);
      const y = doc.y;
      const font = r.emphasize ? 'Helvetica-Bold' : 'Helvetica';
      const size = r.emphasize ? 11 : 9.5;
      if (r.emphasize) {
        doc.moveTo(x, y - 2).lineTo(x + boxW, y - 2).strokeColor(COLORS.line).lineWidth(0.5).stroke();
      }
      doc.font(font).fontSize(size).fillColor(COLORS.text).text(r.label, x, y + 2, { width: boxW * 0.6 });
      doc.font(font).fontSize(size).fillColor(r.emphasize ? COLORS.accent : COLORS.text).text(r.value, x + boxW * 0.6, y + 2, { width: boxW * 0.4, align: 'right' });
      doc.y = y + (r.emphasize ? 20 : 16);
      doc.x = this.left;
    });
    doc.moveDown(0.4);
  }

  private drawNote(doc: PDFKit.PDFDocument, text: string): void {
    doc.font('Helvetica-Oblique').fontSize(8.5);
    const h = doc.heightOfString(text, { width: this.contentWidth(doc) - 16 }) + 12;
    this.ensureSpace(doc, h);
    const y = doc.y;
    doc.rect(this.left, y, this.contentWidth(doc), h).fill('#f9fafb');
    doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8.5).text(text, this.left + 8, y + 6, { width: this.contentWidth(doc) - 16 });
    doc.y = y + h + 6;
    doc.x = this.left;
  }

  private drawSignatures(doc: PDFKit.PDFDocument, section: { heading?: string; signatures: { label: string; name?: string | null; dataUrl?: string | null }[] }): void {
    this.drawSectionHeading(doc, section.heading ?? 'Unterschriften');
    const sigs = section.signatures.slice(0, 2);
    if (!sigs.length) return;
    const gap = 24;
    const colW = (this.contentWidth(doc) - gap) / sigs.length;
    const boxH = 64;
    this.ensureSpace(doc, boxH + 30);
    const startY = doc.y;
    sigs.forEach((s, i) => {
      const x = this.left + i * (colW + gap);
      const img = this.decodeSignature(s.dataUrl);
      if (img) {
        try {
          doc.image(img, x, startY, { fit: [colW, boxH] });
        } catch {
          /* ignore invalid image data */
        }
      }
      const lineY = startY + boxH + 4;
      doc.moveTo(x, lineY).lineTo(x + colW, lineY).strokeColor(COLORS.line).lineWidth(0.8).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted).text(`${s.label}${s.name ? ` — ${s.name}` : ''}`, x, lineY + 4, { width: colW });
    });
    doc.y = startY + boxH + 28;
    doc.x = this.left;
  }

  private decodeSignature(dataUrl?: string | null): Buffer | null {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const match = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
    if (!match) return null;
    try {
      const buf = Buffer.from(match[2], 'base64');
      // Guard against absurdly large embedded signatures.
      if (buf.length > 2 * 1024 * 1024) return null;
      return buf;
    } catch {
      return null;
    }
  }

  private drawFooter(doc: PDFKit.PDFDocument, d: RenderableDocument): void {
    const lines = (d.footerLines ?? []).filter(Boolean);
    const range = doc.bufferedPageRange?.() ?? { start: 0, count: 1 };
    for (let i = range.start; i < range.start + range.count; i++) {
      try {
        doc.switchToPage(i);
      } catch {
        continue;
      }
      const y = doc.page.height - PAGE.margin + 8;
      doc.moveTo(this.left, y).lineTo(doc.page.width - PAGE.margin, y).strokeColor(COLORS.line).lineWidth(0.5).stroke();
      const footerText = lines.length ? lines.join('  ·  ') : d.org.name;
      doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text(footerText, this.left, y + 4, {
        width: this.contentWidth(doc),
        align: 'center',
        lineBreak: false,
      });
    }
  }
}
