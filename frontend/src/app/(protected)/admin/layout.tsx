import React from 'react';
import { AuthGuard } from '@/components/common/AuthGuard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowRoles={['ADMIN', 'SUPER_ADMIN']} fallbackHref="/dashboard">
      {children}
    </AuthGuard>
  );
}
