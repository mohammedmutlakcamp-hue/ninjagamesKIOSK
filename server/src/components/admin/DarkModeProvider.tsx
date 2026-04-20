'use client';

// Dark/Light mode for the admin panel.
// Toggles a class on <body> so the CSS variables in globals.css flip
// backgrounds, surface fills, and text colors without touching every
// component. Persisted to localStorage('admin-theme').

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
interface Ctx {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const DarkModeContext = createContext<Ctx>({
  theme: 'light',
  toggle: () => {},
  setTheme: () => {},
});

const KEY = 'admin-theme';

export function DarkModeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored === 'dark' || stored === 'light') setThemeState(stored);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    // Apply on <body> so it covers modals / portals too.
    const body = document.body;
    body.classList.toggle('admin-dark', theme === 'dark');
    body.classList.toggle('admin-light', theme === 'light');
    // Remove on unmount so the kiosk route isn't accidentally dark.
    return () => {
      body.classList.remove('admin-dark');
      body.classList.remove('admin-light');
    };
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try { window.localStorage.setItem(KEY, t); } catch { /* ignore */ }
  };

  const toggle = () => setTheme(theme === 'light' ? 'dark' : 'light');

  return (
    <DarkModeContext.Provider value={{ theme, toggle, setTheme }}>
      {children}
    </DarkModeContext.Provider>
  );
}

export function useDarkMode() {
  return useContext(DarkModeContext);
}
