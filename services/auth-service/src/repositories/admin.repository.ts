import { Admin } from '@prisma/client';
import { getPrismaClient } from '../db/db.client';

export class AdminRepository {
  private get prisma() {
    return getPrismaClient();
  }

  public async findByEmail(email: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  public async findById(id: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({
      where: { id },
    });
  }
}

export const adminRepository = new AdminRepository();
