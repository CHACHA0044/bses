import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '2rem', lg: '4rem', xl: '5rem' },
      screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-roboto)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* ── Design Tokens ───────────────────────────────── */
        primary: {
          DEFAULT: '#C41E2E',   // brand maroon-red
          dark:    '#9B1522',
          light:   '#E03347',
          foreground: '#FFFFFF',
        },
        surface: {
          dark:  '#0F172A',     // single authoritative navy (hero, footer, dark cards)
          navy:  '#1E3A5F',     // secondary navy accent
          card:  '#FFFFFF',
          muted: '#F8FAFC',
        },
        accent: {
          DEFAULT: '#F59E0B',   // amber — ONLY for primary CTA buttons
          dark:    '#D97706',
          foreground: '#0F172A',
        },
        /* ── Semantic Status Tokens ──────────────────────── */
        success:  { DEFAULT: '#16A34A', light: '#DCFCE7', foreground: '#FFFFFF' },
        error:    { DEFAULT: '#DC2626', light: '#FEE2E2', foreground: '#FFFFFF' },
        warning:  { DEFAULT: '#D97706', light: '#FEF3C7', foreground: '#FFFFFF' },
        info:     { DEFAULT: '#2563EB', light: '#DBEAFE', foreground: '#FFFFFF' },
        /* ── shadcn / Radix compat tokens ───────────────── */
        border:       'hsl(var(--border))',
        input:        'hsl(var(--input))',
        ring:         'hsl(var(--ring))',
        background:   'hsl(var(--background))',
        foreground:   'hsl(var(--foreground))',
        muted:        { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        card:         { DEFAULT: 'hsl(var(--card))',  foreground: 'hsl(var(--card-foreground))' },
        popover:      { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        /* ── Legacy compat (keep for existing JSX) ───────── */
        bses: {
          red:       '#C41E2E',
          'red-dark':'#9B1522',
          navy:      '#0F172A',
          'navy-dark':'#070E1A',
          amber:     '#F59E0B',
          slate:     '#475569',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        'slide-down': {
          '0%':   { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%':   { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-8px)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        shimmer:    'shimmer 1.6s infinite linear',
        'slide-down': 'slide-down 0.22s ease-out',
        'fade-in':  'fade-in 0.18s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
