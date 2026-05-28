import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hot:     '#ff5c00',
        primary: '#ffb59a',
        green:   '#00c24d',
        gold:    '#d97706',
        s0: '#080808', s1: '#141414', s2: '#1e1e1e',
        s3: '#282828', s4: '#333333', s5: '#3e3e3e',
      },
      fontFamily: {
        // Fraunces italic = brand display type (hero headings, GO LIVE button, RIGHTNOW wordmark)
        display: ['"Fraunces"', 'Georgia', 'serif'],
        // DM Sans = all UI body copy, labels, inputs
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Strict 6-step type scale — no arbitrary sizes
        '2xs': ['11px', { lineHeight: '1.4',  fontWeight: '500' }],
        xs:    ['13px', { lineHeight: '1.5',  fontWeight: '400' }],
        sm:    ['15px', { lineHeight: '1.65', fontWeight: '400' }],
        base:  ['16px', { lineHeight: '1.7',  fontWeight: '400' }],
        lg:    ['18px', { lineHeight: '1.4',  fontWeight: '500' }],
        xl:    ['24px', { lineHeight: '1.2',  fontWeight: '500' }],
        '2xl': ['32px', { lineHeight: '1.1',  fontWeight: '700' }],
        '3xl': ['48px', { lineHeight: '1.05', fontWeight: '800' }],
      },
      spacing: {
        // 8px base grid — only use multiples of 4
        '0.5': '2px',
        '1':   '4px',
        '2':   '8px',
        '3':   '12px',
        '4':   '16px',
        '5':   '20px',
        '6':   '24px',
        '8':   '32px',
        '10':  '40px',
        '12':  '48px',
        '16':  '64px',
        '20':  '80px',
      },
      borderRadius: {
        DEFAULT: '16px',
        sm:      '8px',
        md:      '12px',
        lg:      '16px',
        xl:      '20px',
        full:    '9999px',
      },
      boxShadow: {
        'glow-orange': '0 0 30px 10px rgba(255,181,154,0.4)',
        'glow-hot':    '0 0 50px rgba(255,92,0,0.6)',
        'glow-green':  '0 0 24px rgba(0,194,77,0.5)',
        'focus':       '0 0 0 2px #080808, 0 0 0 4px #ff5c00',
      },
      keyframes: {
        'pulse-ring': {
          '0%':        { transform: 'scale(0.8)', opacity: '0.8' },
          '80%, 100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.455,0.03,0.515,0.955) infinite',
        breathe:      'breathe 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
