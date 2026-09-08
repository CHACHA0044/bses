/**
 * Optional PaddleOCR sidecar client.
 *
 * PaddleOCR (PP-OCRv5/v6) is measurably better than Tesseract on noisy,
 * photographed and mixed Devanagari/Latin Indian documents, but it is a Python
 * package (PaddlePaddle runtime) that does NOT fit inside the 512 MB
 * document-service container. The intended architecture — matching the repo's
 * own accuracy roadmap — is a small FastAPI sidecar (see
 * `services/ocr-sidecar/`) that stays disabled by default and is only engaged
 * when the primary engine's output is weak (feature-flag + confidence
 * threshold). Nothing in the Node service changes when the sidecar is off.
 *
 * Contract from the sidecar POST /ocr (multipart `file`, query `lang`):
 *
 *   {
 *     "results": [
 *       { "text": "ABCDE1234F", "confidence": 0.98,
 *         "box": {x1,y1,x2,y2,points:[[x,y],..]} },
 *       ...
 *     ],
 *     "count": 1, "width": 800, "height": 600, "elapsed_ms": 123
 *   }
 *
 * All access is internal-only (`x-internal-secret`), the request is bounded by
 * an abort timeout, and a failure returns null (never throws) so OCR always
 * degrades gracefully to the primary engine.
 */

export interface PaddleBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points: number[][];
}

export interface PaddleLine {
  text: string;
  confidence: number;
  box: PaddleBox;
}

export interface PaddleOcrResponse {
  results: PaddleLine[];
  count: number;
  width: number;
  height: number;
  elapsed_ms: number;
}

export class PaddleOcrClient {
  constructor(
    private readonly baseUrl: string,
    private readonly enabled: boolean,
    private readonly timeoutMs = 15_000,
  ) {}

  public get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Runs the sidecar OCR. Returns null when disabled, unreachable, timing out,
   * or returning a malformed response — never throws.
   */
  public async recognize(image: Buffer, lang = 'en'): Promise<PaddleOcrResponse | null> {
    if (!this.enabled) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const form = new FormData();
      form.append('file', new Blob([image], { type: 'image/png' }), 'page.png');
      const importable = (await import('../../config')).config;
      const secret = importable.INTERNAL_SERVICE_SECRET ?? process.env['INTERNAL_SERVICE_SECRET'] ?? '';
      const res = await fetch(`${this.baseUrl}/ocr?lang=${encodeURIComponent(lang)}`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
        headers: { 'x-internal-secret': secret },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as PaddleOcrResponse;
      if (!data || !Array.isArray(data.results) || data.results.length === 0) return null;
      return data;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Checks sidecar health. Returns false when disabled or unreachable.
   */
  public async healthy(): Promise<boolean> {
    if (!this.enabled) return false;
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }
}