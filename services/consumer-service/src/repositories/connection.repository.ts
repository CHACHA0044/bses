import { ConnectionRequest, ConnectionStatus, ConnectionType, Prisma } from '@prisma/client';
import { getPrismaClient } from '../db/db.client';

export interface CreateConnectionData {
  userId: string;
  applicationNumber: string;
  connectionType: ConnectionType;
  requiredLoad: number;
  propertyAddress: string;
  status?: ConnectionStatus;
}

export interface UpdateConnectionData {
  connectionType?: ConnectionType | undefined;
  requiredLoad?: number | undefined;
  propertyAddress?: string | undefined;
  status?: ConnectionStatus | undefined;
  submittedAt?: Date | null | undefined;
}

export class ConnectionRepository {
  private get prisma() {
    return getPrismaClient();
  }

  public async create(data: CreateConnectionData): Promise<ConnectionRequest> {
    return this.prisma.connectionRequest.create({
      data: {
        userId: data.userId,
        applicationNumber: data.applicationNumber,
        connectionType: data.connectionType,
        requiredLoad: new Prisma.Decimal(data.requiredLoad),
        propertyAddress: data.propertyAddress,
        status: data.status || ConnectionStatus.DRAFT,
      },
    });
  }

  public async findById(id: string): Promise<(ConnectionRequest & { user?: any; documents?: any[] }) | null> {
    return this.prisma.connectionRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            email: true,
            mobileEncrypted: true,
            caNumber: true,
            meterNumber: true,
          },
        },
        documents: {
          where: { deletedAt: null },
        },
      },
    });
  }

  public async findWorkflowDetail(id: string): Promise<any | null> {
    return this.prisma.connectionRequest.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            email: true,
            mobileEncrypted: true,
            username: true,
            caNumber: true,
            meterNumber: true,
          },
        },
        documents: {
          where: { deletedAt: null },
        },
        timeline: { orderBy: { createdAt: 'asc' } },
        actions: { orderBy: { createdAt: 'asc' } },
        assignments: { orderBy: { assignedAt: 'desc' } },
        verifications: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  public async findByApplicationNumber(applicationNumber: string): Promise<ConnectionRequest | null> {
    return this.prisma.connectionRequest.findFirst({
      where: { applicationNumber, deletedAt: null },
      include: {
        documents: { where: { deletedAt: null } },
      },
    });
  }

  public async findByUserId(userId: string): Promise<ConnectionRequest[]> {
    return this.prisma.connectionRequest.findMany({
      where: { userId, deletedAt: null },
      include: {
        documents: { where: { deletedAt: null } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  public async update(id: string, data: UpdateConnectionData): Promise<ConnectionRequest> {
    return this.prisma.connectionRequest.update({
      where: { id },
      data: {
        ...(data.connectionType && { connectionType: data.connectionType }),
        ...(data.requiredLoad !== undefined && { requiredLoad: new Prisma.Decimal(data.requiredLoad) }),
        ...(data.propertyAddress && { propertyAddress: data.propertyAddress }),
        ...(data.status && { status: data.status }),
        ...(data.submittedAt !== undefined && { submittedAt: data.submittedAt }),
      },
    });
  }

  public async listRequests(options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: ConnectionStatus;
    connectionType?: ConnectionType;
  }): Promise<{ requests: any[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.ConnectionRequestWhereInput = {
      deletedAt: null,
      ...(options.status && { status: options.status }),
      ...(options.connectionType && { connectionType: options.connectionType }),
      ...(options.search && {
        OR: [
          { applicationNumber: { contains: options.search, mode: 'insensitive' } },
          { propertyAddress: { contains: options.search, mode: 'insensitive' } },
          { user: { firstName: { contains: options.search, mode: 'insensitive' } } },
          { user: { lastName: { contains: options.search, mode: 'insensitive' } } },
          { user: { email: { contains: options.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const [requests, total] = await Promise.all([
      this.prisma.connectionRequest.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              username: true,
            },
          },
          documents: { where: { deletedAt: null } },
          assignments: {
            where: { status: 'ACTIVE' },
            orderBy: { assignedAt: 'desc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.connectionRequest.count({ where }),
    ]);

    return {
      requests,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async getDashboardStats(): Promise<{
    totalApplications: number;
    pendingCount: number;
    inProgressCount: number;
    approvedCount: number;
    scheduledCount: number;
    completedCount: number;
    rejectedCount: number;
  }> {
    const [totalApplications, pendingCount, inProgressCount, approvedCount, scheduledCount, completedCount, rejectedCount] =
      await Promise.all([
        this.prisma.connectionRequest.count({ where: { deletedAt: null } }),
        this.prisma.connectionRequest.count({ where: { status: 'SUBMITTED', deletedAt: null } }),
        this.prisma.connectionRequest.count({
          where: { status: { in: ['ASSIGNED', 'UNDER_VERIFICATION', 'DOCUMENTS_PENDING', 'VERIFICATION_COMPLETE'] }, deletedAt: null },
        }),
        this.prisma.connectionRequest.count({ where: { status: 'APPROVED', deletedAt: null } }),
        this.prisma.connectionRequest.count({ where: { status: 'CONNECTION_SCHEDULED', deletedAt: null } }),
        this.prisma.connectionRequest.count({ where: { status: 'CONNECTION_COMPLETED', deletedAt: null } }),
        this.prisma.connectionRequest.count({ where: { status: 'REJECTED', deletedAt: null } }),
      ]);

    return {
      totalApplications,
      pendingCount,
      inProgressCount,
      approvedCount,
      scheduledCount,
      completedCount,
      rejectedCount,
    };
  }
}

export const connectionRepository = new ConnectionRepository();
