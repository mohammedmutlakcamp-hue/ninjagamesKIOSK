'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import {
  TIME_PACKAGES,
  VIP_CONFIG,
  COINS_PER_HOUR,
  JOD_TO_COINS,
  USERNAME_CHANGE_COST,
} from '@/lib/constants';
import { TimePackage } from '@/types';
import {
  Coins,
  Clock,
  DollarSign,
  Crown,
  Save,
  Settings2,
  TrendingUp,
  PenLine,
  Loader2,
  CheckCircle2,
  BarChart3,
  Users,
  Wallet,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { HelpTip } from './HelpTip';

interface VipConfigState {
  trialDays: number;
  priceCoins: number;
  durationDays: number;
  cafeDiscountPercent: number;
  dailyTaskBonusCoins: number;
  dailyInviteFreeMinutes: number;
  dailyInviteBonusCoins: number;
}

interface EconomyStats {
  totalCoinsInCirculation: number;
  totalCoinsSpent: number;
  averageBalance: number;
  playerCount: number;
}

const PRICING_DOC = doc(db, 'config', 'pricing');

function SectionHeader({
  icon: Icon,
  title,
  help,
  helpTitle,
}: {
  icon: React.ElementType;
  title: string;
  help?: React.ReactNode;
  helpTitle?: string;
}) {
  return (
    <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
      <Icon size={18} className="text-[#0071e3]" /> {title}
      {help && <HelpTip title={helpTitle || title}>{help}</HelpTip>}
    </h3>
  );
}

function SaveButton({
  onClick,
  saving,
  saved,
}: {
  onClick: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={saving}
      className={`flex items-center gap-2 px-5 py-2 rounded-xl font-medium text-sm transition-all ${
        saved
          ? 'bg-[#34c759] text-white'
          : 'bg-[#0071e3] text-white hover:bg-[#0077ED]'
      }`}
    >
      {saving ? (
        <Loader2 size={16} className="animate-spin" />
      ) : saved ? (
        <CheckCircle2 size={16} />
      ) : (
        <Save size={16} />
      )}
      {saved ? 'Saved' : 'Save'}
    </motion.button>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = 'number',
  suffix,
}: {
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  type?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label className="text-[#86868b] text-sm mb-1 block">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868b] text-xs">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function PricingManagement() {
  // --- Time Packages ---
  const [timePackages, setTimePackages] = useState<TimePackage[]>(
    TIME_PACKAGES.map((p) => ({ ...p }))
  );
  const [timeSaving, setTimeSaving] = useState(false);
  const [timeSaved, setTimeSaved] = useState(false);

  // --- Base Rates ---
  const [coinsPerHour, setCoinsPerHour] = useState(COINS_PER_HOUR);
  const [jodToCoins, setJodToCoins] = useState(JOD_TO_COINS);
  const [rateSaving, setRateSaving] = useState(false);
  const [rateSaved, setRateSaved] = useState(false);

  // --- VIP ---
  const [vipConfig, setVipConfig] = useState<VipConfigState>({
    trialDays: VIP_CONFIG.trialDays,
    priceCoins: VIP_CONFIG.priceCoins,
    durationDays: VIP_CONFIG.durationDays,
    cafeDiscountPercent: VIP_CONFIG.cafeDiscountPercent,
    dailyTaskBonusCoins: VIP_CONFIG.dailyTaskBonusCoins,
    dailyInviteFreeMinutes: VIP_CONFIG.dailyInviteFreeMinutes,
    dailyInviteBonusCoins: VIP_CONFIG.dailyInviteBonusCoins,
  });
  const [vipSaving, setVipSaving] = useState(false);
  const [vipSaved, setVipSaved] = useState(false);

  // --- Username Change ---
  const [usernameChangeCost, setUsernameChangeCost] = useState(USERNAME_CHANGE_COST);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);

  // --- Economy Overview ---
  const [economy, setEconomy] = useState<EconomyStats | null>(null);
  const [economyLoading, setEconomyLoading] = useState(true);

  // --- Loading ---
  const [loading, setLoading] = useState(true);

  // Load overrides from Firestore
  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDoc(PRICING_DOC);
        if (snap.exists()) {
          const data = snap.data();
          if (data.timePackages) setTimePackages(data.timePackages);
          if (typeof data.coinsPerHour === 'number') setCoinsPerHour(data.coinsPerHour);
          if (typeof data.jodToCoins === 'number') setJodToCoins(data.jodToCoins);
          if (data.vipConfig) setVipConfig((prev) => ({ ...prev, ...data.vipConfig }));
          if (typeof data.usernameChangeCost === 'number')
            setUsernameChangeCost(data.usernameChangeCost);
        }
      } catch (err) {
        console.error('Failed to load pricing config:', err);
      }
      setLoading(false);
    };
    load();
  }, []);

  // Load economy stats
  useEffect(() => {
    const loadEconomy = async () => {
      setEconomyLoading(true);
      try {
        const playersSnap = await getDocs(collection(db, 'players'));
        let totalBalance = 0;
        let totalSpent = 0;
        let count = 0;
        playersSnap.forEach((doc) => {
          const d = doc.data();
          const bal = typeof d.coins === 'number' ? d.coins : 0;
          const spent = typeof d.totalCoinsSpent === 'number' ? d.totalCoinsSpent : 0;
          totalBalance += bal;
          totalSpent += spent;
          count++;
        });
        setEconomy({
          totalCoinsInCirculation: totalBalance,
          totalCoinsSpent: totalSpent,
          averageBalance: count > 0 ? Math.round(totalBalance / count) : 0,
          playerCount: count,
        });
      } catch (err) {
        console.error('Failed to load economy stats:', err);
      }
      setEconomyLoading(false);
    };
    loadEconomy();
  }, []);

  // --- Save helpers ---
  const saveField = async (
    field: string,
    value: unknown,
    setSaving: (v: boolean) => void,
    setSaved: (v: boolean) => void
  ) => {
    setSaving(true);
    try {
      const snap = await getDoc(PRICING_DOC);
      const existing = snap.exists() ? snap.data() : {};
      await setDoc(PRICING_DOC, { ...existing, [field]: value });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error(`Failed to save ${field}:`, err);
    }
    setSaving(false);
  };

  const saveMultipleFields = async (
    fields: Record<string, unknown>,
    setSaving: (v: boolean) => void,
    setSaved: (v: boolean) => void
  ) => {
    setSaving(true);
    try {
      const snap = await getDoc(PRICING_DOC);
      const existing = snap.exists() ? snap.data() : {};
      await setDoc(PRICING_DOC, { ...existing, ...fields });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save fields:', err);
    }
    setSaving(false);
  };

  // --- Package updaters ---
  const updateTimePackage = (index: number, field: keyof TimePackage, value: string) => {
    const updated = [...timePackages];
    if (field === 'hours' || field === 'coins') {
      (updated[index] as any)[field] = Number(value) || 0;
    } else {
      (updated[index] as any)[field] = value;
    }
    setTimePackages(updated);
  };

  const updateVip = (field: keyof VipConfigState, value: string) => {
    setVipConfig((prev) => ({ ...prev, [field]: Number(value) || 0 }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-[#0071e3]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-6 flex items-center gap-3">
        <DollarSign size={24} className="text-[#0071e3]" /> Pricing & Economy
      </h2>

      <div className="space-y-6">
        {/* ==================== TIME PACKAGES ==================== */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
        >
          <div className="flex items-center justify-between mb-4">
            <SectionHeader icon={Clock} title="Time Packages"
              help={(
                <>
                  <p className="mb-2">How players convert tokens to play time. Each row: a package name, how many hours it grants, and the token cost.</p>
                  <p className="mb-2"><strong>How it works:</strong> a player clicks "Buy Time" in the kiosk sidebar → picks a package → tokens are deducted and minutes are added to their session.</p>
                  <p className="text-[#86868b]"><strong>Tip:</strong> longer packages should be cheaper per hour. That's what pulls customers toward bigger buys. Current Gold tier (7h / 500 tokens ≈ 0.71 JOD/hr) is your best deal — players see a "BEST" badge on it.</p>
                </>
              )} />

            <SaveButton
              onClick={() => saveField('timePackages', timePackages, setTimeSaving, setTimeSaved)}
              saving={timeSaving}
              saved={timeSaved}
            />
          </div>
          <p className="text-[#86868b] text-xs mb-4">
            Playtime packages players can buy with coins.
          </p>
          <div className="space-y-3">
            {timePackages.map((pkg, i) => (
              <div
                key={pkg.id}
                className="grid grid-cols-4 gap-3 items-end bg-[#f5f5f7] rounded-xl p-3 border border-[#e5e5ea]/60"
              >
                <InputField
                  label="Label"
                  type="text"
                  value={pkg.label}
                  onChange={(v) => updateTimePackage(i, 'label', v)}
                />
                <InputField
                  label="Hours"
                  value={pkg.hours}
                  onChange={(v) => updateTimePackage(i, 'hours', v)}
                  suffix="hrs"
                />
                <InputField
                  label="Cost"
                  value={pkg.coins}
                  onChange={(v) => updateTimePackage(i, 'coins', v)}
                  suffix="coins"
                />
                <div className="flex items-center pb-1">
                  <span className="text-[#86868b] text-xs">
                    {pkg.hours > 0 && pkg.coins > 0
                      ? `${Math.round(pkg.coins / pkg.hours)} coins/hr`
                      : '\u2014'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ==================== BASE RATES ==================== */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
        >
          <div className="flex items-center justify-between mb-4">
            <SectionHeader icon={Settings2} title="Base Rates"
              help={(
                <>
                  <p className="mb-2"><strong>Coins per hour:</strong> how many tokens a player burns per hour just by being logged in (the kiosk deducts 1 min of their `remainingPlaytime` every 60 sec — this field is the display rate used across the app).</p>
                  <p className="mb-2"><strong>JOD → Coins rate:</strong> how many tokens 1 JOD buys at the base rate (no bonus). All 7 coin packages are priced around this anchor; bigger packs add 2%–5% bonus on top.</p>
                  <p className="text-[#ff9500]"><strong>Careful:</strong> changing these numbers affects every kiosk immediately. Don't drop prices during peak hours without a reason.</p>
                </>
              )} />

            <SaveButton
              onClick={() =>
                saveMultipleFields({ coinsPerHour, jodToCoins }, setRateSaving, setRateSaved)
              }
              saving={rateSaving}
              saved={rateSaved}
            />
          </div>
          <p className="text-[#86868b] text-xs mb-4">
            Core conversion rates used throughout the system.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <InputField
              label="Coins per Hour"
              value={coinsPerHour}
              onChange={(v) => setCoinsPerHour(Number(v) || 0)}
              suffix="coins/hr"
            />
            <InputField
              label="JOD to Coins"
              value={jodToCoins}
              onChange={(v) => setJodToCoins(Number(v) || 0)}
              suffix="coins/JOD"
            />
          </div>
          <div className="mt-3 p-3 bg-[#0071e3]/5 rounded-xl border border-[#0071e3]/10">
            <p className="text-[#86868b] text-xs">
              <TrendingUp size={12} className="inline mr-1 text-[#0071e3]" />
              At current rates: 1 hour = {coinsPerHour} coins = {jodToCoins > 0 ? (coinsPerHour / jodToCoins).toFixed(1) : '\u2014'} JOD
            </p>
          </div>
        </motion.div>

        {/* ==================== VIP CONFIG ==================== */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
        >
          <div className="flex items-center justify-between mb-4">
            <SectionHeader icon={Crown} title="VIP Configuration"
              help={(
                <>
                  <p className="mb-2">Settings for your VIP membership — the paid upgrade that gives a player perks like discounted cafe items, daily free tokens, daily task bonus, and invite bonus.</p>
                  <p className="mb-2"><strong>Price:</strong> how many tokens a player spends to become VIP for the set duration.</p>
                  <p className="mb-2"><strong>Duration:</strong> how long the VIP perks last (days).</p>
                  <p><strong>Bonuses:</strong> daily free tokens, cafe discount %, daily task completion bonus, invite bonus — applied automatically while VIP is active.</p>
                </>
              )} />

            <SaveButton
              onClick={() => saveField('vipConfig', vipConfig, setVipSaving, setVipSaved)}
              saving={vipSaving}
              saved={vipSaved}
            />
          </div>
          <p className="text-[#86868b] text-xs mb-4">
            VIP membership pricing and perks.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <InputField
              label="VIP Price"
              value={vipConfig.priceCoins}
              onChange={(v) => updateVip('priceCoins', v)}
              suffix="coins"
            />
            <InputField
              label="Duration"
              value={vipConfig.durationDays}
              onChange={(v) => updateVip('durationDays', v)}
              suffix="days"
            />
            <InputField
              label="Trial Period"
              value={vipConfig.trialDays}
              onChange={(v) => updateVip('trialDays', v)}
              suffix="days"
            />
            <InputField
              label="Cafe Discount"
              value={vipConfig.cafeDiscountPercent}
              onChange={(v) => updateVip('cafeDiscountPercent', v)}
              suffix="%"
            />
            <InputField
              label="Daily Task Bonus"
              value={vipConfig.dailyTaskBonusCoins}
              onChange={(v) => updateVip('dailyTaskBonusCoins', v)}
              suffix="coins"
            />
            <InputField
              label="Daily Invite Free Time"
              value={vipConfig.dailyInviteFreeMinutes}
              onChange={(v) => updateVip('dailyInviteFreeMinutes', v)}
              suffix="min"
            />
            <InputField
              label="Daily Invite Bonus"
              value={vipConfig.dailyInviteBonusCoins}
              onChange={(v) => updateVip('dailyInviteBonusCoins', v)}
              suffix="coins"
            />
          </div>
        </motion.div>

        {/* ==================== USERNAME CHANGE COST ==================== */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
        >
          <div className="flex items-center justify-between mb-4">
            <SectionHeader icon={PenLine} title="Username Change Cost"
              help={(
                <>
                  <p className="mb-2">Players get the first couple of username changes free. This field sets the token cost for every change AFTER that.</p>
                  <p className="text-[#86868b]"><strong>Why charge for it:</strong> without a cost, players farm usernames to look like admin or other players. The small fee kills the abuse.</p>
                </>
              )} />

            <SaveButton
              onClick={() =>
                saveField('usernameChangeCost', usernameChangeCost, setUsernameSaving, setUsernameSaved)
              }
              saving={usernameSaving}
              saved={usernameSaved}
            />
          </div>
          <p className="text-[#86868b] text-xs mb-4">
            Cost charged on the 3rd+ username change. First 2 changes are free.
          </p>
          <div className="max-w-xs">
            <InputField
              label="Cost per Change"
              value={usernameChangeCost}
              onChange={(v) => setUsernameChangeCost(Number(v) || 0)}
              suffix="coins"
            />
          </div>
        </motion.div>

        {/* ==================== ECONOMY OVERVIEW ==================== */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
        >
          <SectionHeader icon={BarChart3} title="Economy Overview"
            help={(
              <>
                <p className="mb-2">Live snapshot of your shop's token economy.</p>
                <p className="mb-1.5"><strong>Total in circulation:</strong> every token currently sitting in a player balance. If this grows uncontrolled, players are accumulating wealth without spending it.</p>
                <p className="mb-1.5"><strong>Total spent:</strong> lifetime tokens burned on chests, food, time, etc. Grows monotonically.</p>
                <p className="mb-1.5"><strong>Player count:</strong> registered accounts (excluding guests).</p>
                <p className="text-[#86868b]">Watch these numbers over time. A healthy economy has spend ≈ purchase rate.</p>
              </>
            )} />

          <p className="text-[#86868b] text-xs mb-4">
            Live read-only stats from the players collection.
          </p>

          {economyLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 size={24} className="animate-spin text-[#0071e3]" />
            </div>
          ) : economy ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#f5f5f7] rounded-xl p-4 border border-[#e5e5ea]/60 text-center">
                <Coins size={20} className="text-[#34c759] mx-auto mb-2" />
                <p className="text-2xl font-semibold text-[#1d1d1f]">
                  {economy.totalCoinsInCirculation.toLocaleString()}
                </p>
                <p className="text-[#86868b] text-xs mt-1">Coins in Circulation</p>
              </div>
              <div className="bg-[#f5f5f7] rounded-xl p-4 border border-[#e5e5ea]/60 text-center">
                <Wallet size={20} className="text-[#ff3b30] mx-auto mb-2" />
                <p className="text-2xl font-semibold text-[#1d1d1f]">
                  {economy.totalCoinsSpent.toLocaleString()}
                </p>
                <p className="text-[#86868b] text-xs mt-1">Total Coins Spent</p>
              </div>
              <div className="bg-[#f5f5f7] rounded-xl p-4 border border-[#e5e5ea]/60 text-center">
                <TrendingUp size={20} className="text-[#ff9500] mx-auto mb-2" />
                <p className="text-2xl font-semibold text-[#1d1d1f]">
                  {economy.averageBalance.toLocaleString()}
                </p>
                <p className="text-[#86868b] text-xs mt-1">Avg Balance / Player</p>
              </div>
              <div className="bg-[#f5f5f7] rounded-xl p-4 border border-[#e5e5ea]/60 text-center">
                <Users size={20} className="text-[#0071e3] mx-auto mb-2" />
                <p className="text-2xl font-semibold text-[#1d1d1f]">
                  {economy.playerCount.toLocaleString()}
                </p>
                <p className="text-[#86868b] text-xs mt-1">Total Players</p>
              </div>
            </div>
          ) : (
            <p className="text-[#86868b] text-sm">Failed to load economy stats.</p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
