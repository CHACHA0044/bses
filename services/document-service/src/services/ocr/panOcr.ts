/**
 * PAN-specific OCR helpers.
 *
 * The Indian PAN is `[A-Z]{5}[0-9]{4}[A-Z]`. Camera photos of printed PAN
 * cards routinely confuse glyph pairs (O/0, L/I/1, S/5, B/8, Z/2, G/6, Q/0,
 * D/0). Blindly "correcting" such a character could turn a real PAN into a
 * different — but still well-formed — PAN. Instead of auto-correcting we
 * enumerate every PAN consistent with the OCR read plus the confusion set and
 * return them all, marking the result AMBIGUOUS when more than one candidate
 * exists. The caller then sends the document to review rather than making an
 * irreversible guess.
 */

/** Exact PAN format, as used by the Income Tax Department. */
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

/** Official holder-category characters for the 4th PAN position. */
export const PAN_CATEGORY_CHARS = new Set(['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G']);

/** Letter characters commonly read as the given digit. */
const LETTERS_OF_DIGIT: Record<string, string[]> = {
  '0': ['O', 'Q', 'D'],
  '1': ['I', 'L'],
  '2': ['Z'],
  '5': ['S'],
  '8': ['B'],
  '6': ['G'],
  '7': ['T'],
};

/** Digits commonly read as the given letter. */
const DIGITS_OF_LETTER: Record<string, string[]> = {
  O: ['0'],
  Q: ['0'],
  D: ['0'],
  I: ['1'],
  L: ['1'],
  Z: ['2'],
  S: ['5'],
  B: ['8'],
  G: ['6'],
  T: ['7'],
};

interface PanCandidate {
  value: string;
  distance: number;
  confidence: number;
}

export interface PanEvaluation {
  /** The raw OCR string (trimmed/uppercased). */
  raw: string;
  /** The primary candidate (the one with the highest confidence). */
  value: string | null;
  /** Whether the raw OCR string itself is already a valid PAN. */
  valid: boolean;
  /** All PANs consistent with the OCR read + its confusion set. */
  candidates: PanCandidate[];
  /** True when exactly one candidate exists. */
  unique: boolean;
  /** True when more than one distinct candidate exists. */
  ambiguous: boolean;
  /** 4th (category) character when a candidate is known. */
  category: string | null;
  /** Whether the category character is a recognized holder category. */
  categoryRecognized: boolean;
}

/** Candidate characters for one PAN slot given the raw OCR character. */
const candidatesForSlot = (rawChar: string, slot: 'letter' | 'digit'): string[] => {
  if (slot === 'letter') {
    if (/[A-Z]/.test(rawChar)) return [rawChar];
    return LETTERS_OF_DIGIT[rawChar] ?? [];
  }
  if (/[0-9]/.test(rawChar)) return [rawChar];
  return DIGITS_OF_LETTER[rawChar.toUpperCase()] ?? [];
};

/**
 * Evaluates a raw OCR PAN read. `ocrConfidence` (0–100) calibrates the
 * returned candidate confidences. Never throws for malformed input.
 */
export const evaluatePan = (raw: string, ocrConfidence = 90): PanEvaluation => {
  const cleaned = raw.replace(/[\s-]/g, '').toUpperCase();
  const normalized = cleaned.slice(0, 10);

  if (!normalized || normalized.length !== 10) {
    return {
      raw: cleaned,
      value: null,
      valid: false,
      candidates: [],
      unique: false,
      ambiguous: false,
      category: null,
      categoryRecognized: false,
    };
  }

  const slots: Array<{ chars: string[]; kind: 'letter' | 'digit' }> = [];
  for (let i = 0; i < 10; i++) {
    const kind: 'letter' | 'digit' = i === 3 || i === 4 || i === 9 ? 'letter' : i >= 4 && i <= 7 ? 'digit' : 'letter';
    slots.push({ chars: candidatesForSlot(normalized[i]!, kind), kind });
  }

  // Cartesian product of slot candidates, filtered to valid PANs.
  const candidates: PanCandidate[] = [];
  const visit = (idx: number, built: string[], distance: number): void => {
    if (idx === 10) {
      const value = built.join('');
      if (!PAN_RE.test(value)) return;
      candidates.push({ value, distance, confidence: 0 });
      return;
    }
    const slot = slots[idx]!;
    const seen = new Set<string>();
    for (const ch of slot.chars) {
      if (seen.has(ch)) continue;
      seen.add(ch);
      built.push(ch);
      visit(idx + 1, built, distance + (ch === normalized[idx] ? 0 : 1));
      built.pop();
    }
  };
  for (const ch of slots[0]!.chars) {
    void visit(1, [ch], ch === normalized[0] ? 0 : 1);
  }

  // De-duplicate and score: each substituted char decays confidence.
  const byValue = new Map<string, PanCandidate>();
  for (const c of candidates) {
    const existing = byValue.get(c.value);
    if (!existing || c.distance < existing.distance) byValue.set(c.value, { value: c.value, distance: c.distance, confidence: 0 });
  }
  const scored = [...byValue.values()]
    .map((c) => ({
      ...c,
      confidence: Math.max(1, Math.round(ocrConfidence * Math.pow(0.8, c.distance))),
    }))
    .sort((a, b) => b.confidence - a.confidence);

  const primary = scored[0]?.value ?? null;
  const categoryChar = primary?.[3] ?? null;

  return {
    raw: cleaned,
    value: primary,
    valid: PAN_RE.test(normalized),
    candidates: scored,
    unique: scored.length === 1,
    ambiguous: scored.length > 1,
    category: categoryChar,
    categoryRecognized: categoryChar ? PAN_CATEGORY_CHARS.has(categoryChar) : false,
  };
};