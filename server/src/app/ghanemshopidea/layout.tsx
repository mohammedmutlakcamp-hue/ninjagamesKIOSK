import type { Metadata } from 'next';
import PasswordGate from '@/components/shop/PasswordGate';
import CityPicker from '@/components/shop/CityPicker';
import ShopHeader from '@/components/shop/ShopHeader';
import ShopFooter from '@/components/shop/ShopFooter';

export const metadata: Metadata = {
  title: 'Ninja Games · PC & PS Store · Ghanem Shop Pitch',
  description: 'Internal preview — proposal for monetizing the Ninja Games Google Maps rank with a PC parts and gaming gear store.',
  robots: { index: false, follow: false },
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <PasswordGate>
      <div className="min-h-screen bg-neutral-50 text-neutral-900">
        <ShopHeader />
        <CityPicker />
        <main>{children}</main>
        <ShopFooter />
      </div>
    </PasswordGate>
  );
}
