import Link from 'next/link';
import Image from 'next/image';
import { Mail, Phone, MapPin, Instagram } from 'lucide-react';

export default function ShopFooter() {
  return (
    <footer className="bg-neutral-950 text-neutral-300 mt-20">
      <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Image src="/logo.jpeg" alt="Ninja Games" width={40} height={40} className="rounded-lg" />
            <div>
              <div className="font-bold text-white">NINJA GAMES</div>
              <div className="text-[10px] text-neutral-500 tracking-widest">PC & PS STORE</div>
            </div>
          </div>
          <p className="text-xs text-neutral-500 leading-relaxed">
            From the same team behind Amman&apos;s most-rated gaming center. We sell what we use — every PC tested in the cafe before it ships to you.
          </p>
        </div>

        <div>
          <h3 className="text-white font-semibold text-sm mb-3">Shop</h3>
          <ul className="space-y-2 text-xs">
            <li><Link href="/ghanemshopidea/c/prebuilt" className="hover:text-[#39FF14]">Pre-Built PCs</Link></li>
            <li><Link href="/ghanemshopidea/c/laptop" className="hover:text-[#39FF14]">Gaming Laptops</Link></li>
            <li><Link href="/ghanemshopidea/c/gpu" className="hover:text-[#39FF14]">Graphics Cards</Link></li>
            <li><Link href="/ghanemshopidea/c/cpu" className="hover:text-[#39FF14]">Processors</Link></li>
            <li><Link href="/ghanemshopidea/c/controller" className="hover:text-[#39FF14]">Controllers</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-semibold text-sm mb-3">Help</h3>
          <ul className="space-y-2 text-xs">
            <li><a className="hover:text-[#39FF14]">Delivery & Returns</a></li>
            <li><a className="hover:text-[#39FF14]">PC Build Service</a></li>
            <li><a className="hover:text-[#39FF14]">Warranty</a></li>
            <li><a className="hover:text-[#39FF14]">Trade-in Program</a></li>
            <li><Link href="https://www.ninjagamesjo.com" className="hover:text-[#39FF14]">Visit the Cafe</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white font-semibold text-sm mb-3">Contact</h3>
          <ul className="space-y-2 text-xs">
            <li className="flex items-center gap-2"><MapPin className="w-3 h-3" /> Amman, Jordan</li>
            <li className="flex items-center gap-2"><Phone className="w-3 h-3" /> +962 XX XXX XXXX</li>
            <li className="flex items-center gap-2"><Mail className="w-3 h-3" /> shop@ninjagamesjo.com</li>
            <li className="flex items-center gap-2"><Instagram className="w-3 h-3" /> @ninjagamesjo</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-neutral-900 py-4 text-center text-[11px] text-neutral-600">
        © {new Date().getFullYear()} Ninja Games. All trademarks belong to their respective owners. Prices in JOD include VAT.
      </div>
    </footer>
  );
}
