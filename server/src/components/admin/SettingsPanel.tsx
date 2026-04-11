'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { COIN_PACKAGES } from '@/lib/constants';
import { Save, CheckCircle2, Settings, Clock, Coins, Sliders, LayoutDashboard, Eye, EyeOff, CircleDot } from 'lucide-react';
import { onSnapshot } from 'firebase/firestore';

export function SettingsPanel() {
  const [settings, setSettings] = useState({
    cafeName: 'Ninja Games',
    currency: 'JOD',
    coinRate: 1,
    openHour: 10,
    closeHour: 24,
    autoShutdown: true,
    maxReservationMinutes: 30,
    lowBalanceWarning: 50,
    gracePeriodSeconds: 60,
  });
  const [saved, setSaved] = useState(false);
  const [sidebarTabs, setSidebarTabs] = useState<Record<string, boolean>>({
    games: true, tournaments: true, food: true,
    dailytasks: true, profile: true, friends: true, chests: true,
    inventory: true, leaderboard: true, software: true, store: true, vip: true,
  });
  const [sidebarSaved, setSidebarSaved] = useState(false);

  // Plinko house edge
  const [plinkoLuck, setPlinkoLuck] = useState(50);
  const [plinkoSaved, setPlinkoSaved] = useState(false);

  // Crash house edge
  const [crashBias, setCrashBias] = useState(50);
  const [crashSaved, setCrashSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      const snap = await getDoc(doc(db, 'config', 'settings'));
      if (snap.exists()) setSettings({ ...settings, ...snap.data() });
      const sidebarSnap = await getDoc(doc(db, 'config', 'sidebar'));
      if (sidebarSnap.exists()) setSidebarTabs(prev => ({ ...prev, ...sidebarSnap.data() }));
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-sync plinko luck from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'game-settings', 'plinko'), (snap) => {
      if (snap.exists() && typeof snap.data().luckFactor === 'number') {
        setPlinkoLuck(snap.data().luckFactor);
      }
    });
    return () => unsub();
  }, []);

  // Live-sync crash bias from Firestore
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'game-settings', 'crash'), (snap) => {
      if (snap.exists() && typeof snap.data().bias === 'number') {
        setCrashBias(snap.data().bias);
      }
    });
    return () => unsub();
  }, []);

  const saveCrashBias = async (val: number) => {
    setCrashBias(val);
    try {
      await setDoc(doc(db, 'game-settings', 'crash'), { bias: val }, { merge: true });
      setCrashSaved(true);
      setTimeout(() => setCrashSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save crash settings:', e);
    }
  };

  const savePlinkoLuck = async (val: number) => {
    setPlinkoLuck(val);
    try {
      await setDoc(doc(db, 'game-settings', 'plinko'), { luckFactor: val }, { merge: true });
      setPlinkoSaved(true);
      setTimeout(() => setPlinkoSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save plinko settings:', e);
    }
  };

  const saveSidebar = async () => {
    await setDoc(doc(db, 'config', 'sidebar'), sidebarTabs);
    setSidebarSaved(true);
    setTimeout(() => setSidebarSaved(false), 2000);
  };

  const save = async () => {
    await setDoc(doc(db, 'config', 'settings'), settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputClass = "w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none";
  const labelClass = "text-[#86868b] text-sm mb-1 block";

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-6 flex items-center gap-3">
        <Settings size={24} className="text-[#0071e3]" /> Settings
      </h2>

      <div className="space-y-6">
        {/* General */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
            <Sliders size={16} className="text-[#0071e3]" /> General
          </h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Cafe Name</label>
              <input
                value={settings.cafeName}
                onChange={(e) => setSettings({ ...settings, cafeName: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Currency</label>
                <select
                  value={settings.currency}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                  className={inputClass}
                >
                  <option value="JOD">JOD (Jordanian Dinar)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                  <option value="SAR">SAR (Saudi Riyal)</option>
                  <option value="AED">AED (UAE Dirham)</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Coin Rate (1 {settings.currency} = ? coins)</label>
                <input
                  type="number"
                  value={settings.coinRate}
                  onChange={(e) => setSettings({ ...settings, coinRate: parseFloat(e.target.value) || 1 })}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Hours */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
            <Clock size={16} className="text-[#0071e3]" /> Operating Hours
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Open</label>
              <input type="number" value={settings.openHour}
                onChange={(e) => setSettings({ ...settings, openHour: parseInt(e.target.value) })}
                min={0} max={23}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Close</label>
              <input type="number" value={settings.closeHour}
                onChange={(e) => setSettings({ ...settings, closeHour: parseInt(e.target.value) })}
                min={0} max={24}
                className={inputClass} />
            </div>
          </div>
          <label className="flex items-center gap-3 mt-4 cursor-pointer">
            <input type="checkbox" checked={settings.autoShutdown}
              onChange={(e) => setSettings({ ...settings, autoShutdown: e.target.checked })}
              className="w-5 h-5 accent-[#0071e3]" />
            <span className="text-[#1d1d1f] text-sm">Auto-shutdown PCs at closing time</span>
          </label>
        </div>

        {/* Session */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
            <Sliders size={16} className="text-[#0071e3]" /> Session
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Max Reservation (min)</label>
              <input type="number" value={settings.maxReservationMinutes}
                onChange={(e) => setSettings({ ...settings, maxReservationMinutes: parseInt(e.target.value) })}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Low Balance (coins)</label>
              <input type="number" value={settings.lowBalanceWarning}
                onChange={(e) => setSettings({ ...settings, lowBalanceWarning: parseInt(e.target.value) })}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Grace Period (sec)</label>
              <input type="number" value={settings.gracePeriodSeconds}
                onChange={(e) => setSettings({ ...settings, gracePeriodSeconds: parseInt(e.target.value) })}
                className={inputClass} />
            </div>
          </div>
        </div>

        {/* Coin Packages */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
            <Coins size={16} className="text-[#ff9500]" /> Coin Packages
          </h3>
          <div className="space-y-2">
            {COIN_PACKAGES.map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-[#e5e5ea] last:border-0">
                <span className="text-[#1d1d1f] text-sm flex items-center gap-1.5">
                  <Coins size={14} className="text-[#ff9500]" /> {p.coins} ({p.label})
                </span>
                <span className="text-[#0071e3] font-medium text-sm">{settings.currency} {(p.price * settings.coinRate).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Plinko House Edge */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <h3 className="text-lg font-semibold text-[#ff3b30] mb-4 flex items-center gap-2">
            <CircleDot size={16} /> Plinko -- House Edge
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[#86868b] text-sm">Outcome Bias</label>
                <span className="text-lg font-semibold text-[#ff3b30]">{plinkoLuck}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={plinkoLuck}
                onChange={e => savePlinkoLuck(Number(e.target.value))}
                className="w-full accent-[#ff3b30] h-2"
              />
              <div className="flex justify-between text-xs text-[#86868b] mt-1">
                <span>0% -- House Wins</span>
                <span>50% -- Fair</span>
                <span>100% -- Player Wins</span>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-2">
              {[10, 25, 40, 50, 65, 80].map(v => (
                <button
                  key={v}
                  onClick={() => savePlinkoLuck(v)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${
                    plinkoLuck === v
                      ? 'bg-[#ff3b30]/10 border-[#ff3b30]/40 text-[#ff3b30]'
                      : 'bg-[#f5f5f7] border-[#d2d2d7] text-[#86868b] hover:text-[#1d1d1f]'
                  } border`}
                >
                  {v}%
                </button>
              ))}
            </div>

            <div className="bg-[#f5f5f7] rounded-xl p-3 border border-[#e5e5ea]/60">
              <div className="text-xs text-[#86868b] leading-relaxed space-y-1">
                <p><span className="text-[#ff3b30] font-semibold">0-30%</span> -- Balls land mostly center (low multipliers). House profits more.</p>
                <p><span className="text-[#ff9500] font-semibold">40-60%</span> -- Natural/fair distribution. Balanced gameplay.</p>
                <p><span className="text-[#34c759] font-semibold">70-100%</span> -- Balls land mostly edges (high multipliers). Players win more.</p>
              </div>
            </div>

            {plinkoSaved && (
              <div className="flex items-center gap-2 text-[#34c759] text-sm">
                <CheckCircle2 size={14} /> Saved -- applies to all players instantly
              </div>
            )}
          </div>
        </div>

        {/* Crash House Edge */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <h3 className="text-lg font-semibold text-[#ff9500] mb-4 flex items-center gap-2">
            <Sliders size={16} /> Crash -- House Edge
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[#86868b] text-sm">Crash Bias</label>
                <span className="text-lg font-semibold text-[#ff9500]">{crashBias}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={crashBias}
                onChange={e => saveCrashBias(Number(e.target.value))}
                className="w-full accent-[#ff9500] h-2"
              />
              <div className="flex justify-between text-xs text-[#86868b] mt-1">
                <span>0% -- Early Crash</span>
                <span>50% -- Fair</span>
                <span>100% -- Late Crash</span>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-2">
              {[10, 25, 40, 50, 65, 80].map(v => (
                <button
                  key={v}
                  onClick={() => saveCrashBias(v)}
                  className={`py-2 rounded-xl text-xs font-medium transition-all ${
                    crashBias === v
                      ? 'bg-[#ff9500]/10 border-[#ff9500]/40 text-[#ff9500]'
                      : 'bg-[#f5f5f7] border-[#d2d2d7] text-[#86868b] hover:text-[#1d1d1f]'
                  } border`}
                >
                  {v}%
                </button>
              ))}
            </div>

            <div className="bg-[#f5f5f7] rounded-xl p-3 border border-[#e5e5ea]/60">
              <div className="text-xs text-[#86868b] leading-relaxed space-y-1">
                <p><span className="text-[#ff9500] font-semibold">0-30%</span> -- Games crash early (1x-2x). House profits heavily.</p>
                <p><span className="text-[#ff9500] font-semibold">40-60%</span> -- Fair distribution. Standard crash gameplay.</p>
                <p><span className="text-[#34c759] font-semibold">70-100%</span> -- Games last longer, higher multipliers. Players win more.</p>
              </div>
            </div>

            {crashSaved && (
              <div className="flex items-center gap-2 text-[#34c759] text-sm">
                <CheckCircle2 size={14} /> Saved -- applies to all players instantly
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Visibility */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
            <LayoutDashboard size={16} className="text-[#0071e3]" /> Kiosk Sidebar -- Show / Hide Tabs
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'games', label: 'Games' },
              { id: 'tournaments', label: 'Tournaments' },
              { id: 'food', label: 'Food & Drinks' },
              { id: 'dailytasks', label: 'Daily Tasks' },
              { id: 'profile', label: 'Profile' },
              { id: 'friends', label: 'Friends' },
              { id: 'chests', label: 'Chests' },
              { id: 'inventory', label: 'Inventory' },
              { id: 'leaderboard', label: 'Leaderboard' },
              { id: 'software', label: 'Software' },
              { id: 'store', label: 'Store' },
              { id: 'vip', label: 'VIP' },
            ].map(tab => (
              <label key={tab.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all border ${
                  sidebarTabs[tab.id] !== false
                    ? 'bg-[#0071e3]/5 border-[#0071e3]/20 text-[#1d1d1f]'
                    : 'bg-[#f5f5f7] border-[#d2d2d7] text-[#86868b]'
                }`}
              >
                <input
                  type="checkbox"
                  checked={sidebarTabs[tab.id] !== false}
                  onChange={(e) => setSidebarTabs({ ...sidebarTabs, [tab.id]: e.target.checked })}
                  className="w-5 h-5 accent-[#0071e3]"
                />
                <span className="text-sm flex-1">{tab.label}</span>
                {sidebarTabs[tab.id] !== false
                  ? <Eye size={14} className="text-[#0071e3]" />
                  : <EyeOff size={14} className="text-[#86868b]" />
                }
              </label>
            ))}
          </div>
          <button
            onClick={saveSidebar}
            className={`w-full mt-4 py-2.5 rounded-xl font-medium text-sm transition-all flex items-center justify-center gap-2 ${
              sidebarSaved ? 'bg-[#34c759] text-white' : 'border border-[#d2d2d7] text-[#1d1d1f] hover:bg-[#f5f5f7]'
            }`}
          >
            {sidebarSaved ? <><CheckCircle2 size={16} /> Sidebar Saved!</> : <><Save size={16} /> Save Sidebar</>}
          </button>
        </div>

        {/* Save */}
        <button
          onClick={save}
          className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
            saved ? 'bg-[#34c759] text-white' : 'bg-[#0071e3] text-white hover:bg-[#0077ED]'
          }`}
        >
          {saved ? <><CheckCircle2 size={18} /> Saved!</> : <><Save size={18} /> Save Settings</>}
        </button>
      </div>
    </div>
  );
}
