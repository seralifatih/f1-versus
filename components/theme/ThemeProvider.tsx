'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'dark' | 'light'

const ThemeContext = createContext<{
  theme: Theme
  toggleTheme: () => void
}>({
  theme: 'dark',
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR + hydration: server has no DOM, so render with the default. The
  // inline <script> in app/layout.tsx has already painted the correct
  // theme by the time we hydrate; we read that on mount to sync state.
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme') as Theme | null
    if (current === 'dark' || current === 'light') setTheme(current)
  }, [])

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('f1versus-theme', next)
    } catch {
      // localStorage unavailable (private mode, blocked storage). The user's
      // choice still applies for the rest of the session.
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
