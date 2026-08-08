import { ConnectionStatus } from '@prisma/client';
import { connectionRepository } from '../repositories/connection.repository';
import { userRepository } from '../repositories/user.repository';
import { encryptionService } from './encryption.service';
import { workflowService } from './workflow.service';

export class AdminService {
  public async getDashboardAnalytics(): Promise<any> {
    const [connectionStats, totalConsumers, officers] = await Promise.all([
      connectionRepository.getDashboardStats(),
      userRepository.countActiveConsumers(),
      workflowService.listOfficers(),
    ]);

    return {
      consumers: {
        totalActive: totalConsumers,
      },
      connectionRequests: connectionStats,
      officers: {
        totalActive: officers.length,
        list: officers,
      },
    };
  }

  public async listUsers(query: { page?: number; limit?: number; search?: string; role?: string; status?: string }): Promise<any> {
    const result = await userRepository.listUsers(query);

    const decryptedUsers = result.users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      middleName: u.middleName,
      lastName: u.lastName,
      gender: u.gender,
      email: u.email,
      username: u.username,
      mobile: u.mobileEncrypted ? encryptionService.decrypt(u.mobileEncrypted) : null,
      caNumber: u.caNumber,
      meterNumber: u.meterNumber,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));

    return { ...result, users: decryptedUsers };
  }

  public async listConnectionRequests(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: ConnectionStatus;
    connectionType?: any;
  }): Promise<any> {
    return connectionRepository.listRequests(query);
  }
}

export const adminService = new AdminService();
