import type { Metadata } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import PasswordGate from '@/components/shop/PasswordGate';
import CityPicker from '@/components/shop/CityPicker';
import ShopHeader from '@/components/shop/ShopHeader';
import ShopFooter from '@/components/shop/ShopFooter';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ninja Games · PC & PS Store · Ghanem Shop Pitch',
  description:
    'Internal preview — proposal for monetizing the Ninja Games Google Maps rank with a PC parts and gaming gear store.',
  robots: { index: false, follow: false },
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${spaceGrotesk.variable}`} style={{ fontFamily: 'var(--font-inter, system-ui)' }}>
      <PasswordGate>
        <div className="min-h-screen bg-white text-[#0a0a0a]">
          <ShopHeader />
          <CityPicker />
          <main>{children}</main>
          <ShopFooter />
        </div>
      </PasswordGate>
    </div>
  );
}
