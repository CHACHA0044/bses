import type {
  UserRole,
  UserStatus,
  Gender,
  ConnectionStatus,
  ConnectionType,
  DocumentType,
  DocumentStatus,
  NotificationType,
  NotificationStatus,
  ConsentType,
  AuditAction,
} from '../constants';

// ─── Domain Entities ──────────────────────────────────────────────────────────

export interface User {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: Gender;
  email: string;
  mobileEncrypted: string;
  aadhaarEncrypted: string | null;
  username: string;
  passwordHash: string;
  caNumber: string | null;
  meterNumber: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
}

export interface ConnectionRequest {
  id: string;
  userId: string;
  applicationNumber: string;
  connectionType: ConnectionType;
  requiredLoad: number;
  propertyAddress: string;
  status: ConnectionStatus;
  submittedAt: Date | null;
  updatedAt: Date;
}

export interface Document {
  id: string;
  userId: string;
  connectionRequestId: string | null;
  documentName: string;
  documentType: DocumentType;
  gridfsFileId: string;
  fileSize: number;
  mimeType: string;
  uploadDate: Date;
  status: DocumentStatus;
}

export interface NotificationLog {
  id: string;
  userId: string;
  type: NotificationType;
  recipient: string;
  message: string;
  status: NotificationStatus;
  createdAt: Date;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  performedBy: string;
  action: AuditAction;
  module: string;
  ipAddress: string;
  timestamp: Date;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: ConsentType;
  accepted: boolean;
  acceptedAt: Date;
  ipAddress: string;
}

// ─── JWT & Auth ───────────────────────────────────────────────────────────────

export interface JwtAccessPayload {
  sub: string;
  username: string;
  role: UserRole;
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | undefined;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

// ─── Express augmentation ─────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      user?: JwtAccessPayload;
      correlationId?: string;
    }
  }
}
