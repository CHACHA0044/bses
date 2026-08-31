'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { navItemBase, pressedState } from '@/components/ui/InteractionProps';
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

  const activeHref = items.find((item) => isNavActive(item.href, item.exact, pathname))?.href;

  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement | null>());
  const [pillStyle, setPillStyle] = useState<{ top: number; height: number } | null>(null);

  // Measure the active item's position inside the nav so the sliding pill can
  // be driven purely by CSS transforms — same visual as the previous
  // framer-motion layout animation, without shipping the motion runtime into
  // every protected route.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const activeEl = activeHref ? itemRefs.current.get(activeHref) : null;
    if (!nav || !activeEl) {
      setPillStyle(null);
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const elRect = activeEl.getBoundingClientRect();
    setPillStyle({ top: elRect.top - navRect.top, height: elRect.height });
  }, [activeHref]);

  return (
    <aside className="w-56 lg:w-64 h-full p-3 flex flex-col justify-between select-none">
      <div className="flex flex-col flex-1 min-h-0 space-y-4">
        <div className="px-3 pt-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {isAdmin ? 'Administration Portal' : 'Consumer Services'}
        </div>

        <nav ref={navRef} className="relative flex-1 space-y-0.5 overflow-y-auto" aria-label="Sidebar navigation">
          {/* Animated active background — one shared pill that slides between items */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 bg-surface-dark rounded-xl"
            style={{
              top: 0,
              transform: pillStyle ? `translateY(${pillStyle.top}px)` : 'translateY(-100%)',
              height: pillStyle?.height ?? 0,
              transition:
                'transform 300ms cubic-bezier(0.22, 1, 0.36, 1), height 300ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />

          {items.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item.href, item.exact, pathname);

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                ref={(el) => {
                  itemRefs.current.set(item.href, el);
                }}
                className={[
                  navItemBase,
                  pressedState,
                  'relative rounded-xl group overflow-hidden',
                  active
                    ? 'text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')}
                aria-current={active ? 'page' : undefined}
              >
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
