'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Logo } from '../common/Logo';
import { Button } from '../ui/Button';
import { interactiveBase, navItemBase, iconButton } from '../ui/InteractionProps';
import {
  Bell,
  LogOut,
  Phone,
  ChevronRight,
  LayoutDashboard,
  FilePlus,
  FolderOpen,
  UserCheck,
  Settings,
  HelpCircle,
  Home,
} from 'lucide-react';

/* ── Public nav (unauthenticated only) ─────────────────────────── */
const publicNavLinks = [
  { href: '/',            label: 'Home' },
  { href: '/about',       label: 'About Portal' },
  { href: '/help-center', label: 'Help & FAQs' },
  { href: '/dpdp-act',    label: 'DPDP Compliance' },
];

/* ── Authenticated mobile nav sequence ──────────────────────────── */
const authMobileNavItems = [
  { href: '/',                 label: 'Home',            icon: Home },
  { href: '/profile',          label: 'My Profile',      icon: UserCheck },
  { href: '/connections/apply',label: 'New Connection',  icon: FilePlus },
  { href: '/connections',      label: 'Track Applications', icon: FolderOpen },
  { href: '/settings',         label: 'Settings',        icon: Settings },
  { href: '/help-center',      label: 'Help & FAQs',     icon: HelpCircle },
];

