import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0a0a0b',
        panel: '#101012',
        panel2: '#141416',
        border: '#1f1f22',
        border2: '#2a2a2e',
        muted: '#666666',
        muted2: '#888888',
        red: '#ef3340',
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.04em',
        tighter: '-0.03em',
      },
    },
  },
  plugins: [
    plugin(({ matchUtilities }) => {
      matchUtilities({
        'font-vary': (value: string) => ({
          fontVariationSettings: value,
        }),
      })
    }),
  ],
}

export default config
