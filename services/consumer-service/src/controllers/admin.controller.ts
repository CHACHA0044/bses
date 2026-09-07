import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, createLogger } from '@bses/shared';
import { adminService } from '../services/admin.service';

const logger = createLogger({ service: 'admin-controller' });

export class AdminController {
  public getDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = `[ADMIN_DASHBOARD_CTRL:${Date.now()}]`;
    try {
      logger.info(
        `${requestId} auth-ok user=${req.user?.sub ?? 'unknown'} role=${req.user?.role ?? 'unknown'}`,
      );
      const analytics = await adminService.getDashboardAnalytics();
      sendSuccess(res, { analytics });
    } catch (err) {
      logger.error(`${requestId} controller-error`, {
        error: (err as Error).message,
        name: (err as Error).name,
        code: (err as any).code,
      });
      next(err);
    }
  };

  public listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 10;
      const search = req.query['search'] as string;
      const role = req.query['role'] as string;
      const status = req.query['status'] as string;

      const data = await adminService.listUsers({ page, limit, search, role, status });
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  public listConnectionRequests = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const page = req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : 10;
      const search = req.query['search'] as string;
      const status = req.query['status'] as any;
      const connectionType = req.query['connectionType'] as any;

      const data = await adminService.listConnectionRequests({
        page,
        limit,
        search,
        status,
        connectionType,
      });
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  public getUserDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const adminActor = { sub: req.user!.sub, ip: req.ip || '127.0.0.1' };
      const data = await adminService.getUserDetail(id!, adminActor);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };

  public updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const data = await adminService.updateUser(id!, req.body);
      sendSuccess(res, data, 'User updated successfully');
    } catch (err) {
      next(err);
    }
  };

  public changeUserStatus = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const data = await adminService.changeUserStatus(id!, status);
      sendSuccess(res, data, 'User status updated successfully');
    } catch (err) {
      next(err);
    }
  };

  public exportUserData = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const adminActor = { sub: req.user!.sub, ip: req.ip || '127.0.0.1' };
      const data = await adminService.exportUserData(id!, adminActor);
      sendSuccess(res, data);
    } catch (err) {
      next(err);
    }
  };
}

export const adminController = new AdminController();
