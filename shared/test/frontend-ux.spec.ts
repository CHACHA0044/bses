import { describe, it, expect } from 'vitest';

// 1. Initials derivation logic
function getInitials(u: { firstName?: string; lastName?: string; username?: string; email?: string } | null) {
  if (!u) return '';
  const first = u.firstName?.trim() || '';
  const last = u.lastName?.trim() || '';
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  if (first) return first.slice(0, 2).toUpperCase();
  if (u.username) return u.username.slice(0, 2).toUpperCase();
  if (u.email) return u.email.slice(0, 2).toUpperCase();
  return 'U';
}

// 2. Personalized time-based greeting logic
function getGreeting(firstName?: string | null, hour: number = 10) {
  let timePrefix = 'Good morning';
  if (hour >= 12 && hour < 17) {
    timePrefix = 'Good afternoon';
  } else if (hour >= 17) {
    timePrefix = 'Good evening';
  }
  const name = firstName?.trim();
  return name ? `${timePrefix}, ${name}!` : `${timePrefix}!`;
}

// 3. Property address validation logic
function validatePropertyAddress(address?: string): { ok: boolean; error?: string } {
  if (!address || address.trim().length < 10) {
    return { ok: false, error: 'Please enter your complete property address (at least 10 characters) before continuing.' };
  }
  return { ok: true };
}

describe('Frontend UX & Helper Utilities Test Suite', () => {
  describe('Initials Derivation (getInitials)', () => {
    it('returns initials for first and last name', () => {
      expect(getInitials({ firstName: 'Rajesh', lastName: 'Sharma' })).toBe('RS');
    });

    it('returns first two letters of first name when last name is missing', () => {
      expect(getInitials({ firstName: 'Rajesh', lastName: '' })).toBe('RA');
    });

    it('returns first two letters of username when names are missing', () => {
      expect(getInitials({ username: 'rajesh2026' })).toBe('RA');
    });

    it('returns first two letters of email when names and username are missing', () => {
      expect(getInitials({ email: 'rajesh@example.com' })).toBe('RA');
    });

    it('never returns "??" fallback', () => {
      expect(getInitials({ firstName: 'A' })).not.toBe('??');
      expect(getInitials(null)).toBe('');
    });
  });

  describe('Personalized Time-Based Greeting (getGreeting)', () => {
    it('returns Good morning for morning hours', () => {
      expect(getGreeting('Rajesh', 9)).toBe('Good morning, Rajesh!');
    });

    it('returns Good afternoon for afternoon hours', () => {
      expect(getGreeting('Rajesh', 14)).toBe('Good afternoon, Rajesh!');
    });

    it('returns Good evening for evening hours', () => {
      expect(getGreeting('Rajesh', 19)).toBe('Good evening, Rajesh!');
    });

    it('handles missing first name gracefully', () => {
      expect(getGreeting(null, 10)).toBe('Good morning!');
      expect(getGreeting('', 14)).toBe('Good afternoon!');
    });
  });

  describe('Property Address Step Validation', () => {
    it('rejects short or missing property address', () => {
      expect(validatePropertyAddress('')).toEqual({
        ok: false,
        error: 'Please enter your complete property address (at least 10 characters) before continuing.',
      });
      expect(validatePropertyAddress('Delhi')).toEqual({
        ok: false,
        error: 'Please enter your complete property address (at least 10 characters) before continuing.',
      });
    });

    it('accepts property address with 10 or more characters', () => {
      expect(validatePropertyAddress('Flat 101, Mayur Vihar Phase 1, Delhi')).toEqual({ ok: true });
    });
  });
});
