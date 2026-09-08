/**
 * Layout-aware field extraction framework.
 *
 * Preserves spatial information from Tesseract word-level output and provides
 * layout-aware helpers for locating fields by geometric relationship to labels,
 * computing label-proximity confidence, and detecting layout agreement across
 * multiple OCR passes. Augments (does not replace) the existing regex extractors.
 */

// ─── Spatial primitives ──────────────────────────────────────────────────────

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WordBox extends BoundingBox {
  text: string;
  confidence: number;
  page: number;
  lineIndex: number;
  wordIndex: number;
}

export interface LineBox extends BoundingBox {
  text: string;
  words: WordBox[];
}

export interface Layout {
  width: number;
  height: number;
  words: WordBox[];
  lines: LineBox[];
}

export type FieldSource = 'ocr' | 'qr' | 'secondary_ocr' | 'manual' | 'derived';

export interface FieldCandidate {
  value: string;
  confidence: number;
  source: FieldSource;
  bbox?: BoundingBox;
  labelEvidence?: string[];
  layoutEvidence?: string[];
  validationEvidence?: string[];
  alternatives?: string[];
  ambiguous?: boolean;
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

export const center = (b: BoundingBox): { x: number; y: number } => ({
  x: b.x + b.width / 2,
  y: b.y + b.height / 2,
});

export const verticalGap = (above: BoundingBox, below: BoundingBox): number =>
  below.y - (above.y + above.height);

export const verticalOverlap = (a: BoundingBox, b: BoundingBox): number => {
  const overlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlap <= 0 ? 0 : overlap / Math.min(a.height, b.height);
};

export const horizontalOverlap = (a: BoundingBox, b: BoundingBox): number => {
  const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  return overlap <= 0 ? 0 : overlap / Math.min(a.width, b.width);
};

export const horizontallyAligned = (a: BoundingBox, b: BoundingBox, tol = 0.5): boolean =>
  verticalOverlap(a, b) >= tol;

export const verticallyAligned = (a: BoundingBox, b: BoundingBox, tol = 0.4): boolean =>
  horizontalOverlap(a, b) >= tol;

export const isRightOf = (
  subject: BoundingBox,
  target: BoundingBox,
  maxGap = 80,
  alignTol = 0.4,
): boolean => {
  if (subject.x < target.x + target.width) return false;
  const gap = subject.x - (target.x + target.width);
  if (gap > maxGap) return false;
  return horizontallyAligned(subject, target, alignTol);
};

export const centerDistance = (a: BoundingBox, b: BoundingBox): number => {
  const ac = center(a);
  const bc = center(b);
  return Math.hypot(ac.x - bc.x, ac.y - bc.y);
};

// ─── Label-value location ────────────────────────────────────────────────────

export const horizontalCentroid = (b: BoundingBox, pageWidth: number): number =>
  pageWidth > 0 ? (b.x + b.width / 2) / pageWidth : 0.5;

export type HorizontalRegion = 'left' | 'center' | 'right';

export const horizontalRegion = (b: BoundingBox, pageWidth: number): HorizontalRegion => {
  const c = horizontalCentroid(b, pageWidth);
  if (c < 0.33) return 'left';
  if (c > 0.67) return 'right';
  return 'center';
};

export const wordsToText = (words: WordBox[]): string =>
  words
    .map((w) => w.text)
    .join(' ')
    .replace(/\s+([,.\-:/'"`%])/g, '$1')
    .replace(/([,.\-:/'"`%])\s+/g, '$1')
    .replace(/([a-zA-Z])-\s+([a-zA-Z])/g, '$1$2')
    .replace(/\s{2,}/g, ' ')
    .trim();

const proximityConfidence = (label: BoundingBox, value: BoundingBox, maxGap: number): number => {
  const gap = Math.max(0, verticalGap(label, value));
  if (gap === 0) return 1;
  return Math.max(0.5, 1 - gap / maxGap);
};

// ─── Label-value finder ──────────────────────────────────────────────────────

export const isBelow = (
  subject: BoundingBox,
  target: BoundingBox,
  maxGap = 50,
  alignTol = 0.4,
): boolean => {
  if (subject.y < target.y + target.height / 2) return false;
  const gap = verticalGap(target, subject);
  if (gap < 0 || gap > maxGap) return false;
  return verticallyAligned(subject, target, alignTol);
};

/**
 * Finds the value for a labeled field using spatial reasoning.
 * Matches label lines/words, then finds the nearest value candidate below,
 * to the right of, or on the same line.
 */
export const findFieldByLabelProximity = (
  layout: Layout,
  labelPattern: RegExp,
  valueExtractor: (text: string) => string | undefined,
  options: { maxLabelGap?: number; maxLineGap?: number } = {},
): { value: string; confidence: number; bbox: BoundingBox } | undefined => {
  const maxLabelGap = options.maxLabelGap ?? 60;
  const maxLineGap = options.maxLineGap ?? 8;

  const labelMatches: LineBox[] = [];
  for (const line of layout.lines) {
    if (labelPattern.test(line.text)) {
      labelMatches.push(line);
    }
  }
  const labelWords: WordBox[] = [];
  for (const w of layout.words) {
    if (labelPattern.test(w.text) && !labelMatches.some((l) => l.words.includes(w))) {
      labelWords.push(w);
    }
  }
  if (labelMatches.length === 0 && labelWords.length === 0) return undefined;

  const candidateLines = layout.lines.filter((l) => !labelPattern.test(l.text));
  const candidateWords = layout.words.filter((w) => !labelPattern.test(w.text));

  // Strategy 1: value directly below the label
  for (const label of labelMatches) {
    for (const line of candidateLines) {
      if (isBelow(line, label, maxLabelGap)) {
        const v = valueExtractor(line.text);
        if (v) return { value: v, confidence: proximityConfidence(label, line, maxLabelGap), bbox: line };
      }
    }
    for (const w of candidateWords) {
      if (isBelow(w, label, maxLabelGap)) {
        const v = valueExtractor(w.text);
        if (v) return { value: v, confidence: proximityConfidence(label, w, maxLabelGap), bbox: w };
      }
    }
  }

  // Strategy 2: value to the right of the label (same line)
  for (const label of [...labelMatches, ...labelWords]) {
    for (const c of [...candidateLines, ...candidateWords]) {
      if (Math.abs(label.y - c.y) <= maxLineGap && isRightOf(c, label, maxLabelGap)) {
        const v = valueExtractor(c.text);
        if (v) return { value: v, confidence: proximityConfidence(label, c, maxLabelGap) * 0.85, bbox: c };
      }
    }
  }

  // Strategy 3: multi-line accumulation below label
  for (const label of labelMatches) {
    const group = candidateLines
      .filter((l) => l.y >= label.y + label.height && l.y <= label.y + label.height + maxLabelGap * 3)
      .sort((a, b) => a.y - b.y);
    if (group.length > 0) {
      const allText = wordsToText(group.flatMap((l) => l.words));
      const v = valueExtractor(allText);
      if (v) return { value: v, confidence: proximityConfidence(label, group[0]!, maxLabelGap) * 0.7 + 0.3, bbox: group[0]! };
    }
  }

  return undefined;
};

// ─── Layout agreement ────────────────────────────────────────────────────────

export const computeLayoutAgreement = (
  fieldsA: Record<string, string>,
  fieldsB: Record<string, string>,
): Record<string, boolean> => {
  const result: Record<string, boolean> = {};
  for (const key of new Set([...Object.keys(fieldsA), ...Object.keys(fieldsB)])) {
    const a = fieldsA[key];
    const b = fieldsB[key];
    if (!a || !b) { result[key] = false; continue; }
    const normA = a.replace(/\s+/g, ' ').trim().toLowerCase();
    const normB = b.replace(/\s+/g, ' ').trim().toLowerCase();
    result[key] = normA === normB;
  }
  return result;
};

// ─── Tesseract layout extraction ──────────────────────────────────────────────

export const extractLayout = (tesseractData: {
  width: number;
  height: number;
  words: Array<{ text: string; confidence: number; bbox: BoundingBox; line: number }>;
}): Layout => {
  const words: WordBox[] = [];
  for (const w of tesseractData.words) {
    words.push({
      ...w.bbox,
      text: w.text,
      confidence: w.confidence,
      page: 0,
      lineIndex: w.line ?? 0,
      wordIndex: words.length,
    });
  }

  const lineGroups = new Map<number, WordBox[]>();
  for (const w of words) {
    if (!lineGroups.has(w.lineIndex)) lineGroups.set(w.lineIndex, []);
    lineGroups.get(w.lineIndex)!.push(w);
  }
  const lines: LineBox[] = [];
  for (const [idx, ws] of lineGroups.entries()) {
    const minX = Math.min(...ws.map((w) => w.x));
    const minY = Math.min(...ws.map((w) => w.y));
    const maxX = Math.max(...ws.map((w) => w.x + w.width));
    const maxY = Math.max(...ws.map((w) => w.y + w.height));
    lines.push({ x: minX, y: minY, width: maxX - minX, height: maxY - minY, text: wordsToText(ws), words: ws });
  }
  lines.sort((a, b) => a.y - b.y);
  return { width: tesseractData.width, height: tesseractData.height, words, lines };
};

/**
 * Adapts the raw Tesseract.js worker result shape (`data.words` with `bbox`
 * objects `{x,y,width,height}`) into our `Layout` structure.
 * Tesseract.js word objects: `{ text, confidence, bbox: {x,y,width,height}, line: N }`.
 */
export const extractLayoutFromTesseract = (
  data: { words: Array<{ text: string; confidence: number; bbox: BoundingBox; line?: number }> },
  pageWidth: number,
  pageHeight: number,
): Layout => {
  const words: WordBox[] = data.words.map((w, i) => ({
    x: w.bbox.x,
    y: w.bbox.y,
    width: w.bbox.width,
    height: w.bbox.height,
    text: w.text,
    confidence: w.confidence,
    page: 0,
    lineIndex: w.line ?? 0,
    wordIndex: i,
  }));

  // Group words into lines by the Tesseract-assigned line index
  const byLine = new Map<number, WordBox[]>();
  for (const w of words) {
    const k = w.lineIndex;
    if (!byLine.has(k)) byLine.set(k, []);
    byLine.get(k)!.push(w);
  }
  const lines: LineBox[] = [];
  for (const [, ws] of byLine.entries()) {
    const minX = Math.min(...ws.map((w) => w.x));
    const minY = Math.min(...ws.map((w) => w.y));
    const maxX = Math.max(...ws.map((w) => w.x + w.width));
    const maxY = Math.max(...ws.map((w) => w.y + w.height));
    lines.push({ x: minX, y: minY, width: maxX - minX, height: maxY - minY, text: wordsToText(ws), words: ws });
  }
  lines.sort((a, b) => a.y - b.y);

  return { width: pageWidth, height: pageHeight, words, lines };
};

