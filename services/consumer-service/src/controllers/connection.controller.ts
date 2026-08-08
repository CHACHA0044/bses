import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated } from '@bses/shared';
import { connectionService } from '../services/connection.service';
import { workflowService, Actor } from '../services/workflow.service';
import { applyConnectionSchema, updateConnectionSchema } from '../validators/connection.validator';

const getActor = (req: Request): Actor => ({
  id: req.user!.sub,
  username: req.user!.username,
  role: req.user!.role,
});

export class ConnectionController {
  public applyConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const validated = applyConnectionSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

      const connection = await connectionService.applyConnection(userId, { ...validated, ipAddress });
      sendCreated(res, { connection }, 'Connection application submitted successfully');
    } catch (err) {
      next(err);
    }
  };

  public getUserConnections = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const connections = await connectionService.getUserConnections(userId);
      sendSuccess(res, { connections });
    } catch (err) {
      next(err);
    }
  };

  public getConnectionById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const { id } = req.params;
      const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user!.role);

      const connection = await connectionService.getConnectionById(userId, id!, isAdmin);
      sendSuccess(res, { connection });
    } catch (err) {
      next(err);
    }
  };

  public updateConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const { id } = req.params;
      const validated = updateConnectionSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

      const connection = await connectionService.updateConnection(userId, id!, { ...validated, ipAddress });
      sendSuccess(res, { connection }, 'Connection application updated');
    } catch (err) {
      next(err);
    }
  };

  public getConsumerDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const dashboard = await connectionService.getDashboardData(userId);
      sendSuccess(res, { dashboard });
    } catch (err) {
      next(err);
    }
  };

  public getConnectionDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const detail = await workflowService.getApplicationDetail(id!, getActor(req));
      sendSuccess(res, { connection: detail });
    } catch (err) {
      next(err);
    }
  };

  public getConnectionTimeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const timeline = await workflowService.getTimeline(id!, getActor(req));
      sendSuccess(res, { timeline });
    } catch (err) {
      next(err);
    }
  };
}

export const connectionController = new ConnectionController();
