import { User, Prisma } from '@prisma/client';
import { getPrismaClient } from '../db/db.client';

export interface UpdateProfileData {
  email?: string | undefined;
  mobileEncrypted?: string | undefined;
  mobileHash?: string | undefined;
  aadhaarEncrypted?: string | null | undefined;
}

export class UserRepository {
  private get prisma() {
    return getPrismaClient();
  }

  public async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  public async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
  }

  public async findByMobileHash(mobileHash: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { mobileHash, deletedAt: null },
    });
  }

  public async updateProfile(id: string, data: UpdateProfileData): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.email && { email: data.email.toLowerCase() }),
        ...(data.mobileEncrypted && { mobileEncrypted: data.mobileEncrypted }),
        ...(data.mobileHash && { mobileHash: data.mobileHash }),
        ...(data.aadhaarEncrypted !== undefined && { aadhaarEncrypted: data.aadhaarEncrypted }),
      },
    });
  }

  public async listUsers(options: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
  }): Promise<{ users: User[]; total: number; page: number; totalPages: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(options.role && { role: options.role as any }),
      ...(options.status && { status: options.status as any }),
      ...(options.search && {
        OR: [
          { firstName: { contains: options.search, mode: 'insensitive' } },
          { lastName: { contains: options.search, mode: 'insensitive' } },
          { email: { contains: options.search, mode: 'insensitive' } },
          { username: { contains: options.search, mode: 'insensitive' } },
          { caNumber: { contains: options.search, mode: 'insensitive' } },
          { meterNumber: { contains: options.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  public async countActiveConsumers(): Promise<number> {
    return this.prisma.user.count({
      where: { role: 'CONSUMER', status: 'ACTIVE', deletedAt: null },
    });
  }
}

export const userRepository = new UserRepository();
