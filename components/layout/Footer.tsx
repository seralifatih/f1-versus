const VERSION = 'v0.1.0'

export function Footer() {
  return (
    <footer className="mt-16 pt-6 border-t border-border flex justify-between items-center text-xs text-muted2">
      <span>
        Data:{' '}
        <a
          href="https://github.com/f1db/f1db"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted hover:text-current transition-colors"
        >
          F1DB
        </a>{' '}
        · Unofficial · Built by{' '}
        <a
          href="https://noktastudio.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-red hover:underline"
        >
          Nokta Studio
        </a>
      </span>
      <span className="font-mono">{VERSION}</span>
    </footer>
  )
}
