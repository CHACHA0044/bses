import { describe, it, expect } from 'vitest';
import { tokenService } from '../src/services/token.service';
import { UserRole } from '@bses/shared';

describe('TokenService (JWT & SHA-256)', () => {
  it('should generate and verify access tokens', () => {
    const token = tokenService.generateAccessToken({
      userId: 'user_123',
      username: 'test_consumer',
      role: UserRole.CONSUMER,
    });

    expect(token).toBeDefined();
    const payload = tokenService.verifyAccessToken(token);

    expect(payload.sub).toBe('user_123');
    expect(payload.username).toBe('test_consumer');
    expect(payload.role).toBe(UserRole.CONSUMER);
  });

  it('should generate and verify refresh tokens', () => {
    const refreshToken = tokenService.generateRefreshToken('user_123');
    expect(refreshToken).toBeDefined();

    const payload = tokenService.verifyRefreshToken(refreshToken);
    expect(payload.sub).toBe('user_123');
  });

  it('should generate deterministic SHA-256 hashes for tokens', () => {
    const token = 'sample_jwt_token_string';
    const hash = tokenService.hashToken(token);

    expect(hash).toBeDefined();
    expect(hash.length).toBe(64);
  });
});
