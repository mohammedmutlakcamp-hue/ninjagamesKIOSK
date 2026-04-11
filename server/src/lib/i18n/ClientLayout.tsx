'use client';

import { ReactNode } from 'react';
import { LanguageProvider } from './LanguageContext';

export function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      {children}
    </LanguageProvider>
  );
}
