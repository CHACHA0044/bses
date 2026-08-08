/**
 * InteractionProps — centralized interaction class system (DRY).
 *
 * Every interactive element (buttons, links, cards, sidebar items, quick
 * actions, table rows, dropdowns, dialogs) should reference these constants
 * instead of implementing hover/press/focus logic individually.
 *
 * Usage:
 *   import { interactiveFull, hoverLift } from '@/components/ui/InteractionProps';
 *   className={cn(interactiveFull, hoverLift, ...)}
 */

/** Applied to EVERY interactive element. */
export const interactiveBase =
  'cursor-pointer select-none outline-none transition-all duration-150 ease-out ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

/** Tactile press-down response (subtle scale + dim). */
export const pressedState =
  'active:scale-[0.97] active:shadow-sm active:brightness-95';

/** Full standard interactive element: base + press feedback. */
export const interactiveFull = `${interactiveBase} ${pressedState}`;

/** Subtle upward float on hover — use on cards and large CTAs. */
export const hoverLift = 'hover:-translate-y-0.5 hover:shadow-md will-change-transform';

/** Lift for larger hero/action cards. */
export const hoverLiftStrong = 'hover:-translate-y-1 hover:shadow-lg will-change-transform';

/** Card hover — lift + border highlight. */
export const cardHover =
  'hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 will-change-transform ' +
  'transition-all duration-150 ease-out cursor-pointer';

/** Used on sidebar items and compact nav links. */
export const navItemBase =
  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ' +
  'transition-all duration-150 ease-out cursor-pointer select-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1';

/** Icon button / action icon. */
export const iconButton =
  'inline-flex items-center justify-center rounded-full ' +
  'transition-all duration-150 ease-out ' +
  'hover:bg-slate-100 active:bg-slate-200 active:scale-[0.95] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ' +
  'cursor-pointer select-none';

/** Loading / busy state for buttons (keeps layout, blocks double-submit). */
export const loadingState = 'cursor-wait opacity-80 pointer-events-none';

/** Disabled state (distinct from generic disabled styles for explicit use). */
export const disabledState = 'opacity-50 cursor-not-allowed pointer-events-none';

/** Success confirmation state (used briefly after async success). */
export const successState =
  'text-emerald-600 border-emerald-200 bg-emerald-50';

/** Plain color-only transition for links. */
export const linkTransition = 'transition-colors duration-150 ease-out';

/** Hover underline for text links. */
export const linkUnderline = 'hover:underline underline-offset-4';
