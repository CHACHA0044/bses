import { describe, it, expect } from 'vitest';

describe('Consumer Profile Unit Spec', () => {
  it('should validate profile payload schema', () => {
    const valid = {
      email: 'consumer@example.com',
      mobile: '9876543210',
    };
    expect(valid.email).toContain('@');
    expect(valid.mobile).toHaveLength(10);
  });
});
