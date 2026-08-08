import { describe, it, expect } from 'vitest';
import { ConnectionStatus, ConnectionType } from '@prisma/client';

describe('Connection Application Spec', () => {
  it('should format application status transition correctly', () => {
    const status = ConnectionStatus.SUBMITTED;
    expect(status).toBe('SUBMITTED');
    expect(ConnectionType.DOMESTIC).toBe('DOMESTIC');
  });
});
