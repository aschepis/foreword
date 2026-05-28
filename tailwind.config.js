/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0d1117',
          soft: '#161b22',
          softer: '#1c2128',
          line: '#30363d',
        },
        text: {
          DEFAULT: '#e6edf3',
          muted: '#8b949e',
          dim: '#6e7681',
        },
        accent: {
          DEFAULT: '#58a6ff',
          green: '#3fb950',
          red: '#f85149',
          yellow: '#d29922',
          purple: '#bc8cff',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
