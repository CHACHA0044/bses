export type ConnectionStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'ASSIGNED'
  | 'UNDER_VERIFICATION'
  | 'DOCUMENTS_PENDING'
  | 'VERIFICATION_COMPLETE'
  | 'APPROVED'
  | 'REJECTED'
  | 'CONNECTION_SCHEDULED'
  | 'CONNECTION_COMPLETED';

export type ConnectionType = 'DOMESTIC' | 'COMMERCIAL' | 'INDUSTRIAL' | 'AGRICULTURAL';

export type WorkflowActionType =
  | 'APPLICATION_CREATED'
  | 'DOCUMENT_UPLOADED'
  | 'SUBMIT'
  | 'ASSIGN'
  | 'REASSIGN'
  | 'START_VERIFICATION'
  | 'REQUEST_DOCUMENTS'
  | 'COMPLETE_VERIFICATION'
  | 'APPROVE'
  | 'REJECT'
  | 'SCHEDULE_CONNECTION'
  | 'COMPLETE_CONNECTION'
  | 'ADD_REMARK'
  | 'DOCUMENT_APPROVE'
  | 'DOCUMENT_REJECT'
  | 'DOCUMENT_REQUEST';

export type AssignmentStatus = 'ACTIVE' | 'REPLACED' | 'CLOSED';

export type DocumentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export type OcrStatus = 'PROCESSING' | 'EXTRACTED' | 'UNREADABLE' | 'NEEDS_REVIEW';

export interface DocumentOcrData {
  aadhaar?: string | null;
  pan?: string | null;
  name?: string | null;
  dob?: string | null;
  fatherName?: string | null;
  licenseNumber?: string | null;
  address?: string | null;
  validity?: string | null;
  pinCode?: string | null;
  state?: string | null;
  district?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  issuingAuthority?: string | null;
  bloodGroup?: string | null;
  authorization?: string | null;
  permanentAddress?: string | null;
  editedFields?: string[];
  rawText?: string | null;
}

export type VerificationResult = 'APPROVED' | 'REJECTED' | 'REQUESTED';

export type StageCategory = 'draft' | 'in_progress' | 'approved' | 'rejected' | 'completed';

export interface DocumentRecord {
  id: string;
  documentName: string;
  documentType: string;
  mimeType: string;
  fileSize: number;
  uploadDate: string;
  status: DocumentStatus;
  isUnreadable?: boolean;
  ocrConfidence?: number | null;
  ocrStatus?: OcrStatus;
  needsReview?: boolean;
  ocrLowConfidenceFields?: string[];
  ocrData?: DocumentOcrData;
}

export interface TimelineEvent {
  id: string;
  connectionRequestId: string;
  action: WorkflowActionType;
  status: ConnectionStatus;
  performedBy: string;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  label?: string;
}

export interface WorkflowActionRecord {
  id: string;
  action: WorkflowActionType;
  fromStatus: ConnectionStatus;
  toStatus: ConnectionStatus;
  performedByName: string;
  performedByRole: string;
  comment?: string | null;
  createdAt: string;
  previousActionId?: string | null;
}

export interface Assignment {
  id: string;
  assignedToId: string;
  assignedToName: string;
  assignedToRole: string;
  assignedByName: string;
  status: AssignmentStatus;
  notes?: string | null;
  assignedAt: string;
  releasedAt?: string | null;
}

export interface VerificationRecord {
  id: string;
  documentId: string;
  performedByName: string;
  performedByRole: string;
  action: VerificationResult;
  comment?: string | null;
  createdAt: string;
}

export interface AllowedTransition {
  action: WorkflowActionType;
  from: ConnectionStatus;
  to: ConnectionStatus;
  label: string;
}

export interface ApplicantUser {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  username: string;
  caNumber?: string | null;
  meterNumber?: string | null;
}

export interface ConnectionDetail {
  id: string;
  applicationNumber: string;
  status: ConnectionStatus;
  connectionType: ConnectionType;
  requiredLoad: number;
  propertyAddress: string;
  createdAt: string;
  updatedAt: string;
  user?: ApplicantUser;
  documents?: DocumentRecord[];
  timeline?: TimelineEvent[];
  actions?: WorkflowActionRecord[];
  assignments?: Assignment[];
  verifications?: VerificationRecord[];
  allowedTransitions?: AllowedTransition[];
  stage?: { status: ConnectionStatus; category: StageCategory };
}

export interface AdminConnectionListItem {
  id: string;
  applicationNumber: string;
  connectionType: ConnectionType;
  requiredLoad: number;
  propertyAddress: string;
  status: ConnectionStatus;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    username: string;
  };
  documents?: DocumentRecord[];
  assignments?: Assignment[];
}

export interface Officer {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  username: string;
  role: 'ADMIN' | 'SUPER_ADMIN';
}

export interface AdminAnalytics {
  consumers?: {
    totalActive?: number;
    genderDistribution?: Record<string, number>;
    monthlyRegistrations?: { month: string; count: number }[];
    dailyRegistrations?: { day: string; count: number }[];
  };
  connectionRequests?: {
    totalApplications?: number;
    pendingCount?: number;
    inProgressCount?: number;
    approvedCount?: number;
    scheduledCount?: number;
    completedCount?: number;
    rejectedCount?: number;
    trends?: { category: string; count: number }[];
  };
  officers?: { totalActive?: number };
}
