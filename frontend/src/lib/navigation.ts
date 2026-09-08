import React from 'react';
import {
  LayoutDashboard,
  FilePlus,
  FolderOpen,
  UserCheck,
  Settings,
  HelpCircle,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * The list of route patterns this item is "active" on. A pattern matches if
   * the current pathname equals the pattern exactly OR the pathname starts with
   * the pattern followed by a `/`. This is the source of truth for active state
   * — no manual `exact` boolean to maintain, no state, no side effects.
   */
  activeOn: string[];
  /**
   * Excluded route prefixes. If the current pathname starts with one of these,
   * this nav item is NOT considered active even if it would otherwise match.
   * Used so e.g. "Apply Connection" can match only its own flow, while
   * "Track Applications" matches every other `/connections/*` child route.
   */
  excludeOn?: string[];
}

export const consumerNavItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    activeOn: ['/dashboard'],
  },
  {
    label: 'Apply Connection',
    href: '/connections/apply',
    icon: FilePlus,
    activeOn: ['/connections/apply'],
  },
  {
    label: 'Track Applications',
    href: '/connections',
    icon: FolderOpen,
    activeOn: ['/connections'],
    excludeOn: ['/connections/apply'],
  },
  {
    label: 'My Profile',
    href: '/profile',
    icon: UserCheck,
    activeOn: ['/profile'],
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    activeOn: ['/settings'],
  },
  {
    label: 'Help & FAQs',
    href: '/help-center',
    icon: HelpCircle,
    activeOn: ['/help-center'],
  },
];

export const adminNavItems: NavItem[] = [
  {
    label: 'Admin Overview',
    href: '/admin/dashboard',
    icon: LayoutDashboard,
    activeOn: ['/admin/dashboard'],
  },
  {
    label: 'User Directory',
    href: '/admin/users',
    icon: UserCheck,
    activeOn: ['/admin/users'],
  },
  {
    label: 'Connection Requests',
    href: '/admin/connections',
    icon: FolderOpen,
    activeOn: ['/admin/connections', '/admin/connection-requests'],
  },
];

/** True for role values that grant admin portal access. */
export function isAdminRole(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

/**
 * Determine whether a nav item is active for the given pathname.
 *
 * Rules (no manual `exact` boolean required):
 *   1. The pathname must equal one of the item's `activeOn` patterns, OR
 *      start with one of those patterns followed by `/` (so a child route
 *      highlights its parent section — e.g. `/admin/connections/abc` lights up
 *      "Connection Requests").
 *   2. The pathname must NOT start with any `excludeOn` prefix.
 *
 * The function is pure: it depends only on its inputs, so it is correct under
 * direct URL navigation, page refresh, and nested routes alike.
 */
export function isNavActive(item: NavItem, pathname: string): boolean {
  const matches = item.activeOn.some(
    (pattern) => pathname === pattern || pathname.startsWith(pattern + '/'),
  );
  if (!matches) return false;
  if (item.excludeOn && item.excludeOn.some((ex) => pathname.startsWith(ex))) {
    return false;
  }
  return true;
}