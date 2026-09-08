import { ConnectionStatus, UserStatus, AuditAction } from '@prisma/client';
import { connectionRepository } from '../repositories/connection.repository';
import { userRepository } from '../repositories/user.repository';
import { encryptionService, NotFoundError, toDocumentView, createLogger } from '@bses/shared';
import { workflowService } from './workflow.service';
import { getPrismaClient } from '../db/db.client';

const logger = createLogger({ service: 'admin-service' });

export class AdminService {
  private get prisma() {
    return getPrismaClient();
  }

  /**
   * Dashboard analytics — ALL independent DB queries run in a single
   * Promise.all for minimum latency. The monthly + daily registration
   * queries are merged into a single user query covering the wider
   * date range, then aggregated in memory.
   *
   * DIAGNOSTIC LOGGING: Each stage logs at INFO level with timing
   * so the root cause can be identified if the dashboard fails.
   * Elapsed time is tracked to spot slow queries.
   *
   * MEMORY SAFETY: This function uses ONLY:
   *   - Database-side aggregation (COUNT, GROUP BY, date_trunc)
   *   - Selective field queries with take/limit where applicable
   *   - No loading of full user/application collections into Node memory
   *   - No unnecessary document/OCR data loading
   */
  public async getDashboardAnalytics(): Promise<any> {
    const requestId = `[ADMIN_DASHBOARD:${Date.now()}]`;
    const t0 = Date.now();

    try {
      // Stage 1: Authentication/authorization already done by middleware
      // (if we reached here, auth-ok)
      logger.info(`${requestId} start`);

      // Widen the date range to cover both monthly (6 months) and daily (14 days)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
      sixMonthsAgo.setDate(1);
      sixMonthsAgo.setHours(0, 0, 0, 0);

      // Stage 2: Registration buckets — aggregated IN THE DATABASE (SQL)
      // Only fetches date buckets with counts, not individual user rows.
      const registrationBucketQuery = this.prisma.$queryRaw<Array<{ bucket: Date; count: bigint }>>`
        SELECT
          date_trunc('day', "created_at")::date               AS bucket,
          COUNT(*)::int::bigint                               AS count
        FROM "users"
        WHERE "created_at" >= ${sixMonthsAgo}
        GROUP BY date_trunc('day', "created_at")::date
        ORDER BY bucket ASC
      `;

      // Stage 3: All independent queries fire in PARALLEL (Promise.all)
      // No sequential awaits — minimum latency.
      const t1 = Date.now();
      logger.info(`${requestId} querying-summary`);

      const [
        connectionStats,
        totalConsumers,
        officers,
        genderCounts,
        registrationBuckets,
        categoryCounts,
      ] = await Promise.all([
        connectionRepository.getDashboardStats(),
        userRepository.countActiveConsumers(),
        workflowService.listOfficers(),
        // Database-side GROUP BY — no user rows loaded into memory
        this.prisma.user.groupBy({
          by: ['gender'],
          _count: { id: true },
        }),
        // Raw SQL aggregation — returns only date buckets, not user data
        registrationBucketQuery,
        // Database-side GROUP BY — no connection rows loaded
        this.prisma.connectionRequest.groupBy({
          by: ['connectionType'],
          _count: { id: true },
        }),
      ]);

      const t2 = Date.now();
      logger.info(`${requestId} queries-complete elapsed=${t2 - t1}ms`);

      // Stage 4: In-memory aggregation (only small maps/arrays, bounded data)
      // These are just JavaScript Maps with one entry per day/month, not full datasets.

      // ── Gender distribution ──
      const genderMap: Record<string, number> = {
        MALE: 0,
        FEMALE: 0,
        OTHER: 0,
        PREFER_NOT_TO_SAY: 0,
      };
      genderCounts.forEach((g) => {
        genderMap[g.gender] = g._count.id;
      });

      // ── Monthly Registrations (Past 6 Months) ──
      // Only 6 entries max — negligible memory footprint
      const monthlyMap = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const label = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        monthlyMap.set(label, 0);
      }
      registrationBuckets.forEach(({ bucket, count }) => {
        const label = new Date(bucket).toLocaleString('en-US', { month: 'short', year: 'numeric' });
        if (monthlyMap.has(label)) {
          monthlyMap.set(label, (monthlyMap.get(label) || 0) + Number(count));
        }
      });
      const monthlyRegistrations = Array.from(monthlyMap.entries()).map(([month, count]) => ({
        month,
        count,
      }));

      // ── Daily Registrations (Past 14 Days) ──
      // Only 14 entries max — negligible memory footprint
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
      fourteenDaysAgo.setHours(0, 0, 0, 0);
      const dailyMap = new Map<string, number>();
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const label = d.toLocaleString('en-US', { month: 'short', day: 'numeric' });
        dailyMap.set(label, 0);
      }
      registrationBuckets.forEach(({ bucket, count }) => {
        const day = new Date(bucket);
        if (day >= fourteenDaysAgo) {
          const label = day.toLocaleString('en-US', { month: 'short', day: 'numeric' });
          if (dailyMap.has(label)) {
            dailyMap.set(label, (dailyMap.get(label) || 0) + Number(count));
          }
        }
      });
      const dailyRegistrations = Array.from(dailyMap.entries()).map(([day, count]) => ({
        day,
        count,
      }));

