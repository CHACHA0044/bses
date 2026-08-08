import type { Request, Response, NextFunction } from 'express';
import { sendSuccess } from '@bses/shared';
import { workflowService, Actor } from '../services/workflow.service';
import {
  assignApplicationSchema,
  startVerificationSchema,
  requestDocumentsSchema,
  completeVerificationSchema,
  rejectApplicationSchema,
  approveApplicationSchema,
  scheduleConnectionSchema,
  completeConnectionSchema,
  addRemarkSchema,
} from '../validators/workflow.validator';

const getActor = (req: Request): Actor => ({
  id: req.user!.sub,
  username: req.user!.username,
  role: req.user!.role,
});

const getIp = (req: Request): string =>
  (req.headers['x-forwarded-for'] as string) || req.ip || '0.0.0.0';

const getRequestId = (req: Request): string | undefined =>
  (req.headers['x-correlation-id'] as string | undefined) ?? req.correlationId ?? undefined;

export class WorkflowController {
  public assign = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const validated = assignApplicationSchema.parse(req.body);
      const connection = await workflowService.assignApplication(id!, validated.assigneeId, getActor(req), getIp(req), validated.comment, getRequestId(req));
      sendSuccess(res, { connection }, 'Application assigned');
    } catch (err) {
      next(err);
    }
  };

  public startVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const validated = startVerificationSchema.parse(req.body);
      const connection = await workflowService.startVerification(id!, getActor(req), getIp(req), validated.comment, getRequestId(req));
      sendSuccess(res, { connection }, 'Verification started');
    } catch (err) {
      next(err);
    }
  };

  public requestDocuments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const validated = requestDocumentsSchema.parse(req.body);
      const connection = await workflowService.requestDocuments(id!, getActor(req), getIp(req), validated, getRequestId(req));
      sendSuccess(res, { connection }, 'Additional documents requested');
    } catch (err) {
      next(err);
    }
  };

  public completeVerification = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const validated = completeVerificationSchema.parse(req.body);
      const connection = await workflowService.completeVerification(id!, getActor(req), getIp(req), validated, getRequestId(req));
      sendSuccess(res, { connection }, 'Verification completed');
    } catch (err) {
      next(err);
    }
  };

  public approve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const validated = approveApplicationSchema.parse(req.body);
      const connection = await workflowService.approveApplication(id!, getActor(req), getIp(req), validated.comment, getRequestId(req));
      sendSuccess(res, { connection }, 'Application approved');
    } catch (err) {
      next(err);
    }
  };

  public reject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const validated = rejectApplicationSchema.parse(req.body);
      const connection = await workflowService.rejectApplication(id!, getActor(req), getIp(req), validated, getRequestId(req));
      sendSuccess(res, { connection }, 'Application rejected');
    } catch (err) {
      next(err);
    }
  };

  public schedule = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const validated = scheduleConnectionSchema.parse(req.body);
      const connection = await workflowService.scheduleConnection(id!, getActor(req), getIp(req), validated, getRequestId(req));
      sendSuccess(res, { connection }, 'Connection scheduled');
    } catch (err) {
      next(err);
    }
  };

  public completeConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const validated = completeConnectionSchema.parse(req.body);
      const connection = await workflowService.completeConnection(id!, getActor(req), getIp(req), validated.comment, getRequestId(req));
      sendSuccess(res, { connection }, 'Connection completed');
    } catch (err) {
      next(err);
    }
  };

  public addRemark = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const validated = addRemarkSchema.parse(req.body);
      const connection = await workflowService.addRemark(id!, getActor(req), getIp(req), validated.remark, getRequestId(req));
      sendSuccess(res, { connection }, 'Remark added');
    } catch (err) {
      next(err);
    }
  };

  public getDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const detail = await workflowService.getApplicationDetail(id!, getActor(req));
      sendSuccess(res, { connection: detail });
    } catch (err) {
      next(err);
    }
  };

  public getTimeline = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const timeline = await workflowService.getTimeline(id!, getActor(req));
      sendSuccess(res, { timeline });
    } catch (err) {
      next(err);
    }
  };

  public getAssignments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const assignments = await workflowService.getAssignments(id!, getActor(req));
      sendSuccess(res, { assignments });
    } catch (err) {
      next(err);
    }
  };

  public getVerifications = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const verifications = await workflowService.getVerifications(id!, getActor(req));
      sendSuccess(res, { verifications });
    } catch (err) {
      next(err);
    }
  };

  public listOfficers = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const officers = await workflowService.listOfficers();
      sendSuccess(res, { officers });
    } catch (err) {
      next(err);
    }
  };
}

export const workflowController = new WorkflowController();
