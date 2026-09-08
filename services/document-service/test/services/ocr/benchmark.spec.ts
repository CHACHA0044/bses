import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateAadhaarFixture,
  generatePanFixture,
  generateDlFixture,
  SCENARIOS,
  type SyntheticFixture,
} from '../../../src/services/ocr/syntheticFixtures';
import { runModularExtraction } from '../../../src/services/ocr/extractors/index';
import { isValidAadhaar } from '../../../src/services/ocr/verhoeff';
import { evaluatePan } from '../../../src/services/ocr/panOcr';

/**
 * OCR Benchmark Harness
 *
 * Measures field-level extraction accuracy against synthetic fixtures.
 * Each fixture has known ground-truth fields. We render the fixture to
 * text (simulating OCR output) and measure how well the extractors
 * recover the ground truth.
 *
 * This is a DETERMINISTIC unit-level benchmark: it tests the extraction
 * logic in isolation. End-to-end accuracy depends on OCR quality, which
 * is measured separately with real/synthetic images.
 */

interface FieldResult {
  key: string;
  expected: string;
  actual: string | undefined;
  match: boolean;
  normalizedMatch: boolean;
}

interface FixtureResult {
  fixture: string;
  docType: string;
  scenario: string;
  fields: FieldResult[];
  accuracy: number;
  detectedType: string;
}

const normalize = (s: string): string =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

const compareField = (expected: string, actual: string | undefined): { match: boolean; normalizedMatch: boolean } => {
  if (!actual) return { match: false, normalizedMatch: false };
  const e = expected.trim();
  const a = actual.trim();
  if (e === a) return { match: true, normalizedMatch: true };
  return { match: false, normalizedMatch: normalize(e) === normalize(a) };
};

const renderFixtureToText = (fixture: SyntheticFixture): string => {
  const lines: string[] = [];
  for (const f of fixture.fields) {
    if (f.label) {
      lines.push(`${f.label}: ${f.value}`);
    } else {
      lines.push(f.value);
    }
  }
  return lines.join('\n');
};

const benchmarkFixture = (fixture: SyntheticFixture): FixtureResult => {
  const text = renderFixtureToText(fixture);
  const extraction = runModularExtraction(text, fixture.docType as any, 95);
  const fields = extraction.fields;

  const results: FieldResult[] = fixture.fields.map((f) => {
    const actual = fields[f.key]?.value;
    const { match, normalizedMatch } = compareField(f.value, actual);
    return { key: f.key, expected: f.value, actual, match, normalizedMatch };
  });

  const accuracy = results.filter((r) => r.match).length / Math.max(1, results.length);

  return {
    fixture: fixture.id,
    docType: fixture.docType,
    scenario: fixture.scenario,
    fields: results,
    accuracy,
    detectedType: extraction.detectedType ?? 'UNKNOWN',
  };
};

describe('OCR Extraction Benchmark (synthetic fixtures)', () => {
  const allFixtures: SyntheticFixture[] = [
    ...SCENARIOS.flatMap((s) => [
      generateAadhaarFixture(s),
      generatePanFixture(s),
      generateDlFixture(s),
    ]),
  ];

  const results: FixtureResult[] = [];

  for (const fixture of allFixtures) {
    it(`${fixture.docType} [${fixture.scenario}]`, () => {
      const result = benchmarkFixture(fixture);
      results.push(result);
      // Always pass — this is measurement, not gating
      expect(result).toBeDefined();
    });
  }

  it('REPORT: aggregate accuracy by document type', () => {
    const byType: Record<string, { total: number; match: number; normalizedMatch: number }> = {};
    for (const r of results) {
      if (!byType[r.docType]) byType[r.docType] = { total: 0, match: 0, normalizedMatch: 0 };
      const t = byType[r.docType]!;
      t.total += r.fields.length;
      t.match += r.fields.filter((f) => f.match).length;
      t.normalizedMatch += r.fields.filter((f) => f.normalizedMatch).length;
    }

    const report = Object.entries(byType).map(([docType, t]) => ({
      docType,
      exactAccuracy: t.match / t.total,
      normalizedAccuracy: t.normalizedMatch / t.total,
      totalFields: t.total,
    }));

    console.log('\n=== EXTRACTION BENCHMARK REPORT ===');
    for (const r of report) {
      console.log(
        `${r.docType}: exact=${(r.exactAccuracy * 100).toFixed(1)}% normalized=${(r.normalizedAccuracy * 100).toFixed(1)}% (${r.totalFields} fields)`,
      );
    }
    console.log('===================================\n');

    expect(report.length).toBeGreaterThan(0);
  });

  it('REPORT: Aadhaar Verhoeff validation', () => {
    const aadhaarFixtures = allFixtures.filter((f) => f.docType === 'AADHAAR_CARD');
    let validCount = 0;
    let totalAadhaar = 0;
    for (const f of aadhaarFixtures) {
      const aadhaarField = f.fields.find((x) => x.key === 'aadhaar');
      if (aadhaarField) {
        totalAadhaar++;
        if (isValidAadhaar(aadhaarField.value)) validCount++;
      }
    }
    console.log(`Aadhaar Verhoeff: ${validCount}/${totalAadhaar} valid`);
    expect(validCount).toBe(totalAadhaar);
  });

  it('REPORT: PAN validation', () => {
    const panFixtures = allFixtures.filter((f) => f.docType === 'PAN_CARD');
    let validCount = 0;
    let totalPan = 0;
    for (const f of panFixtures) {
      const panField = f.fields.find((x) => x.key === 'pan');
      if (panField) {
        totalPan++;
        const evalResult = evaluatePan(panField.value);
        if (evalResult.valid) validCount++;
      }
    }
    console.log(`PAN format: ${validCount}/${totalPan} valid`);
    expect(validCount).toBe(totalPan);
  });
});
