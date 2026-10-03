import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  LevelFormat,
  BorderStyle,
} from 'docx';

/**
 * Document forge for Jarvis (Phase 7.2): renders lightweight markdown into PDF or DOCX.
 * Supported markdown: "#", "##", "###" headings, "-" / "*" bullets, "1." numbered items,
 * "---" dividers, blank-line paragraphs, and inline **bold**, *italic*, `code`.
 */

const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;

/**
 * Splits a line into styled runs: { text, bold, italic, code }.
 */
function parseInline(text) {
  const runs = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    if (match.index > lastIndex) runs.push({ text: text.slice(lastIndex, match.index) });
    const token = match[0];
    if (token.startsWith('**')) runs.push({ text: token.slice(2, -2), bold: true });
    else if (token.startsWith('`')) runs.push({ text: token.slice(1, -1), code: true });
    else runs.push({ text: token.slice(1, -1), italic: true });
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) runs.push({ text: text.slice(lastIndex) });
  return runs.filter((run) => run.text.length > 0);
}

/**
 * Parses markdown into blocks: heading | paragraph | bullet | numbered | divider.
 */
export function parseMarkdown(markdown) {
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', runs: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };

  for (const rawLine of String(markdown || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    let match;

    if (!line) {
      flushParagraph();
    } else if ((match = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushParagraph();
      blocks.push({ type: 'heading', level: match[1].length, runs: parseInline(match[2]) });
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushParagraph();
      blocks.push({ type: 'divider' });
    } else if ((match = line.match(/^[-*•]\s+(.*)$/))) {
      flushParagraph();
      blocks.push({ type: 'bullet', runs: parseInline(match[1]) });
    } else if ((match = line.match(/^(\d+)[.)]\s+(.*)$/))) {
      flushParagraph();
      blocks.push({ type: 'numbered', number: Number(match[1]), runs: parseInline(match[2]) });
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}

// ---------------------------------------------------------------------------
// PDF (pdf-lib, standard fonts)
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28; // A4
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const BODY_SIZE = 11;
const HEADING_SIZES = { 1: 20, 2: 16, 3: 13 };
const LIST_INDENT = 18;
const TEXT_COLOR = rgb(0.1, 0.12, 0.16);
const ACCENT_COLOR = rgb(0, 0.45, 0.55);

// ASCII stand-ins for common symbols outside the WinAnsi character set
const TRANSLITERATIONS = { '→': '->', '←': '<-', '⇒': '=>', '≥': '>=', '≤': '<=', '≠': '!=', '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x' };

/**
 * Standard PDF fonts only cover WinAnsi: transliterate common symbols, drop emoji, and swap
 * anything else for "?" instead of throwing.
 */
function makeSanitizer(font) {
  const supported = new Map();
  return (text) =>
    Array.from(text.replace(/\p{Extended_Pictographic}\uFE0F?/gu, ''), (char) => TRANSLITERATIONS[char] ?? char)
      .map((char) => {
        if (!supported.has(char)) {
          try {
            font.encodeText(char);
            supported.set(char, true);
          } catch {
            supported.set(char, false);
          }
        }
        return supported.get(char) ? char : '?';
      })
      .join('');
}

export async function renderPdf({ title, markdown }) {
  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    code: await pdf.embedFont(StandardFonts.Courier),
  };
  const sanitize = makeSanitizer(fonts.regular);
  const fontFor = (run, forceBold) =>
    run.code ? fonts.code : run.bold || forceBold ? fonts.bold : run.italic ? fonts.italic : fonts.regular;

  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensureSpace = (needed) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  };

  /**
   * Word-wraps styled runs into the column starting at `x`, drawing as it goes.
   */
  const drawRuns = (runs, { x, size, forceBold = false, color = TEXT_COLOR }) => {
    const lineHeight = size * 1.4;
    const maxWidth = PAGE_WIDTH - MARGIN - x;
    const spaceWidth = fonts.regular.widthOfTextAtSize(' ', size);

    // A word is a list of styled segments: "**bold**," stays one word so the comma never
    // gets separated from the bold text or wrapped onto the next line
    const words = [];
    let current = [];
    for (const run of runs) {
      const font = fontFor(run, forceBold);
      for (const piece of sanitize(run.text).split(/(\s+)/)) {
        if (!piece) continue;
        if (/^\s+$/.test(piece)) {
          if (current.length) words.push(current);
          current = [];
        } else {
          current.push({ text: piece, font, width: font.widthOfTextAtSize(piece, size) });
        }
      }
    }
    if (current.length) words.push(current);

    let line = [];
    let lineWidth = 0;
    const flushLine = () => {
      if (!line.length) return;
      ensureSpace(lineHeight);
      let cursor = x;
      for (const word of line) {
        for (const segment of word.segments) {
          page.drawText(segment.text, { x: cursor, y: y - size, size, font: segment.font, color });
          cursor += segment.width;
        }
        cursor += spaceWidth;
      }
      y -= lineHeight;
      line = [];
      lineWidth = 0;
    };

    for (const segments of words) {
      const width = segments.reduce((sum, segment) => sum + segment.width, 0);
      if (line.length && lineWidth + spaceWidth + width > maxWidth) flushLine();
      line.push({ segments, width });
      lineWidth += (line.length > 1 ? spaceWidth : 0) + width;
    }
    flushLine();
  };

  if (title) {
    drawRuns([{ text: title }], { x: MARGIN, size: 24, forceBold: true, color: ACCENT_COLOR });
    y -= 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 1.2,
      color: ACCENT_COLOR,
    });
    y -= 18;
  }

  for (const block of parseMarkdown(markdown)) {
    if (block.type === 'heading') {
      const size = HEADING_SIZES[block.level];
      ensureSpace(size * 3);
      y -= size * 0.6;
      drawRuns(block.runs, { x: MARGIN, size, forceBold: true, color: block.level === 1 ? ACCENT_COLOR : TEXT_COLOR });
      y -= 4;
    } else if (block.type === 'paragraph') {
      drawRuns(block.runs, { x: MARGIN, size: BODY_SIZE });
      y -= BODY_SIZE * 0.6;
    } else if (block.type === 'bullet' || block.type === 'numbered') {
      ensureSpace(BODY_SIZE * 1.4);
      const marker = block.type === 'bullet' ? '•' : `${block.number}.`;
      page.drawText(marker, { x: MARGIN + 4, y: y - BODY_SIZE, size: BODY_SIZE, font: fonts.regular, color: TEXT_COLOR });
      drawRuns(block.runs, { x: MARGIN + LIST_INDENT, size: BODY_SIZE });
      y -= 2;
    } else if (block.type === 'divider') {
      ensureSpace(20);
      y -= 8;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 0.6,
        color: rgb(0.7, 0.72, 0.76),
      });
      y -= 12;
    }
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${pages.length}`;
    const width = fonts.regular.widthOfTextAtSize(label, 9);
    p.drawText(label, { x: (PAGE_WIDTH - width) / 2, y: MARGIN / 2, size: 9, font: fonts.regular, color: rgb(0.5, 0.52, 0.56) });
  });

  if (title) pdf.setTitle(sanitize(title));
  pdf.setAuthor('Jarvis');
  pdf.setCreator('J.A.R.V.I.S Mark II');

  return Buffer.from(await pdf.save());
}

// ---------------------------------------------------------------------------
// DOCX (docx)
// ---------------------------------------------------------------------------

const DOCX_HEADINGS = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };

function toTextRuns(runs) {
  return runs.map(
    (run) =>
      new TextRun({
        text: run.text,
        bold: run.bold,
        italics: run.italic,
        ...(run.code ? { font: 'Consolas' } : {}),
      })
  );
}

export async function renderDocx({ title, markdown }) {
  const children = [];
  if (title) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));

  // Each numbered list restarts at 1, so give every run of numbered items its own instance
  let numberingInstance = 0;
  let previousType = null;

  for (const block of parseMarkdown(markdown)) {
    if (block.type === 'numbered' && previousType !== 'numbered') numberingInstance++;
    previousType = block.type;

    if (block.type === 'heading') {
      children.push(new Paragraph({ children: toTextRuns(block.runs), heading: DOCX_HEADINGS[block.level] }));
    } else if (block.type === 'paragraph') {
      children.push(new Paragraph({ children: toTextRuns(block.runs), spacing: { after: 160 } }));
    } else if (block.type === 'bullet') {
      children.push(new Paragraph({ children: toTextRuns(block.runs), bullet: { level: 0 } }));
    } else if (block.type === 'numbered') {
      children.push(
        new Paragraph({
          children: toTextRuns(block.runs),
          numbering: { reference: 'jarvis-numbered', level: 0, instance: numberingInstance },
        })
      );
    } else if (block.type === 'divider') {
      children.push(
        new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B0B4BC', space: 1 } } })
      );
    }
  }

  const doc = new Document({
    creator: 'J.A.R.V.I.S Mark II',
    title: title || 'Document',
    numbering: {
      config: [
        {
          reference: 'jarvis-numbered',
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START }],
        },
      ],
    },
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

export const DOCUMENT_RENDERERS = { pdf: renderPdf, docx: renderDocx };
