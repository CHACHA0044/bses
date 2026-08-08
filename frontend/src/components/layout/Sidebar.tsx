'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { navItemBase } from '@/components/ui/InteractionProps';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  FilePlus,
  FolderOpen,
  UserCheck,
  Settings,
  HelpCircle,
  Phone,
} from 'lucide-react';

const consumerNavItems = [
  { label: 'Dashboard',           href: '/dashboard',        icon: LayoutDashboard, exact: true },
  { label: 'Apply Connection',    href: '/connections/apply', icon: FilePlus,        exact: true },
  { label: 'Track Applications',  href: '/connections',       icon: FolderOpen,      exact: false },
  { label: 'My Profile',          href: '/profile',          icon: UserCheck,       exact: false },
  { label: 'Settings',            href: '/settings',         icon: Settings,        exact: false },
  { label: 'Help & FAQs',         href: '/help-center',      icon: HelpCircle,      exact: false },
];

const adminNavItems = [
  { label: 'Admin Overview',       href: '/admin/dashboard',    icon: LayoutDashboard, exact: true },
  { label: 'User Directory',       href: '/admin/users',        icon: UserCheck,       exact: false },
  { label: 'Connection Requests',  href: '/admin/connections',  icon: FolderOpen,      exact: false },
];

function isNavActive(href: string, exact: boolean, pathname: string) {
  if (exact) return pathname === href;
  if (href === '/connections') {
    return pathname === '/connections' || (pathname.startsWith('/connections/') && !pathname.startsWith('/connections/apply'));
  }
  return pathname === href || pathname.startsWith(href + '/');
}

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const items = isAdmin ? adminNavItems : consumerNavItems;

  return (
    <aside className="w-56 lg:w-64 h-full p-3 flex flex-col justify-between select-none">
      <div className="flex flex-col flex-1 min-h-0 space-y-4">
        <div className="px-3 pt-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {isAdmin ? 'Administration Portal' : 'Consumer Services'}
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto" aria-label="Sidebar navigation">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item.href, item.exact, pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={[
                  navItemBase,
                  'relative rounded-xl group overflow-hidden',
                  active
                    ? 'text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')}
                aria-current={active ? 'page' : undefined}
              >
                {/* Animated active background */}
                {active && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 bg-surface-dark rounded-xl"
                    transition={{ type: 'spring', stiffness: 380, damping: 34, mass: 0.8 }}
                  />
                )}

                <span className="relative z-10 flex items-center gap-3 w-full">
                  <Icon
                    className={[
                      'h-4 w-4 shrink-0 transition-transform duration-150',
                      'group-hover:scale-110',
                      active ? 'text-white' : 'text-slate-400 group-hover:text-slate-700',
                    ].join(' ')}
                  />
                  <span className="text-sm font-medium">{item.label}</span>
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                  )}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Helpline card — pinned at bottom of sidebar */}
      <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500 space-y-2 border border-slate-200/80 shrink-0">
        <div className="flex items-center gap-2 font-bold text-slate-700">
          <HelpCircle className="h-4 w-4 text-primary shrink-0" />
          BSES Helpline
        </div>
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-amber-600 shrink-0" />
          <span>Emergency: <strong className="text-slate-800">19123</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-emerald-600 shrink-0" />
          <span>WhatsApp: <strong className="text-slate-800">8800991912</strong></span>
        </div>
      </div>
    </aside>
  );
};
