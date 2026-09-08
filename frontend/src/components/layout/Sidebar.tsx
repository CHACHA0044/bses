'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { navItemBase, pressedState } from '@/components/ui/InteractionProps';
import {
  adminNavItems,
  consumerNavItems,
  isAdminRole,
  isNavActive,
  type NavItem,
} from '@/lib/navigation';
import {
  Phone,
  LogIn,
  LogOut,
  Loader2,
  HelpCircle,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout, isLoadingLogout } = useAuth();
  const isAdmin = isAdminRole(user?.role);
  const items = isAdmin ? adminNavItems : consumerNavItems;

  /* Show the Login item for guests. While the session check is still in
     flight we skip it to avoid a flash of duplicate nav. The active pill
     intentionally does not animate onto the Login row — that would be
     visually noisy and the Login row is a single, non-contextual action. */
  const showLoginItem = !isAuthenticated && !isLoading;

  const activeItem = items.find((item) => isNavActive(item, pathname));
  const activeHref = activeItem?.href;

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
  }, [activeHref, showLoginItem, pathname]);

  return (
    <aside className="w-56 lg:w-64 h-full p-3 flex flex-col justify-between select-none">
      <div className="flex flex-col flex-1 min-h-0 space-y-4">
        <div className="px-3 pt-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {isAuthenticated ? (isAdmin ? 'Administration Portal' : 'Consumer Services') : 'Account'}
        </div>

        <nav
          ref={navRef}
          className="relative flex-1 space-y-0.5 overflow-y-auto"
          aria-label="Sidebar navigation"
        >
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

          {isAuthenticated &&
            items.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(item, pathname);

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

          {/* Login entry — only for guests. Visually identical to a normal
              sidebar item: same navItemBase classes, same hover / active /
              focus / spacing / icon / typography as the rows above. The pill
              deliberately does NOT highlight this row, and we exclude it
              from `items` so the existing Dashboard/Apply Connection/...
              measurements are unchanged. */}
          {showLoginItem && (
            <Link
              href="/login"
              prefetch={true}
              aria-current={pathname === '/login' ? 'page' : undefined}
              className={[
                navItemBase,
                pressedState,
                'relative rounded-xl group overflow-hidden',
                pathname === '/login'
                  ? 'text-white shadow-sm bg-surface-dark'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              ].join(' ')}
            >
              <span className="relative z-10 flex items-center gap-3 w-full">
                <LogIn
                  className={[
                    'h-4 w-4 shrink-0 transition-transform duration-150',
                    'group-hover:scale-110',
                    pathname === '/login'
                      ? 'text-white'
                      : 'text-slate-400 group-hover:text-slate-700',
                  ].join(' ')}
                  aria-hidden="true"
                />
                <span className="text-sm font-medium">Login</span>
              </span>
            </Link>
          )}
        </nav>
      </div>

      {/* Sign Out button — pinned above Helpline card */}
      {isAuthenticated && (
        <button
          type="button"
          onClick={() => {
            if (!isLoadingLogout) {
              logout(router);
            }
          }}
          disabled={isLoadingLogout}
          aria-busy={isLoadingLogout}
          className={[
            navItemBase,
            pressedState,
            'w-full rounded-xl px-3 py-2.5 mb-3 text-xs font-semibold shrink-0',
            'transition-colors duration-150 cursor-pointer border border-transparent',
            isLoadingLogout
              ? 'bg-red-50 text-red-600 opacity-70 cursor-not-allowed'
              : 'text-red-600 hover:bg-red-50 hover:border-red-200 active:bg-red-100',
          ].join(' ')}
          aria-label={isLoadingLogout ? 'Signing out, please wait' : 'Sign out'}
        >
          <span className="flex items-center gap-3 w-full">
            {isLoadingLogout ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-red-600" aria-hidden="true" />
            ) : (
              <LogOut className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
            )}
            <span className="text-sm font-medium">
              {isLoadingLogout ? 'Signing out…' : 'Sign Out'}
            </span>
          </span>
        </button>
      )}

      {/* Helpline card — pinned at bottom of sidebar */}
      <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500 space-y-2 border border-slate-200/80 shrink-0">
        <div className="flex items-center gap-2 font-bold text-slate-700">
          <HelpCircle className="h-4 w-4 text-primary shrink-0" />
          BSES Helpline
        </div>
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-amber-600 shrink-0" />
          <span>
            Emergency: <strong className="text-slate-800">19123</strong>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 text-emerald-600 shrink-0" />
          <span>
            WhatsApp: <strong className="text-slate-800">8800991912</strong>
          </span>
        </div>
      </div>
    </aside>
  );
};
