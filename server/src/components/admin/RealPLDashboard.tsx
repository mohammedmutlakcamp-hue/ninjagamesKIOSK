'use client';

// REAL P&L DASHBOARD
//
// Aggregates actual revenue streams and costs into a single dashboard:
//   REVENUE
//     - Token top-ups (approved topup-requests, sum of priceJOD)
//     - Cafeteria cash (paid food orders, sum of totalJOD)
//     - Hubbly cash (paid shisha + tobacco orders, sum of totalJOD)
//     - Promotion orders (paid promo-orders, sum of priceJOD)
//   COSTS
//     - Food COGS (% of cafeteria revenue, admin-configurable)
//     - Fixed monthly costs (rent, electricity, staff, internet) — admin-editable
//
// Period picker: Today / Yesterday / This week / This month / Custom range
// Stored config: config/pl-config { foodCogsPercent, rentJOD, electricityJOD, staffJOD, internetJOD, otherJOD }

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, onSnapshot, doc, setDoc, query, where, orderBy,
} from 'firebase/firestore';
import {
  TrendingUp, Coins, UtensilsCrossed, Flame, Gift, DollarSign,
  ArrowUp, ArrowDown, Settings, Save, Calendar, CheckCircle2, Loader2,
} from 'lucide-react';
import { HelpTip } from './HelpTip';

interface PLConfig {
  foodCogsPercent: number;      // e.g. 35% — fraction of cafeteria revenue that's raw cost
  hubblyCogsPercent: number;    // e.g. 25%
  rentJOD: number;              // monthly
  electricityJOD: number;       // monthly
  internetJOD: number;          // monthly
  staffJOD: number;             // monthly payroll
  otherJOD: number;             // monthly other
}

type Period = 'today' | 'yesterday' | 'week' | 'month' | 'last30';

interface DocMini {
  createdAt?: number;
  approvedAt?: number;
  priceJOD?: number;
  totalJOD?: number;
  status?: string;
  paid?: boolean;
  method?: string;
}

const input = 'w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-[#1d1d1f] placeholder:text-[#86868b] outline-none focus:border-[#0071e3] text-sm';

function getPeriodRange(p: Period): { start: number; end: number; label: string } {
  const now = new Date();
  const end = now.getTime();
  const startOf = (d: Date) => { d.setHours(0, 0, 0, 0); return d.getTime(); };

  if (p === 'today') {
    const s = new Date(); return { start: startOf(s), end, label: 'Today' };
  }
  if (p === 'yesterday') {
    const s = new Date(); s.setDate(s.getDate() - 1);
    const e = new Date(); e.setDate(e.getDate() - 1); e.setHours(23, 59, 59, 999);
    return { start: startOf(s), end: e.getTime(), label: 'Yesterday' };
  }
  if (p === 'week') {
    // This week (Sunday to today)
    const s = new Date();
    s.setDate(s.getDate() - s.getDay());
    return { start: startOf(s), end, label: 'This week' };
  }
  if (p === 'month') {
    const s = new Date(); s.setDate(1);
    return { start: startOf(s), end, label: 'This month' };
  }
  // last30
  const s = new Date(); s.setDate(s.getDate() - 30);
  return { start: startOf(s), end, label: 'Last 30 days' };
}

const DEFAULT_CFG: PLConfig = {
  foodCogsPercent: 35,
  hubblyCogsPercent: 25,
  rentJOD: 400,
  electricityJOD: 120,
  internetJOD: 60,
  staffJOD: 600,
  otherJOD: 0,
};

