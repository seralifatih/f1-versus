import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── New FIA-technical palette ──────────────────────────────
        bg: 'var(--color-bg)',
        panel: 'var(--color-panel)',
        'panel-2': 'var(--color-panel-2)',
        'panel-raised': 'var(--color-panel-raised)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        'border-bright': 'var(--color-border-bright)',
        text: 'var(--color-text)',
        muted: 'var(--color-text-muted)',
        'muted-2': 'var(--color-text-muted-2)',
        dim: 'var(--color-text-dim)',
        'sector-purple': 'var(--color-sector-purple)',
        'sector-green': 'var(--color-sector-green)',
        'sector-yellow': 'var(--color-sector-yellow)',
        'sector-red': 'var(--color-sector-red)',
        'curb-red': 'var(--color-curb-red)',
        'curb-white': 'var(--color-curb-white)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
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
