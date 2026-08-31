-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CONSUMER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ASSIGNED', 'UNDER_VERIFICATION', 'DOCUMENTS_PENDING', 'VERIFICATION_COMPLETE', 'APPROVED', 'REJECTED', 'CONNECTION_SCHEDULED', 'CONNECTION_COMPLETED');

-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('DOMESTIC', 'COMMERCIAL', 'INDUSTRIAL', 'AGRICULTURAL');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('AADHAAR_CARD', 'PAN_CARD', 'ADDRESS_PROOF', 'OWNERSHIP_PROOF', 'PASSPORT_PHOTO', 'AFFIDAVIT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SIMULATED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('PRIVACY_POLICY', 'DPDP_DATA_COLLECTION', 'MARKETING_COMMUNICATIONS');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_REGISTERED', 'USER_LOGIN', 'USER_LOGOUT', 'PROFILE_UPDATED', 'PASSWORD_CHANGED', 'CONNECTION_APPLIED', 'CONNECTION_STATUS_UPDATED', 'DOCUMENT_UPLOADED', 'DOCUMENT_DELETED', 'ADMIN_USER_DEACTIVATED', 'ADMIN_USER_EDITED', 'ADMIN_USER_VIEWED', 'ADMIN_USER_EXPORTED', 'APPLICATION_SUBMITTED', 'APPLICATION_ASSIGNED', 'APPLICATION_REASSIGNED', 'WORKFLOW_TRANSITION', 'VERIFICATION_STARTED', 'VERIFICATION_COMPLETED', 'REMARK_ADDED', 'DOCUMENT_APPROVED', 'DOCUMENT_REJECTED', 'DOCUMENT_REQUESTED', 'CONNECTION_SCHEDULED', 'CONNECTION_COMPLETED');

-- CreateEnum
CREATE TYPE "WorkflowActionType" AS ENUM ('APPLICATION_CREATED', 'DOCUMENT_UPLOADED', 'SUBMIT', 'ASSIGN', 'REASSIGN', 'START_VERIFICATION', 'REQUEST_DOCUMENTS', 'COMPLETE_VERIFICATION', 'APPROVE', 'REJECT', 'SCHEDULE_CONNECTION', 'COMPLETE_CONNECTION', 'ADD_REMARK', 'DOCUMENT_APPROVE', 'DOCUMENT_REJECT', 'DOCUMENT_REQUEST');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'REPLACED', 'CLOSED');

