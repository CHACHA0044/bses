import { Router } from 'express';
import { profileController } from '../controllers/profile.controller';
import { connectionController } from '../controllers/connection.controller';
import { adminController } from '../controllers/admin.controller';
import { workflowController } from '../controllers/workflow.controller';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';

const router = Router();

// Consumer Dashboard & Profile Routes
router.get('/users/profile', authenticate, profileController.getProfile);
router.put('/users/profile', authenticate, profileController.updateProfile);
router.get('/users/dashboard', authenticate, connectionController.getConsumerDashboard);

// Connection Application Routes
router.post('/connections/apply', authenticate, connectionController.applyConnection);
router.get('/connections', authenticate, connectionController.getUserConnections);
router.get('/connections/:id', authenticate, connectionController.getConnectionById);
router.put('/connections/:id', authenticate, connectionController.updateConnection);
router.get('/connections/:id/detail', authenticate, connectionController.getConnectionDetail);
router.get('/connections/:id/timeline', authenticate, connectionController.getConnectionTimeline);

// Admin Management & Dashboard Routes
router.get('/admin/dashboard', authenticate, requireAdmin, adminController.getDashboard);
router.get('/admin/users', authenticate, requireAdmin, adminController.listUsers);
router.get('/admin/connection-requests', authenticate, requireAdmin, adminController.listConnectionRequests);

// ── Workflow Engine Routes (admin) ──
router.get('/admin/officers', authenticate, requireAdmin, workflowController.listOfficers);
router.get('/admin/connection-requests/:id', authenticate, requireAdmin, workflowController.getDetail);
router.get('/admin/connection-requests/:id/timeline', authenticate, requireAdmin, workflowController.getTimeline);
router.get('/admin/connection-requests/:id/assignments', authenticate, requireAdmin, workflowController.getAssignments);
router.get('/admin/connection-requests/:id/verifications', authenticate, requireAdmin, workflowController.getVerifications);
router.post('/admin/connection-requests/:id/assign', authenticate, requireAdmin, workflowController.assign);
router.post('/admin/connection-requests/:id/verification/start', authenticate, requireAdmin, workflowController.startVerification);
router.post('/admin/connection-requests/:id/verification/complete', authenticate, requireAdmin, workflowController.completeVerification);
router.post('/admin/connection-requests/:id/documents/request', authenticate, requireAdmin, workflowController.requestDocuments);
router.post('/admin/connection-requests/:id/approve', authenticate, requireAdmin, workflowController.approve);
router.post('/admin/connection-requests/:id/reject', authenticate, requireAdmin, workflowController.reject);
router.post('/admin/connection-requests/:id/schedule', authenticate, requireAdmin, workflowController.schedule);
router.post('/admin/connection-requests/:id/complete', authenticate, requireAdmin, workflowController.completeConnection);
router.post('/admin/connection-requests/:id/remarks', authenticate, requireAdmin, workflowController.addRemark);

export default router;
