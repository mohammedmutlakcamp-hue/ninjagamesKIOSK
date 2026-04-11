import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Ninja Ops',
  description: 'Ninja Games - Admin Chat & Orders',
  manifest: '/manifest-admin.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ninja Ops',
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
  themeColor: '#0a0a0a',
};

export default function AdminChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