-- CreateEnum
CREATE TYPE "VerificationResult" AS ENUM ('APPROVED', 'REJECTED', 'REQUESTED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "middle_name" VARCHAR(50),
    "last_name" VARCHAR(50) NOT NULL,
    "gender" "Gender" NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "mobile_encrypted" TEXT NOT NULL,
    "mobile_hash" VARCHAR(64),
    "aadhaar_encrypted" TEXT,
    "username" VARCHAR(30) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "ca_number" VARCHAR(15),
    "meter_number" VARCHAR(20),
    "role" "UserRole" NOT NULL DEFAULT 'CONSUMER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "reset_password_token_hash" TEXT,
    "reset_password_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "admin_id" TEXT,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ADMIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "application_number" VARCHAR(30) NOT NULL,
    "connection_type" "ConnectionType" NOT NULL,
    "required_load" DECIMAL(8,2) NOT NULL,
    "property_address" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "connection_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_timeline" (
    "id" TEXT NOT NULL,
    "connection_request_id" TEXT NOT NULL,
    "action" "WorkflowActionType" NOT NULL,
    "status" "ConnectionStatus" NOT NULL,
    "performed_by" VARCHAR(100) NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_actions" (
    "id" TEXT NOT NULL,
    "connection_request_id" TEXT NOT NULL,
    "action" "WorkflowActionType" NOT NULL,
    "from_status" "ConnectionStatus" NOT NULL,
    "to_status" "ConnectionStatus" NOT NULL,
    "performed_by_id" TEXT NOT NULL,
    "performed_by_name" VARCHAR(100) NOT NULL,
    "performed_by_role" VARCHAR(50) NOT NULL,
    "comment" TEXT,
    "previous_action_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_assignments" (
    "id" TEXT NOT NULL,
    "connection_request_id" TEXT NOT NULL,
    "assigned_to_id" TEXT NOT NULL,
    "assigned_to_name" VARCHAR(100) NOT NULL,
    "assigned_to_role" VARCHAR(50) NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_by_id" TEXT NOT NULL,
    "assigned_by_name" VARCHAR(100) NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "released_at" TIMESTAMP(3),
    "action_id" TEXT,

    CONSTRAINT "application_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_history" (
    "id" TEXT NOT NULL,
    "connection_request_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "performed_by_id" TEXT NOT NULL,
    "performed_by_name" VARCHAR(100) NOT NULL,
    "performed_by_role" VARCHAR(50) NOT NULL,
    "action" "VerificationResult" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connection_request_id" TEXT,
    "document_name" VARCHAR(255) NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "gridfs_file_id" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "upload_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "deleted_at" TIMESTAMP(3),
    "extracted_aadhaar_encrypted" TEXT,
    "extracted_pan_encrypted" TEXT,
    "extracted_name_encrypted" TEXT,
    "extracted_dob_encrypted" TEXT,
    "ocr_raw_text_encrypted" TEXT,
    "ocr_confidence" DECIMAL(5,2),
    "is_unreadable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "recipient" VARCHAR(254) NOT NULL,
    "message" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "performed_by" VARCHAR(100) NOT NULL,
    "action" "AuditAction" NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "consent_type" "ConsentType" NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(45) NOT NULL,
    "privacy_policy_version" VARCHAR(20) NOT NULL DEFAULT 'v1.0',

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_hash_key" ON "users"("mobile_hash");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_ca_number_key" ON "users"("ca_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_meter_number_key" ON "users"("meter_number");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_ca_number_idx" ON "users"("ca_number");

-- CreateIndex
CREATE INDEX "users_meter_number_idx" ON "users"("meter_number");

-- CreateIndex
CREATE INDEX "users_mobile_hash_idx" ON "users"("mobile_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_admin_id_idx" ON "refresh_tokens"("admin_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "admins_email_idx" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "connection_requests_application_number_key" ON "connection_requests"("application_number");

-- CreateIndex
CREATE INDEX "connection_requests_user_id_idx" ON "connection_requests"("user_id");

-- CreateIndex
CREATE INDEX "connection_requests_application_number_idx" ON "connection_requests"("application_number");

-- CreateIndex
CREATE INDEX "connection_requests_status_idx" ON "connection_requests"("status");

-- CreateIndex
CREATE INDEX "application_timeline_connection_request_id_idx" ON "application_timeline"("connection_request_id");

-- CreateIndex
CREATE INDEX "application_timeline_action_idx" ON "application_timeline"("action");

-- CreateIndex
CREATE INDEX "application_timeline_created_at_idx" ON "application_timeline"("created_at");

-- CreateIndex
CREATE INDEX "workflow_actions_connection_request_id_idx" ON "workflow_actions"("connection_request_id");

-- CreateIndex
CREATE INDEX "workflow_actions_action_idx" ON "workflow_actions"("action");

-- CreateIndex
CREATE INDEX "workflow_actions_created_at_idx" ON "workflow_actions"("created_at");

-- CreateIndex
CREATE INDEX "application_assignments_connection_request_id_idx" ON "application_assignments"("connection_request_id");

-- CreateIndex
CREATE INDEX "application_assignments_assigned_to_id_idx" ON "application_assignments"("assigned_to_id");

-- CreateIndex
CREATE INDEX "application_assignments_status_idx" ON "application_assignments"("status");

-- CreateIndex
CREATE INDEX "verification_history_connection_request_id_idx" ON "verification_history"("connection_request_id");

-- CreateIndex
CREATE INDEX "verification_history_document_id_idx" ON "verification_history"("document_id");

-- CreateIndex
CREATE INDEX "verification_history_created_at_idx" ON "verification_history"("created_at");

-- CreateIndex
CREATE INDEX "documents_user_id_idx" ON "documents"("user_id");

-- CreateIndex
CREATE INDEX "documents_connection_request_id_idx" ON "documents"("connection_request_id");

-- CreateIndex
CREATE INDEX "documents_document_type_idx" ON "documents"("document_type");

-- CreateIndex
CREATE INDEX "notification_logs_user_id_idx" ON "notification_logs"("user_id");

-- CreateIndex
CREATE INDEX "notification_logs_type_idx" ON "notification_logs"("type");

-- CreateIndex
CREATE INDEX "notification_logs_status_idx" ON "notification_logs"("status");

-- CreateIndex
CREATE INDEX "audit_logs_performed_by_idx" ON "audit_logs"("performed_by");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "consent_records_user_id_idx" ON "consent_records"("user_id");

-- CreateIndex
CREATE INDEX "consent_records_accepted_at_idx" ON "consent_records"("accepted_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_timeline" ADD CONSTRAINT "application_timeline_connection_request_id_fkey" FOREIGN KEY ("connection_request_id") REFERENCES "connection_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_actions" ADD CONSTRAINT "workflow_actions_connection_request_id_fkey" FOREIGN KEY ("connection_request_id") REFERENCES "connection_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_actions" ADD CONSTRAINT "workflow_actions_previous_action_id_fkey" FOREIGN KEY ("previous_action_id") REFERENCES "workflow_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_assignments" ADD CONSTRAINT "application_assignments_connection_request_id_fkey" FOREIGN KEY ("connection_request_id") REFERENCES "connection_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_history" ADD CONSTRAINT "verification_history_connection_request_id_fkey" FOREIGN KEY ("connection_request_id") REFERENCES "connection_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_connection_request_id_fkey" FOREIGN KEY ("connection_request_id") REFERENCES "connection_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
