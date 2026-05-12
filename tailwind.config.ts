import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Background + surface tokens
        ink: 'var(--color-bg)',
        panel: 'var(--color-panel)',
        panel2: 'var(--color-panel-2)',
        // Border tokens. `border` shadows Tailwind's default border-color
        // utility — that's intentional, `border-border` resolves to this var.
        border: 'var(--color-border)',
        border2: 'var(--color-border-2)',
        // Text tokens
        muted: 'var(--color-text-muted)',
        muted2: 'var(--color-text-muted-2)',
        // Accent: `red` and `accent` are aliases for the same token. `red`
        // was the original brand-color class name across the codebase; we
        // keep it working so nothing has to be renamed.
        red: 'var(--color-accent)',
        accent: 'var(--color-accent)',
        'accent-faint': 'var(--color-accent-faint)',
        'accent-gradient': 'var(--color-accent-gradient)',
        // Misc theme-aware tokens
        'bar-track': 'var(--color-bar-track)',
        'bar-loser': 'var(--color-bar-loser)',
        'row-divider': 'var(--color-row-divider)',
        'rank-podium': 'var(--color-rank-podium)',
        'rank-rest': 'var(--color-rank-rest)',
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
