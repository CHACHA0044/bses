import { describe, it, expect } from 'vitest';
import { startKeepAlive, SCHEDULE } from '../src/keepAlive';

describe('KeepAlive scheduler', () => {
  it('uses exactly a every-3-minutes cron expression', () => {
    expect(SCHEDULE).toBe('*/3 * * * *');
  });

  it('returns the same singleton handle on repeated starts (never duplicates the cron)', () => {
    const first = startKeepAlive();
    const second = startKeepAlive();
    expect(second).toBe(first);
    first.stop();
    second.stop();
  });

  it('stops cleanly and allows a fresh start afterwards', () => {
    const first = startKeepAlive();
    first.stop();
    const second = startKeepAlive();
    expect(second).not.toBe(first);
    second.stop();
  });

  it('resets the active handle after stop (nothing remains scheduled)', () => {
    const first = startKeepAlive();
    first.stop();
    const third = startKeepAlive();
    expect(third).not.toBe(first);
    third.stop();
  });
});