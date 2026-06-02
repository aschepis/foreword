/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      /* All color tokens proxy CSS variables so the same Tailwind class
         works in both light (default) and dark modes. The variables are
         defined in styles.css and flipped on <html class="dark">. */
      colors: {
        bg: {
          DEFAULT: 'var(--bg)',
          soft:    'var(--bg-soft)',
          softer:  'var(--bg-softer)',
          line:    'var(--bg-line)',
          hover:   'var(--bg-hover)',
        },
        text: {
          DEFAULT: 'var(--text)',
          muted:   'var(--text-muted)',
          dim:     'var(--text-dim)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          green:   'var(--accent-green)',
          red:     'var(--accent-red)',
          yellow:  'var(--accent-yellow)',
          purple:  'var(--accent-purple)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen', 'Ubuntu', 'sans-serif'],
        serif: ['"Source Serif 4"', '"Source Serif Pro"', 'Charter', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      letterSpacing: {
        eyebrow: '0.14em',
      },
    },
  },
  plugins: [],
};
