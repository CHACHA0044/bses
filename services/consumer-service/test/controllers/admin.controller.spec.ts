import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminController } from '../../src/controllers/admin.controller';
import { adminService } from '../../src/services/admin.service';

vi.mock('../../src/services/admin.service', () => ({
  adminService: {
    getUserDetail: vi.fn(),
    updateUser: vi.fn(),
    changeUserStatus: vi.fn(),
    exportUserData: vi.fn(),
  },
}));

describe('AdminController', () => {
  let controller: AdminController;
  let req: any;
  let res: any;
  let next: any;

  beforeEach(() => {
    controller = new AdminController();
    req = {
      params: { id: 'user-1' },
      user: { sub: 'admin-1', role: 'ADMIN' },
      ip: '192.168.1.1',
      body: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
    vi.clearAllMocks();
  });

  it('should get user detail and forward IP actor to service', async () => {
    vi.mocked(adminService.getUserDetail).mockResolvedValueOnce({ user: { id: 'user-1' } } as any);

    await controller.getUserDetail(req, res, next);

    expect(adminService.getUserDetail).toHaveBeenCalledWith('user-1', { sub: 'admin-1', ip: '192.168.1.1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should export user data properly', async () => {
    vi.mocked(adminService.exportUserData).mockResolvedValueOnce({ user: { id: 'user-1' } } as any);

    await controller.exportUserData(req, res, next);

    expect(adminService.exportUserData).toHaveBeenCalledWith('user-1', { sub: 'admin-1', ip: '192.168.1.1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