      // ── Connection Trends ──
      const connectionTrends = categoryCounts.map((c) => ({
        category: c.connectionType,
        count: c._count.id,
      }));

      const result = {
        consumers: {
          totalActive: totalConsumers,
          genderDistribution: genderMap,
          monthlyRegistrations,
          dailyRegistrations,
        },
        connectionRequests: {
          ...connectionStats,
          trends: connectionTrends,
        },
        officers: {
          totalActive: officers.length,
          // Only return the fields needed for the dashboard officer list
          list: officers.slice(0, 20).map((o: any) => ({
            id: o.id,
            name: [o.firstName, o.middleName, o.lastName].filter(Boolean).join(' '),
            role: o.role,
          })),
        },
      };

      const t3 = Date.now();
      logger.info(`${requestId} response-ready elapsed=${t3 - t0}ms`);

      return result;
    } catch (err) {
      const elapsed = Date.now() - t0;
      logger.error(`${requestId} FAILED elapsed=${elapsed}ms`, {
        error: (err as Error).message,
        stack: (err as Error).stack?.split('\n').slice(0, 3).join(' | '),
      });
      throw err; // Re-throw so the controller returns 500 with structured error
    }
  }

  public async listUsers(query: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
  }): Promise<any> {
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

  /**
   * List connection requests for the admin table. Documents are NOT eagerly
   * decrypted here — the list view only shows status/type/assignment info.
   * Decryption happens on-demand in the detail view (getApplicationDetail).
   */
  public async listConnectionRequests(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: ConnectionStatus;
    connectionType?: any;
  }): Promise<any> {
    const result = await connectionRepository.listRequests(query);
    return {
      ...result,
      requests: result.requests.map((r) => ({
        ...r,
        // Strip raw document binary data from the list response — the table
        // only shows document count/status, not extracted OCR fields.
        documents: undefined,
        documentCount: r.documents?.length ?? 0,
      })),
    };
  }

  /**
   * User detail with documents and applications. The audit log write is
   * fire-and-forget so it doesn't block the response on a compliance write.
   */
  public async getUserDetail(
    userId: string,
    adminActor: { sub: string; ip: string },
  ): Promise<any> {
    const [user] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          documents: true,
          connectionRequests: {
            include: {
              timeline: { orderBy: { createdAt: 'desc' }, take: 10 },
              verifications: true,
            },
            orderBy: { submittedAt: 'desc' },
          },
        },
      }),
      // Fire-and-forget audit log — don't block the response
      this.prisma.auditLog
        .create({
          data: {
            userId,
            performedBy: adminActor.sub,
            action: AuditAction.ADMIN_USER_VIEWED,
            module: 'ADMIN_USER_MANAGEMENT',
            ipAddress: adminActor.ip || '127.0.0.1',
            metadata: { targetUserId: userId, viewTimestamp: new Date() },
          },
        })
        .catch((err) => {
          logger.warn('Failed to create audit log for user view', {
            error: (err as Error).message,
          });
        }),
    ]);

    if (!user) {
      throw new NotFoundError('User');
    }

    const decryptedUser = {
      id: user.id,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      gender: user.gender,
      email: user.email,
      username: user.username,
      mobile: user.mobileEncrypted ? encryptionService.decrypt(user.mobileEncrypted) : null,
      aadhaar: user.aadhaarEncrypted ? encryptionService.decrypt(user.aadhaarEncrypted) : null,
      caNumber: user.caNumber,
      meterNumber: user.meterNumber,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };

    const decryptedDocuments = user.documents.map((doc) =>
      toDocumentView(doc, { includeSensitive: true }),
    );

    return {
      user: decryptedUser,
      documents: decryptedDocuments,
      applications: user.connectionRequests,
    };
  }

  public async updateUser(
    userId: string,
    data: { firstName?: string; lastName?: string; mobile?: string },
  ): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    const updateData: any = {};
    if (data.firstName) updateData.firstName = data.firstName;
    if (data.lastName) updateData.lastName = data.lastName;
    if (data.mobile) {
      updateData.mobileEncrypted = encryptionService.encrypt(data.mobile);
      updateData.mobileHash = encryptionService.hashSearchable(data.mobile);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return {
      id: updatedUser.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
    };
  }

  public async changeUserStatus(userId: string, status: UserStatus): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });

    return {
      id: updatedUser.id,
      status: updatedUser.status,
    };
  }

  public async exportUserData(
    userId: string,
    adminActor: { sub: string; ip: string },
  ): Promise<any> {
    const detail = await this.getUserDetail(userId, adminActor);

    // Fire-and-forget audit log for export
    this.prisma.auditLog
      .create({
        data: {
          userId,
          performedBy: adminActor.sub,
          action: AuditAction.ADMIN_USER_EXPORTED,
          module: 'ADMIN_USER_MANAGEMENT',
          ipAddress: adminActor.ip || '127.0.0.1',
          metadata: { targetUserId: userId, exportTimestamp: new Date() },
        },
      })
      .catch((err) => {
        logger.warn('Failed to create audit log for user export', {
          error: (err as Error).message,
        });
      });

    return detail;
  }
}

export const adminService = new AdminService();
