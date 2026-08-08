import { describe, it, expect } from 'vitest';
import { sanitizeFilename } from '../src/middlewares/upload.middleware';

describe('Document Upload Validation & Sanitization', () => {
  it('should sanitize filename removing special characters and appending timestamp', () => {
    const raw = '../../malicious <script>alert("hack")</script>.pdf';
    const sanitized = sanitizeFilename(raw);

    expect(sanitized).not.toContain('<script>');
    expect(sanitized).not.toContain('..');
    expect(sanitized.endsWith('.pdf')).toBe(true);
    expect(sanitized.length).toBeGreaterThan(10);
  });
});
