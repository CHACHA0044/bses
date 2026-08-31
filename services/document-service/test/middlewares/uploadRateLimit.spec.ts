import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { uploadRateLimiter } from '../../src/middlewares/uploadRateLimit.middleware';
import { RateLimitError } from '@bses/shared';

const makeCtx = (sub: string) => {
  const req = { user: { sub }, ip: '1.2.3.4' } as unknown as Request;
  const res = {} as Response;
  const next = vi.fn();
  return { req, res, next };
};

describe('uploadRateLimiter (per-user)', () => {
  it('allows uploads up to the configured maximum', () => {
    for (let i = 0; i < 20; i++) {
      const { req, res, next } = makeCtx('user-1');
      uploadRateLimiter(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeUndefined();
    }
  });

  it('rejects with a RateLimitError once the maximum is exceeded', () => {
    for (let i = 0; i < 20; i++) {
      const { req, res, next } = makeCtx('user-2');
      uploadRateLimiter(req, res, next);
    }
    const { req, res, next } = makeCtx('user-2');
    uploadRateLimiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(RateLimitError);
  });

  it('tracks users independently', () => {
    const heavy = makeCtx('heavy');
    for (let i = 0; i < 20; i++) uploadRateLimiter(heavy.req, heavy.res, heavy.next);
    // A fresh user is never throttled by another user's activity.
    const fresh = makeCtx('fresh');
    uploadRateLimiter(fresh.req, fresh.res, fresh.next);
    expect(fresh.next.mock.calls[0][0]).toBeUndefined();
  });
});
