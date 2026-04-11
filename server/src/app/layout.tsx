import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ninja Games - Gaming Center',
  description: 'The ultimate gaming cafe experience',
  icons: { icon: '/logo.jpeg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <script src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js" defer></script>
        <script src="/onesignal-init.js" defer></script>
      </head>
      <body className="bg-ninja-dark min-h-screen">{children}</body>
    </html>
  );
}
