import crypto from 'crypto';
import { encryptionService, ValidationError } from '@bses/shared';

export interface CaptchaChallenge {
  captchaToken: string;
  captchaSvg: string;
}

export class CaptchaService {
  /**
   * Generates a 5-character alphanumeric text, an SVG visual challenge, and an
   * encrypted token containing the solution and expiration timestamp (5 mins).
   */
  public generateCaptcha(): CaptchaChallenge {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // exclude confusing chars like 0, O, 1, I
    let solution = '';
    for (let i = 0; i < 5; i++) {
      solution += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity
    const payload = JSON.stringify({ solution, expiresAt, nonce: crypto.randomBytes(4).toString('hex') });
    const captchaToken = encryptionService.encrypt(payload);

    const captchaSvg = this.renderSvg(solution);

    return { captchaToken, captchaSvg };
  }

  /**
   * Validates user CAPTCHA entry against the encrypted token.
   */
  public verifyCaptcha(captchaToken: string | undefined, captchaInput: string | undefined): void {
    if (!captchaToken || !captchaInput) {
      throw new ValidationError('CAPTCHA verification is required', {
        captchaInput: ['Please enter the CAPTCHA code shown in the image'],
      });
    }

    let payload: { solution: string; expiresAt: number };
    try {
      const decrypted = encryptionService.decrypt(captchaToken);
      payload = JSON.parse(decrypted);
    } catch (err) {
      throw new ValidationError('Invalid CAPTCHA token. Please reload the CAPTCHA code.', {
        captchaInput: ['CAPTCHA token is invalid or corrupted'],
      });
    }

    if (Date.now() > payload.expiresAt) {
      throw new ValidationError('CAPTCHA code has expired. Please refresh and try again.', {
        captchaInput: ['CAPTCHA code expired'],
      });
    }

    if (captchaInput.trim().toUpperCase() !== payload.solution.toUpperCase()) {
      throw new ValidationError('Incorrect CAPTCHA code. Please try again.', {
        captchaInput: ['Entered code does not match the image'],
      });
    }
  }

  private renderSvg(text: string): string {
    const width = 160;
    const height = 48;

    // Random background grid & noise lines
    let noiseLines = '';
    for (let i = 0; i < 4; i++) {
      const x1 = Math.floor(Math.random() * width);
      const y1 = Math.floor(Math.random() * height);
      const x2 = Math.floor(Math.random() * width);
      const y2 = Math.floor(Math.random() * height);
      const colors = ['#f59e0b', '#3b82f6', '#10b981', '#6366f1'];
      const stroke = colors[i % colors.length];
      noiseLines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="1.5" opacity="0.4" />`;
    }

    // Distorted text characters with random rotation and offsets
    let textElements = '';
    const charSpacing = width / (text.length + 1);
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const x = (i + 0.8) * charSpacing;
      const y = 32 + (Math.random() * 6 - 3);
      const rotate = Math.floor(Math.random() * 30 - 15);
      const fontSize = 24 + Math.floor(Math.random() * 4 - 2);
      textElements += `<text x="${x}" y="${y}" font-family="monospace, sans-serif" font-size="${fontSize}" font-weight="900" fill="#0f172a" transform="rotate(${rotate}, ${x}, ${y})">${char}</text>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="rounded-xl border border-slate-200 select-none bg-slate-50">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f8fafc"/>
          <stop offset="100%" stop-color="#e2e8f0"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bgGrad)"/>
      ${noiseLines}
      ${textElements}
    </svg>`;
  }
}

export const captchaService = new CaptchaService();
