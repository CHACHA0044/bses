'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

export const FooterConsumerLinks: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <ul className="space-y-2 text-slate-400">
      {isAuthenticated && (
        <>
          <li>
            <Link href="/connections/apply" className="hover:text-accent transition">
              New Connection Application
            </Link>
          </li>
          <li>
            <Link href="/connections" className="hover:text-accent transition">
              Track Application Status
            </Link>
          </li>
          <li>
            <Link href="/profile" className="hover:text-accent transition">
              Consumer Profile
            </Link>
          </li>
        </>
      )}
      <li>
        <Link href="/help-center" className="hover:text-accent transition">
          Helpline &amp; FAQs
        </Link>
      </li>
    </ul>
  );
};
