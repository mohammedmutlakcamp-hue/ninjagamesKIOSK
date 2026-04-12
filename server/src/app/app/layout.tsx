import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Ninja Games',
  description: 'Ninja Games Gaming Center - Your gaming companion',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ninja Games',
    startupImage: [
      { url: '/img/icon-512.png' },
    ],
  },
  icons: {
    icon: [
      { url: '/img/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/img/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/img/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
