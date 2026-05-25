/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // --- Brand accents (required tokens) ---
        primary: '#ffb59a',
        hot: '#ff5c00',
        green: '#00e55b',
        gold: '#FFD700',

        // --- Surface / background ramp (required tokens) ---
        s0: '#080808',
        s1: '#111111',
        s2: '#181818',
        s3: '#202020',
        s4: '#2a2a2a',

        // --- Extended design-system palette (from DESIGN.md) ---
        surface: '#131313',
        'on-surface': '#e2e2e2',
        'on-surface-variant': '#e4beb1',
        'surface-container-lowest': '#0e0e0e',
        'surface-container-low': '#1b1b1b',
        'surface-container': '#1f1f1f',
        'surface-container-high': '#2a2a2a',
        'surface-container-highest': '#353535',
        outline: '#ab897d',
        'outline-variant': '#5b4137',
        'primary-container': '#ff5c00',
        'on-primary': '#5a1b00',
        secondary: '#ebffe6',
        'secondary-container': '#00fe66',
        error: '#ffb4ab',
      },
      fontFamily: {
        display: ['"Archivo Narrow"', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '44px', letterSpacing: '-0.04em', fontWeight: '800' }],
        'headline-lg': [
          '32px',
          { lineHeight: '36px', letterSpacing: '-0.02em', fontWeight: '700' },
        ],
        'headline-md': [
          '24px',
          { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' },
        ],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-bold': ['14px', { lineHeight: '20px', letterSpacing: '0.05em', fontWeight: '700' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '500' }],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        sm: '0.25rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
      },
      boxShadow: {
        'glow-orange': '0 0 30px 10px rgba(255, 181, 154, 0.4)',
        'glow-hot': '0 0 50px rgba(255, 92, 0, 0.6)',
        'glow-green': '0 0 24px rgba(0, 229, 91, 0.5)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '0.8' },
          '80%, 100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite',
        breathe: 'breathe 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