export function RealPLDashboard() {
  const [period, setPeriod] = useState<Period>('today');
  const [cfg, setCfg] = useState<PLConfig>(DEFAULT_CFG);
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgJustSaved, setCfgJustSaved] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const [topups, setTopups] = useState<DocMini[]>([]);
  const [foodOrders, setFoodOrders] = useState<DocMini[]>([]);
  const [shishaOrders, setShishaOrders] = useState<DocMini[]>([]);
  const [promoOrders, setPromoOrders] = useState<DocMini[]>([]);

  const { start, end, label } = useMemo(() => getPeriodRange(period), [period]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'pl-config'), (snap) => {
      if (snap.exists()) setCfg({ ...DEFAULT_CFG, ...(snap.data() as PLConfig) });
    });
    return () => unsub();
  }, []);

  // Top-ups (approved only)
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'topup-requests'), where('status', '==', 'approved')),
      (snap) => setTopups(snap.docs.map((d) => d.data() as DocMini)),
    );
    return () => unsub();
  }, []);

  // Food orders (paid only — since cafeteria is cash-payment)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'orders'), (snap) => {
      setFoodOrders(snap.docs.map((d) => d.data() as DocMini).filter((o) => o.paid !== false));
    });
    return () => unsub();
  }, []);

  // Shisha orders (paid only)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'shisha-orders'), (snap) => {
      setShishaOrders(snap.docs.map((d) => d.data() as DocMini).filter((o) => o.paid !== false));
    });
    return () => unsub();
  }, []);

  // Promo orders (paid only)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'promo-orders'), (snap) => {
      setPromoOrders(snap.docs.map((d) => d.data() as DocMini).filter((o) => o.paid !== false));
    });
    return () => unsub();
  }, []);

  // Aggregate for the period
  const totals = useMemo(() => {
    const inRange = (ts?: number) => !!ts && ts >= start && ts <= end;
    const sumTopups = topups
      .filter((t) => inRange(t.approvedAt || t.createdAt))
      .reduce((s, t) => s + (t.priceJOD || 0), 0);
    const sumFood = foodOrders
      .filter((o) => inRange(o.createdAt))
      .reduce((s, o) => s + (o.totalJOD || 0), 0);
    const sumHubbly = shishaOrders
      .filter((o) => inRange(o.createdAt))
      .reduce((s, o) => s + (o.totalJOD || 0), 0);
    const sumPromo = promoOrders
      .filter((o) => inRange(o.createdAt))
      .reduce((s, o) => s + (o.priceJOD || 0), 0);

    const revenue = sumTopups + sumFood + sumHubbly + sumPromo;

    const foodCogs = sumFood * (cfg.foodCogsPercent / 100);
    const hubblyCogs = sumHubbly * (cfg.hubblyCogsPercent / 100);

    // Fixed monthly → prorate to period
    const monthlyFixed = cfg.rentJOD + cfg.electricityJOD + cfg.internetJOD + cfg.staffJOD + cfg.otherJOD;
    const daysInPeriod = Math.max(1, (end - start) / 86400000);
    const fixedForPeriod = (monthlyFixed / 30) * daysInPeriod;

    const costs = foodCogs + hubblyCogs + fixedForPeriod;
    const netProfit = revenue - costs;
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      sumTopups, sumFood, sumHubbly, sumPromo, revenue,
      foodCogs, hubblyCogs, fixedForPeriod, costs,
      netProfit, margin, daysInPeriod,
    };
  }, [start, end, topups, foodOrders, shishaOrders, promoOrders, cfg]);

  const saveConfig = async () => {
    setCfgSaving(true);
    try {
      await setDoc(doc(db, 'config', 'pl-config'), cfg, { merge: true });
      setCfgJustSaved(true);
      setTimeout(() => setCfgJustSaved(false), 1500);
    } finally {
      setCfgSaving(false);
    }
  };

  const fmt = (n: number) => n.toFixed(2);
  const fmtJOD = (n: number) => `${fmt(n)} JOD`;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(0,113,227,0.1)', border: '1px solid rgba(0,113,227,0.25)' }}>
            <TrendingUp size={22} className="text-[#0071e3]" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
              Profit & Loss
              <HelpTip title="Real Profit & Loss">
                <p className="mb-2">Live financial view of the shop for the selected period.</p>
                <p className="mb-1.5"><strong>Revenue:</strong> tokens sold (JOD paid in top-ups) + cafeteria cash + hubbly cash + promo bundle sales.</p>
                <p className="mb-1.5"><strong>Costs:</strong> food raw cost (% of cafeteria revenue), hubbly raw cost (% of hubbly revenue), plus a prorated slice of your monthly fixed costs (rent, electricity, etc).</p>
                <p className="mb-1.5"><strong>Net Profit = Revenue − Costs.</strong> Margin % is net profit as a fraction of revenue.</p>
                <p className="text-[#86868b]"><strong>Click Configure</strong> to set your COGS % and monthly fixed costs.</p>
              </HelpTip>
            </h2>
            <p className="text-[#86868b] text-sm">{label} · {totals.daysInPeriod.toFixed(1)}-day window</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-[#f5f5f7] p-1 rounded-xl">
            {([
              { key: 'today', label: 'Today' },
              { key: 'yesterday', label: 'Yesterday' },
              { key: 'week', label: 'Week' },
              { key: 'month', label: 'Month' },
              { key: 'last30', label: 'Last 30' },
            ] as const).map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  period === p.key ? 'bg-white shadow-sm text-[#1d1d1f]' : 'text-[#86868b]'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowConfig(!showConfig)}
            className="px-3 py-1.5 rounded-xl bg-white border border-[#d2d2d7] text-[#1d1d1f] text-xs font-medium flex items-center gap-1.5 hover:bg-[#f5f5f7]">
            <Settings size={12} /> Configure
          </button>
        </div>
      </div>

      {/* Headline cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-2xl p-5 border border-[#e5e5ea]/60">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-[#34c759]" />
            <span className="text-[11px] uppercase tracking-wider text-[#86868b]">Revenue</span>
          </div>
          <div className="text-3xl font-semibold text-[#1d1d1f]">{fmtJOD(totals.revenue)}</div>
          <div className="text-[11px] text-[#86868b] mt-1">{label}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-[#e5e5ea]/60">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDown size={14} className="text-[#ff3b30]" />
            <span className="text-[11px] uppercase tracking-wider text-[#86868b]">Costs</span>
          </div>
          <div className="text-3xl font-semibold text-[#1d1d1f]">{fmtJOD(totals.costs)}</div>
          <div className="text-[11px] text-[#86868b] mt-1">COGS + fixed (prorated)</div>
        </div>
        <div className={`rounded-2xl p-5 border ${totals.netProfit >= 0 ? 'bg-[#34c759]/5 border-[#34c759]/30' : 'bg-[#ff3b30]/5 border-[#ff3b30]/30'}`}>
          <div className="flex items-center gap-2 mb-2">
            {totals.netProfit >= 0 ? <ArrowUp size={14} className="text-[#15803d]" /> : <ArrowDown size={14} className="text-[#ff3b30]" />}
            <span className="text-[11px] uppercase tracking-wider text-[#86868b]">Net Profit</span>
          </div>
          <div className={`text-3xl font-semibold ${totals.netProfit >= 0 ? 'text-[#15803d]' : 'text-[#ff3b30]'}`}>
            {fmtJOD(totals.netProfit)}
          </div>
          <div className="text-[11px] text-[#86868b] mt-1">
            {totals.margin >= 0 ? '+' : ''}{totals.margin.toFixed(1)}% margin
          </div>
        </div>
      </div>

      {/* Revenue breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="bg-white rounded-2xl p-5 border border-[#e5e5ea]/60">
          <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3 flex items-center gap-2">
            <TrendingUp size={14} className="text-[#34c759]" /> Revenue sources
          </h3>
          <div className="space-y-3">
            <Row icon={<Coins size={14} className="text-[#eab308]" />}
              label="Token top-ups" value={fmtJOD(totals.sumTopups)} pct={totals.revenue > 0 ? (totals.sumTopups / totals.revenue) * 100 : 0} color="#eab308" />
            <Row icon={<UtensilsCrossed size={14} className="text-[#ff6f00]" />}
              label="Cafeteria (cash)" value={fmtJOD(totals.sumFood)} pct={totals.revenue > 0 ? (totals.sumFood / totals.revenue) * 100 : 0} color="#ff6f00" />
            <Row icon={<Flame size={14} className="text-[#06B6D4]" />}
              label="Hubbly (cash)" value={fmtJOD(totals.sumHubbly)} pct={totals.revenue > 0 ? (totals.sumHubbly / totals.revenue) * 100 : 0} color="#06B6D4" />
            <Row icon={<Gift size={14} className="text-[#34c759]" />}
              label="Promo bundles" value={fmtJOD(totals.sumPromo)} pct={totals.revenue > 0 ? (totals.sumPromo / totals.revenue) * 100 : 0} color="#34c759" />
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-[#e5e5ea]/60">
          <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3 flex items-center gap-2">
            <ArrowDown size={14} className="text-[#ff3b30]" /> Cost breakdown
          </h3>
          <div className="space-y-3">
            <Row icon={<UtensilsCrossed size={14} className="text-[#ff6f00]" />}
              label={`Food COGS (${cfg.foodCogsPercent}%)`} value={fmtJOD(totals.foodCogs)} pct={totals.costs > 0 ? (totals.foodCogs / totals.costs) * 100 : 0} color="#ff6f00" />
            <Row icon={<Flame size={14} className="text-[#06B6D4]" />}
              label={`Hubbly COGS (${cfg.hubblyCogsPercent}%)`} value={fmtJOD(totals.hubblyCogs)} pct={totals.costs > 0 ? (totals.hubblyCogs / totals.costs) * 100 : 0} color="#06B6D4" />
            <Row icon={<DollarSign size={14} className="text-[#86868b]" />}
              label={`Fixed (prorated ${totals.daysInPeriod.toFixed(1)}d)`} value={fmtJOD(totals.fixedForPeriod)} pct={totals.costs > 0 ? (totals.fixedForPeriod / totals.costs) * 100 : 0} color="#86868b" />
          </div>
          <p className="text-[10px] text-[#86868b] mt-4 leading-relaxed">
            Monthly fixed = {fmtJOD(cfg.rentJOD + cfg.electricityJOD + cfg.internetJOD + cfg.staffJOD + cfg.otherJOD)} ÷ 30 × {totals.daysInPeriod.toFixed(1)} days.
          </p>
        </div>
      </div>

      {/* ───── Configuration modal ───── */}
      {showConfig && (
        <div className="bg-white rounded-2xl p-5 border border-[#e5e5ea]/60 max-w-2xl">
          <h3 className="text-sm font-semibold text-[#1d1d1f] mb-3 flex items-center gap-2">
            <Settings size={14} className="text-[#0071e3]" /> Cost Configuration
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ConfigField label="Food COGS %" value={cfg.foodCogsPercent}
              onChange={(v) => setCfg({ ...cfg, foodCogsPercent: v })} suffix="%" />
            <ConfigField label="Hubbly COGS %" value={cfg.hubblyCogsPercent}
              onChange={(v) => setCfg({ ...cfg, hubblyCogsPercent: v })} suffix="%" />
            <ConfigField label="Rent (monthly)" value={cfg.rentJOD}
              onChange={(v) => setCfg({ ...cfg, rentJOD: v })} suffix="JOD" />
            <ConfigField label="Electricity (monthly)" value={cfg.electricityJOD}
              onChange={(v) => setCfg({ ...cfg, electricityJOD: v })} suffix="JOD" />
            <ConfigField label="Internet (monthly)" value={cfg.internetJOD}
              onChange={(v) => setCfg({ ...cfg, internetJOD: v })} suffix="JOD" />
            <ConfigField label="Staff (monthly)" value={cfg.staffJOD}
              onChange={(v) => setCfg({ ...cfg, staffJOD: v })} suffix="JOD" />
            <ConfigField label="Other (monthly)" value={cfg.otherJOD}
              onChange={(v) => setCfg({ ...cfg, otherJOD: v })} suffix="JOD" />
          </div>

          <div className="flex gap-3 mt-4 pt-4 border-t border-[#e5e5ea]">
            <button onClick={saveConfig} disabled={cfgSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0071e3] text-white rounded-xl font-medium text-sm hover:bg-[#0077ED] disabled:opacity-50">
              {cfgSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save configuration
            </button>
            {cfgJustSaved && (
              <span className="text-[#34c759] text-xs flex items-center gap-1">
                <CheckCircle2 size={12} /> Saved
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ───── Row component ─────
function Row({ icon, label, value, pct, color }: { icon: React.ReactNode; label: string; value: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-sm text-[#1d1d1f]">{icon}{label}</div>
        <div className="text-sm font-semibold text-[#1d1d1f] tabular-nums">{value}</div>
      </div>
      <div className="w-full h-1.5 rounded-full bg-[#f5f5f7] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <div className="text-[10px] text-[#86868b] mt-0.5">{pct.toFixed(1)}% of total</div>
    </div>
  );
}

function ConfigField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (v: number) => void; suffix: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-[#86868b] mb-1 block">{label}</label>
      <div className="relative">
        <input type="number" value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={`${input} pr-12`} step={suffix === '%' ? 0.5 : 10} min={0} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#86868b]">{suffix}</span>
      </div>
    </div>
  );
}
