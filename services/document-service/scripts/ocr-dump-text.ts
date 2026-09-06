/**
 * One-off: dump the raw text layer of fixtures so golden ground-truth
 * values can be curated manually (never auto-recorded). Not part of CI.
 */

import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

const FIXTURES = ['ADHAR.pdf', 'dl.pdf'];
const DIR = path.resolve(__dirname, '..', 'test', 'fixtures');

const run = async (): Promise<void> => {
  for (const file of FIXTURES) {
    const full = path.join(DIR, file);
    console.log(`\n===== ${file} =====`);
    if (!fs.existsSync(full)) {
      console.log('(missing)');
      continue;
    }
    const parser = new PDFParse({
      data: fs.readFileSync(full),
      isEvalSupported: false,
      enableXfa: false,
      stopAtErrors: false,
    });
    const { pages } = await parser.getText({ first: 1, last: 5 });
    for (let i = 0; i < pages.length; i++) {
      const text = pages[i]!.text ?? '';
      console.log(`--- page ${i + 1} (${text.length} chars) ---`);
      console.log(text);
    }
    await parser.destroy();
  }
};

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});