/* Build the contextual mobile nav: hide current page, prepend Dashboard if not on it */
function buildMobileNav(pathname: string, dashHref: string) {
  const items = authMobileNavItems.filter((item) => item.href !== pathname);
  if (pathname !== dashHref) {
    items.unshift({ href: dashHref, label: 'Dashboard', icon: LayoutDashboard });
  }
  return items;
}

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const dashHref = (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') ? '/admin/dashboard' : '/dashboard';

  // Mobile drawer states
  const [menuOpen, setMenuOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeMenu = useCallback(() => {
    if (!menuOpen || isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setMenuOpen(false);
      setIsClosing(false);
    }, 180);
  }, [menuOpen, isClosing]);

  const toggleMenu = useCallback(() => {
    if (menuOpen) {
      closeMenu();
    } else {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      setIsClosing(false);
      setMenuOpen(true);
    }
  }, [menuOpen, closeMenu]);

  // Lock scroll on the whole page (window + inner <main> scroller) while open
  useEffect(() => {
    const locked = menuOpen && !isClosing;
    document.body.classList.toggle('menu-open', locked);
    document.documentElement.classList.toggle('menu-open', locked);
    return () => {
      document.body.classList.remove('menu-open');
      document.documentElement.classList.remove('menu-open');
    };
  }, [menuOpen, isClosing]);

  // Close on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, closeMenu]);

  // Close (with exit animation) when the route changes
  useEffect(() => {
    if (menuOpen) closeMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : '??';

  const mobileNavItems = isAuthenticated ? buildMobileNav(pathname, dashHref) : [];

  return (
    <>
      <header className="sticky top-0 z-40 h-16 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-10 flex h-full items-center justify-between gap-4">
          {/* Brand Logo */}
          <Link
            href="/"
            prefetch={true}
            className={`flex shrink-0 items-center gap-2 rounded-lg p-1 ${interactiveBase} hover:opacity-90`}
            aria-label="BSES Delhi Portal home"
          >
            <Logo size="sm" />
          </Link>

          {/* Desktop Public Nav — unauthenticated only */}
          {!isAuthenticated && !isLoading && (
            <nav className="hidden md:flex items-center gap-1 text-sm font-semibold text-slate-600">
              {publicNavLinks.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    prefetch={true}
                    className={[
                      'relative px-3 py-1.5 rounded-lg transition-all duration-150 ease-out',
                      'hover:bg-slate-100 hover:text-primary',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                      isActive ? 'text-primary font-bold bg-primary/5' : 'text-slate-600',
                    ].join(' ')}
                  >
                    {link.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                    )}
                  </Link>
                );
              })}
            </nav>
          )}

          {/* Right Actions */}
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Emergency helpline chip */}
            <a
              href="tel:19123"
              className="hidden lg:flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100 transition-colors duration-150 cursor-pointer"
            >
              <Phone className="h-3.5 w-3.5 text-amber-600" />
              <span>19123 — 24×7</span>
            </a>

            {/* Auth section */}
            {isLoading ? (
              /* Session is still being verified — show a neutral placeholder so
                 the nav never flickers between logged-in / logged-out states. */
              <div className="h-8 w-8 rounded-full bg-slate-100 skeleton-shimmer" aria-hidden="true" />
            ) : isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link
                  href={dashHref}
                  prefetch={true}
                  className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-primary transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-100 duration-150"
                >
                  <LayoutDashboard className="h-4 w-4 text-primary" />
                  Dashboard
                </Link>

                <button className={iconButton} aria-label="Notifications" title="Notifications">
                  <Bell className="h-4 w-4" />
                </button>

                <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-dark text-white text-xs font-bold"
                    aria-hidden="true"
                  >
                    {initials}
                  </div>
                  <div className="hidden md:flex flex-col leading-none">
                    <span className="text-xs font-bold text-slate-900">
                      {user?.firstName} {user?.lastName}
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">{user?.role}</span>
                  </div>
                </div>

                <button
                  onClick={() => logout()}
                  className={iconButton}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" prefetch={true} className="hidden sm:block">
                  <Button variant="secondary" size="sm">Consumer Login</Button>
                </Link>
                <Link href="/register" prefetch={true}>
                  <Button variant="cta" size="sm">New Registration</Button>
                </Link>
              </div>
            )}

            {/* Hamburger — smooth icon morph */}
            <button
              onClick={toggleMenu}
              className={`md:hidden rounded-xl p-2.5 text-slate-700 hover:bg-slate-100 transition-all duration-200 cursor-pointer ${interactiveBase}`}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
            >
              <div className="relative h-5 w-5">
                <span
                  className="absolute left-0 top-[3px] h-[2px] w-full bg-current rounded-full transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] origin-center"
                  style={
                    menuOpen && !isClosing
                      ? { transform: 'translateY(6px) rotate(45deg)' }
                      : { transform: 'translateY(0) rotate(0deg)' }
                  }
                />
                <span
                  className="absolute left-0 top-[10px] h-[2px] w-full bg-current rounded-full transition-all duration-150 ease-in-out"
                  style={
                    menuOpen && !isClosing
                      ? { opacity: 0, scale: '0 1' }
                      : { opacity: 1, scale: '1 1' }
                  }
                />
                <span
                  className="absolute left-0 top-[17px] h-[2px] w-full bg-current rounded-full transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] origin-center"
                  style={
                    menuOpen && !isClosing
                      ? { transform: 'translateY(-7px) rotate(-45deg)' }
                      : { transform: 'translateY(0) rotate(0deg)' }
                  }
                />
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile Navigation Drawer ───────────────────────────────── */}
      {menuOpen && (
        <>
          {/* Backdrop — blocks interaction with page content */}
          <div
            className={`md:hidden fixed inset-0 z-30 bg-slate-900/60 backdrop-blur-[2px] ${
              isClosing ? 'mobile-backdrop-exit' : 'mobile-backdrop-enter'
            }`}
            onClick={closeMenu}
            aria-hidden="true"
          />

          {/* Drawer — solid white, layered above content but below header */}
          <div
            id="mobile-nav"
            role="navigation"
            aria-label="Mobile navigation"
            className={[
              'md:hidden fixed inset-x-0 top-16 z-40',
              'bg-white border-b border-slate-200 shadow-xl',
              'overflow-y-auto max-h-[calc(100dvh-4rem)]',
              isClosing ? 'mobile-menu-exit' : 'mobile-menu-enter',
            ].join(' ')}
          >
            <div className="px-4 py-3 space-y-1">
              {isAuthenticated ? (
                <>
                  {mobileNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={true}
                        onClick={closeMenu}
                        className={[
                          navItemBase,
                          'justify-between w-full rounded-xl px-4 py-3.5 min-h-[48px]',
                          isActive
                            ? 'bg-primary/10 text-primary font-bold border border-primary/20'
                            : 'text-slate-800 hover:bg-slate-100 hover:text-primary',
                        ].join(' ')}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <span className="flex items-center gap-3 text-base">
                          <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
                          {item.label}
                        </span>
                        <ChevronRight className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-slate-300'}`} />
                      </Link>
                    );
                  })}

                  <div className="my-2 border-t border-slate-100" />

                  <button
                    onClick={() => { logout(); }}
                    className={`${navItemBase} justify-between w-full rounded-xl px-4 py-3.5 min-h-[48px] text-error hover:bg-red-50 text-base`}
                  >
                    <span className="flex items-center gap-3">
                      <LogOut className="h-4 w-4 shrink-0" />
                      Sign Out
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-red-300" />
                  </button>
                </>
              ) : (
                <>
                  {publicNavLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      prefetch={true}
                      onClick={closeMenu}
                      className={[
                        navItemBase,
                        'justify-between w-full rounded-xl px-4 py-3.5 min-h-[48px]',
                        pathname === link.href
                          ? 'bg-primary/10 text-primary font-bold border border-primary/20'
                          : 'text-slate-800 hover:bg-slate-100 hover:text-primary',
                      ].join(' ')}
                      aria-current={pathname === link.href ? 'page' : undefined}
                    >
                      <span className="text-base">{link.label}</span>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${pathname === link.href ? 'text-primary' : 'text-slate-400'}`} />
                    </Link>
                  ))}
                  <div className="my-2 border-t border-slate-100" />
                  <div className="space-y-2 pb-2">
                    <Link href="/login" prefetch={true} onClick={closeMenu}>
                      <Button variant="secondary" size="md" fullWidth>Consumer Login</Button>
                    </Link>
                    <Link href="/register" prefetch={true} onClick={closeMenu}>
                      <Button variant="cta" size="md" fullWidth>New Registration</Button>
                    </Link>
                  </div>
                </>
              )}

              {/* Helpline chip */}
              <div className="mt-2 mb-1 flex items-center justify-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs font-bold text-amber-700">
                <Phone className="h-3.5 w-3.5" />
                24×7 Emergency Helpline: 19123
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
