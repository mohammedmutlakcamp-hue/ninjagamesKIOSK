'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, doc, getDoc, setDoc, query, where, Timestamp
} from 'firebase/firestore';
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3, PieChart,
  Monitor, Users, Clock, RefreshCw, Save, Calendar,
  Coins, UtensilsCrossed, ArrowUpCircle, Package, Swords, Palette,
  Zap, Trophy, UserPlus, UserCheck, Crown
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────
const COINS_PER_JOD = 100;
const OPERATING_HOURS_PER_DAY = 14; // 10am - 12am typical gaming center
const AVG_CHEST_COST: Record<string, number> = {
  bronze: 50, silver: 100, gold: 250, legendary: 500, ninja: 1000
};

type Period = 'today' | 'week' | 'month' | 'all';

interface CostData {
  rent: number;
  electricity: number;
  internet: number;
  staff: number;
  equipment: number;
  other: number;
}

interface RevenueBreakdown {
  sessions: number;
  food: number;
  topups: number;
  chests: number;
  tournaments: number;
  skins: number;
}

interface PCUtilization {
  pcId: string;
  hoursUsed: number;
  rate: number;
}

interface TopSpender {
  id: string;
  name: string;
  spent: number;
  ninjaType?: string;
}

interface PeakHour {
  hour: number;
  count: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────
function coinsToJOD(coins: number): string {
  return (coins / COINS_PER_JOD).toFixed(2);
}

function getPeriodStart(period: Period): Date | null {
  const now = new Date();
  switch (period) {
    case 'today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month': {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    case 'all':
      return null;
  }
}

function toDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val.toDate();
  if (val?.seconds) return new Date(val.seconds * 1000);
  if (typeof val === 'number') return new Date(val);
  if (typeof val === 'string') return new Date(val);
  return null;
}

function isInPeriod(dateVal: any, periodStart: Date | null): boolean {
  if (!periodStart) return true;
  const d = toDate(dateVal);
  if (!d) return false;
  return d >= periodStart;
}

// ─── Component ───────────────────────────────────────────────────────
export function ProfitDashboard() {
  const [period, setPeriod] = useState<Period>('today');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Revenue
  const [revenueCoins, setRevenueCoins] = useState(0);
  const [breakdown, setBreakdown] = useState<RevenueBreakdown>({
    sessions: 0, food: 0, topups: 0, chests: 0, tournaments: 0, skins: 0
  });

  // Costs
  const [costs, setCosts] = useState<CostData>({
    rent: 0, electricity: 0, internet: 0, staff: 0, equipment: 0, other: 0
  });

  // PC utilization (always today)
  const [pcUtils, setPcUtils] = useState<PCUtilization[]>([]);
  const [overallUtil, setOverallUtil] = useState(0);
  const [peakHours, setPeakHours] = useState<PeakHour[]>([]);

  // Player analytics
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [avgRevPerPlayer, setAvgRevPerPlayer] = useState(0);
  const [topSpenders, setTopSpenders] = useState<TopSpender[]>([]);
  const [newPlayersWeek, setNewPlayersWeek] = useState(0);
  const [newPlayersMonth, setNewPlayersMonth] = useState(0);
  const [retention, setRetention] = useState(0);

  // All-period revenues for the top cards
  const [todayRev, setTodayRev] = useState(0);
  const [weekRev, setWeekRev] = useState(0);
  const [monthRev, setMonthRev] = useState(0);
  const [allTimeRev, setAllTimeRev] = useState(0);

  // ── Load costs from Firestore ──────────────────────────────────────
  const loadCosts = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'config', 'costs'));
      if (snap.exists()) {
        const d = snap.data() as CostData;
        setCosts({
          rent: d.rent || 0,
          electricity: d.electricity || 0,
          internet: d.internet || 0,
          staff: d.staff || 0,
          equipment: d.equipment || 0,
          other: d.other || 0,
        });
      }
    } catch (err) {
      console.error('Failed to load costs:', err);
    }
  }, []);

  const saveCosts = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'costs'), costs);
    } catch (err) {
      console.error('Failed to save costs:', err);
    }
    setSaving(false);
  };

  // ── Compute revenue for a given period start ───────────────────────
  const computeRevenue = useCallback(
    (
      sessions: any[],
      orders: any[],
      topups: any[],
      chestDrops: any[],
      tournaments: any[],
      periodStart: Date | null
    ): number => {
      let total = 0;
      sessions.forEach(s => { if (isInPeriod(s.startTime, periodStart)) total += s.coinsSpent || 0; });
      orders.forEach(o => { if (o.status !== 'cancelled' && isInPeriod(o.createdAt, periodStart)) total += o.totalCoins || 0; });
      topups.forEach(t => { if (t.status === 'approved' && isInPeriod(t.createdAt, periodStart)) total += t.coins || 0; });
      chestDrops.forEach(c => {
        if (isInPeriod(c.timestamp, periodStart)) {
          total += AVG_CHEST_COST[c.chestTier] || 100;
        }
      });
      tournaments.forEach(t => { if (t.status === 'completed' && isInPeriod(t.createdAt, periodStart)) total += t.adminProfit || 0; });
      return total;
    },
    []
  );

  // ── Main data load ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all collections in parallel
      const [sessionsSnap, ordersSnap, topupsSnap, chestsSnap, tournamentsSnap, playersSnap] =
        await Promise.all([
          getDocs(collection(db, 'sessions')),
          getDocs(collection(db, 'orders')),
          getDocs(collection(db, 'topup-requests')),
          getDocs(collection(db, 'chest-drops')),
          getDocs(collection(db, 'tournaments')),
          getDocs(collection(db, 'players')),
        ]);

      const sessions = sessionsSnap.docs.map(d => d.data());
      const orders = ordersSnap.docs.map(d => d.data());
      const topups = topupsSnap.docs.map(d => d.data());
      const chestDrops = chestsSnap.docs.map(d => d.data());
      const tournaments = tournamentsSnap.docs.map(d => d.data());
      const players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // ── Top cards: revenue for each period ──
      const todayStart = getPeriodStart('today')!;
      const weekStart = getPeriodStart('week')!;
      const monthStart = getPeriodStart('month')!;

      const tR = computeRevenue(sessions, orders, topups, chestDrops, tournaments, todayStart);
      const wR = computeRevenue(sessions, orders, topups, chestDrops, tournaments, weekStart);
      const mR = computeRevenue(sessions, orders, topups, chestDrops, tournaments, monthStart);
      const aR = computeRevenue(sessions, orders, topups, chestDrops, tournaments, null);

      setTodayRev(tR);
      setWeekRev(wR);
      setMonthRev(mR);
      setAllTimeRev(aR);

      // ── Breakdown for selected period ──
      const ps = getPeriodStart(period);
      let bSessions = 0, bFood = 0, bTopups = 0, bChests = 0, bTournaments = 0;

      sessions.forEach(s => { if (isInPeriod(s.startTime, ps)) bSessions += s.coinsSpent || 0; });
      orders.forEach(o => { if (o.status !== 'cancelled' && isInPeriod(o.createdAt, ps)) bFood += o.totalCoins || 0; });
      topups.forEach(t => { if (t.status === 'approved' && isInPeriod(t.createdAt, ps)) bTopups += t.coins || 0; });
      chestDrops.forEach(c => { if (isInPeriod(c.timestamp, ps)) bChests += AVG_CHEST_COST[c.chestTier] || 100; });
      tournaments.forEach(t => { if (t.status === 'completed' && isInPeriod(t.createdAt, ps)) bTournaments += t.adminProfit || 0; });

      const totalBreakdown = bSessions + bFood + bTopups + bChests + bTournaments;
      // Skins = remainder from player totalCoinsSpent minus known categories
      let playerSpentInPeriod = 0;
      players.forEach((p: any) => {
        if (isInPeriod(p.createdAt, ps)) {
          playerSpentInPeriod += p.totalCoinsSpent || 0;
        }
      });
      const bSkins = Math.max(0, playerSpentInPeriod - totalBreakdown);

      const periodRev = totalBreakdown + bSkins;
      setRevenueCoins(periodRev);
      setBreakdown({ sessions: bSessions, food: bFood, topups: bTopups, chests: bChests, tournaments: bTournaments, skins: bSkins });

      // ── PC Utilization (today only) ──
      const todaySessions = sessions.filter(s => isInPeriod(s.startTime, todayStart));
      const pcMap: Record<string, number> = {};
      todaySessions.forEach(s => {
        const pcId = s.pcId || 'unknown';
        const dur = s.duration || 0; // minutes
        pcMap[pcId] = (pcMap[pcId] || 0) + dur;
      });

      const pcUtilList: PCUtilization[] = Object.entries(pcMap)
        .map(([pcId, mins]) => ({
          pcId,
          hoursUsed: Math.round((mins / 60) * 10) / 10,
          rate: Math.min(100, Math.round((mins / (OPERATING_HOURS_PER_DAY * 60)) * 100)),
        }))
        .sort((a, b) => b.hoursUsed - a.hoursUsed);

      setPcUtils(pcUtilList);
      const totalPCCount = pcUtilList.length || 1;
      const avgRate = pcUtilList.reduce((s, p) => s + p.rate, 0) / totalPCCount;
      setOverallUtil(Math.round(avgRate));

      // Peak hours
      const hourCounts: Record<number, number> = {};
      todaySessions.forEach(s => {
        const d = toDate(s.startTime);
        if (d) {
          const h = d.getHours();
          hourCounts[h] = (hourCounts[h] || 0) + 1;
        }
      });
      const peaks: PeakHour[] = Object.entries(hourCounts)
        .map(([h, c]) => ({ hour: parseInt(h), count: c }))
        .sort((a, b) => b.count - a.count);
      setPeakHours(peaks);

      // ── Player Analytics ──
      setTotalPlayers(players.length);
      const totalSpent = players.reduce((s: number, p: any) => s + (p.totalCoinsSpent || 0), 0);
      setAvgRevPerPlayer(players.length ? Math.round(totalSpent / players.length) : 0);

      // Top 10 spenders
      const sorted = [...players]
        .sort((a: any, b: any) => (b.totalCoinsSpent || 0) - (a.totalCoinsSpent || 0))
        .slice(0, 10)
        .map((p: any) => ({
          id: p.id,
          name: p.username || p.name || 'Unknown',
          spent: p.totalCoinsSpent || 0,
          ninjaType: p.ninjaType,
        }));
      setTopSpenders(sorted);

      // New players
      const now = new Date();
      const wStart = getPeriodStart('week')!;
      const mStart = getPeriodStart('month')!;
      let npW = 0, npM = 0;
      players.forEach((p: any) => {
        const created = toDate(p.createdAt);
        if (created) {
          if (created >= wStart) npW++;
          if (created >= mStart) npM++;
        }
      });
      setNewPlayersWeek(npW);
      setNewPlayersMonth(npM);

      // Retention: players who logged in more than once this week
      let retainedCount = 0;
      players.forEach((p: any) => {
        const lastLogin = toDate(p.lastLogin);
        const created = toDate(p.createdAt);
        if (lastLogin && lastLogin >= wStart && created && created < wStart) {
          retainedCount++;
        }
      });
      const existingPlayers = players.filter((p: any) => {
        const created = toDate(p.createdAt);
        return created && created < wStart;
      }).length;
      setRetention(existingPlayers ? Math.round((retainedCount / existingPlayers) * 100) : 0);

    } catch (err) {
      console.error('Failed to load profit data:', err);
    }
    setLoading(false);
  }, [period, computeRevenue]);

  useEffect(() => { loadData(); loadCosts(); }, [loadData, loadCosts]);

  // ── Derived values ─────────────────────────────────────────────────
  const monthlyCostTotal = costs.rent + costs.electricity + costs.internet + costs.staff + costs.equipment + costs.other;
  const monthlyRevenueJOD = parseFloat(coinsToJOD(monthRev));
  const profitLoss = monthlyRevenueJOD - monthlyCostTotal;
  const breakEvenHours = monthlyCostTotal > 0 ? Math.ceil(monthlyCostTotal / (100 / COINS_PER_JOD * 60)) : 0;
  // 100 coins/hour rate => 1 JOD/hour

  const maxBreakdown = Math.max(breakdown.sessions, breakdown.food, breakdown.topups, breakdown.chests, breakdown.tournaments, breakdown.skins, 1);

  const periodLabels: Record<Period, string> = {
    today: 'Today', week: 'This Week', month: 'This Month', all: 'All Time'
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">Profit Dashboard</h2>
          <p className="text-[#86868b] text-sm">Comprehensive business analytics</p>
        </div>
        <button
          onClick={() => { loadData(); loadCosts(); }}
          disabled={loading}
          className="px-4 py-2 border border-[#d2d2d7] rounded-xl text-[#1d1d1f] text-sm font-medium hover:bg-[#f5f5f7] flex items-center gap-2 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2">
        {(['today', 'week', 'month', 'all'] as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              period === p
                ? 'bg-[#0071e3] text-white'
                : 'bg-white text-[#86868b] hover:text-[#1d1d1f] border border-[#d2d2d7]'
            }`}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* ── Section 1: Revenue Overview Cards ──────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Today's Revenue", coins: todayRev, icon: <DollarSign size={22} />, color: 'text-[#ff9500]' },
          { label: 'This Week', coins: weekRev, icon: <TrendingUp size={22} />, color: 'text-[#0071e3]' },
          { label: 'This Month', coins: monthRev, icon: <BarChart3 size={22} />, color: 'text-[#5856d6]' },
          { label: 'All Time', coins: allTimeRev, icon: <Crown size={22} />, color: 'text-[#34c759]' },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
          >
            <div className={`flex items-center gap-2 mb-2 ${card.color}`}>
              {card.icon}
              <span className="text-xs text-[#86868b]">{card.label}</span>
            </div>
            <p className={`text-2xl font-semibold ${card.color}`}>
              {card.coins.toLocaleString()} <span className="text-sm text-[#86868b]">coins</span>
            </p>
            <p className="text-sm text-[#86868b] mt-1">{coinsToJOD(card.coins)} JOD</p>
          </motion.div>
        ))}
      </div>

      {/* ── Section 2: Revenue Breakdown ───────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
      >
        <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
          <PieChart size={18} className="text-[#0071e3]" />
          Revenue Breakdown — {periodLabels[period]}
        </h3>
        <div className="space-y-3">
          {[
            { label: 'Session Time', value: breakdown.sessions, color: 'bg-[#34c759]', icon: <Clock size={16} /> },
            { label: 'Food & Drinks', value: breakdown.food, color: 'bg-[#ff9500]', icon: <UtensilsCrossed size={16} /> },
            { label: 'Top-Ups', value: breakdown.topups, color: 'bg-[#0071e3]', icon: <ArrowUpCircle size={16} /> },
            { label: 'Chests', value: breakdown.chests, color: 'bg-[#5856d6]', icon: <Package size={16} /> },
            { label: 'Tournaments', value: breakdown.tournaments, color: 'bg-[#ff3b30]', icon: <Swords size={16} /> },
            { label: 'Skins (est.)', value: breakdown.skins, color: 'bg-[#af52de]', icon: <Palette size={16} /> },
          ].map((item, i) => (
            <div key={item.label} className="flex items-center gap-3">
              <div className="w-32 flex items-center gap-2 text-[#86868b] text-sm">
                {item.icon} {item.label}
              </div>
              <div className="flex-1 h-6 bg-[#f5f5f7] rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(item.value / maxBreakdown) * 100}%` }}
                  transition={{ delay: 0.4 + i * 0.1, duration: 0.6 }}
                  className={`h-full ${item.color} rounded-full`}
                />
              </div>
              <div className="w-28 text-right">
                <span className="text-sm font-semibold text-[#1d1d1f]">{item.value.toLocaleString()}</span>
                <span className="text-xs text-[#86868b] ml-1">({coinsToJOD(item.value)} JOD)</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ── Section 3 + 4: Cost Tracking & Profit/Loss ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cost Tracking */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
        >
          <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
            <DollarSign size={18} className="text-[#0071e3]" />
            Monthly Costs (JOD)
          </h3>
          <div className="space-y-3">
            {([
              { key: 'rent', label: 'Rent' },
              { key: 'electricity', label: 'Electricity' },
              { key: 'internet', label: 'Internet' },
              { key: 'staff', label: 'Staff' },
              { key: 'equipment', label: 'Equipment' },
              { key: 'other', label: 'Other' },
            ] as { key: keyof CostData; label: string }[]).map(item => (
              <div key={item.key} className="flex items-center gap-3">
                <label className="w-24 text-sm text-[#86868b]">{item.label}</label>
                <input
                  type="number"
                  value={costs[item.key] || ''}
                  onChange={e => setCosts(prev => ({ ...prev, [item.key]: parseFloat(e.target.value) || 0 }))}
                  className="flex-1 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2 text-[#1d1d1f] text-sm focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-lg font-semibold text-[#0071e3]">
              Total: {monthlyCostTotal.toFixed(2)} JOD
            </p>
            <button
              onClick={saveCosts}
              disabled={saving}
              className="px-4 py-2 bg-[#0071e3] text-white rounded-xl font-medium text-sm flex items-center gap-2 hover:bg-[#0077ED] disabled:opacity-50 transition-colors"
            >
              <Save size={14} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </motion.div>

        {/* Profit & Loss */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 flex flex-col justify-between"
        >
          <div>
            <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
              {profitLoss >= 0 ? (
                <TrendingUp size={18} className="text-[#34c759]" />
              ) : (
                <TrendingDown size={18} className="text-[#ff3b30]" />
              )}
              Profit & Loss (This Month)
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-[#ff9500]">
                <span>Monthly Revenue</span>
                <span className="font-semibold">{monthlyRevenueJOD.toFixed(2)} JOD</span>
              </div>
              <div className="flex justify-between text-[#0071e3]">
                <span>Monthly Costs</span>
                <span className="font-semibold">-{monthlyCostTotal.toFixed(2)} JOD</span>
              </div>
              <div className="border-t border-[#e5e5ea] pt-2 flex justify-between">
                <span className="text-[#86868b]">Net Profit / Loss</span>
                <span className={`font-semibold text-lg ${profitLoss >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
                  {profitLoss >= 0 ? '+' : ''}{profitLoss.toFixed(2)} JOD
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.6 }}
              className={`text-center py-4 rounded-xl ${
                profitLoss >= 0
                  ? 'bg-[#34c759]/10 border border-[#34c759]/20'
                  : 'bg-[#ff3b30]/10 border border-[#ff3b30]/20'
              }`}
            >
              <p className={`text-4xl font-semibold ${profitLoss >= 0 ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
                {profitLoss >= 0 ? '+' : ''}{profitLoss.toFixed(2)}
              </p>
              <p className="text-xs text-[#86868b] mt-1">JOD this month</p>
            </motion.div>

            <div className="mt-3 text-center">
              <p className="text-xs text-[#86868b]">
                Break-even: <span className="text-[#ff9500] font-semibold">{breakEvenHours}h</span> of PC usage needed/month
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Section 5: PC Utilization ──────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
      >
        <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
          <Monitor size={18} className="text-[#0071e3]" />
          PC Utilization (Today)
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-[#f5f5f7] rounded-xl p-3 border border-[#e5e5ea]/60 text-center">
            <p className="text-2xl font-semibold text-[#34c759]">{overallUtil}%</p>
            <p className="text-xs text-[#86868b]">Overall Rate</p>
          </div>
          <div className="bg-[#f5f5f7] rounded-xl p-3 border border-[#e5e5ea]/60 text-center">
            <p className="text-2xl font-semibold text-[#0071e3]">{pcUtils.length}</p>
            <p className="text-xs text-[#86868b]">PCs Used Today</p>
          </div>
          <div className="bg-[#f5f5f7] rounded-xl p-3 border border-[#e5e5ea]/60 text-center">
            <p className="text-lg font-semibold text-[#34c759]">{pcUtils[0]?.pcId || '-'}</p>
            <p className="text-xs text-[#86868b]">Most Used ({pcUtils[0]?.hoursUsed || 0}h)</p>
          </div>
          <div className="bg-[#f5f5f7] rounded-xl p-3 border border-[#e5e5ea]/60 text-center">
            <p className="text-lg font-semibold text-[#ff3b30]">{pcUtils[pcUtils.length - 1]?.pcId || '-'}</p>
            <p className="text-xs text-[#86868b]">Least Used ({pcUtils[pcUtils.length - 1]?.hoursUsed || 0}h)</p>
          </div>
        </div>

        {/* PC bars */}
        {pcUtils.length > 0 ? (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {pcUtils.map((pc, i) => (
              <div key={pc.pcId} className="flex items-center gap-3">
                <span className="w-20 text-xs text-[#86868b] truncate">{pc.pcId}</span>
                <div className="flex-1 h-4 bg-[#f5f5f7] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pc.rate}%` }}
                    transition={{ delay: 0.6 + i * 0.05, duration: 0.5 }}
                    className={`h-full rounded-full ${
                      pc.rate > 70 ? 'bg-[#34c759]' : pc.rate > 40 ? 'bg-[#ff9500]' : 'bg-[#ff3b30]'
                    }`}
                  />
                </div>
                <span className="w-16 text-right text-xs text-[#86868b]">{pc.hoursUsed}h ({pc.rate}%)</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#86868b] text-center py-4">No sessions recorded today.</p>
        )}

        {/* Peak Hours */}
        {peakHours.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#e5e5ea]">
            <p className="text-xs text-[#86868b] mb-2">Peak Hours</p>
            <div className="flex gap-2 flex-wrap">
              {peakHours.slice(0, 6).map((ph, i) => (
                <span
                  key={ph.hour}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    i === 0
                      ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20'
                      : 'bg-[#f5f5f7] text-[#86868b] border border-[#e5e5ea]/60'
                  }`}
                >
                  {ph.hour}:00 ({ph.count} sessions)
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Section 6: Player Analytics ────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
      >
        <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4 flex items-center gap-2">
          <Users size={18} className="text-[#0071e3]" />
          Player Analytics
        </h3>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total Players', value: totalPlayers, icon: <Users size={16} />, color: 'text-[#0071e3]' },
            { label: 'Avg Rev / Player', value: `${avgRevPerPlayer} coins`, icon: <Coins size={16} />, color: 'text-[#ff9500]' },
            { label: 'New (Week)', value: newPlayersWeek, icon: <UserPlus size={16} />, color: 'text-[#5856d6]' },
            { label: 'New (Month)', value: newPlayersMonth, icon: <UserPlus size={16} />, color: 'text-[#af52de]' },
            { label: 'Retention', value: `${retention}%`, icon: <UserCheck size={16} />, color: 'text-[#34c759]' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.7 + i * 0.05 }}
              className="bg-[#f5f5f7] rounded-xl p-3 border border-[#e5e5ea]/60 text-center"
            >
              <div className={`flex justify-center mb-1 ${stat.color}`}>{stat.icon}</div>
              <p className={`text-lg font-semibold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-[#86868b]">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Top 10 Spenders */}
        <h4 className="text-sm font-medium text-[#86868b] mb-2 flex items-center gap-2">
          <Trophy size={14} className="text-[#ff9500]" /> Top 10 Spenders
        </h4>
        <div className="space-y-2">
          {topSpenders.map((player, i) => (
            <motion.div
              key={player.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + i * 0.05 }}
              className="flex items-center gap-3 bg-[#f5f5f7] rounded-xl px-4 py-2 border border-[#e5e5ea]/60"
            >
              <span className={`text-sm font-semibold w-6 text-center ${
                i === 0 ? 'text-[#ff9500]' : i === 1 ? 'text-[#86868b]' : i === 2 ? 'text-[#af52de]' : 'text-[#86868b]'
              }`}>
                #{i + 1}
              </span>
              <span className="flex-1 text-sm text-[#1d1d1f] truncate">{player.name}</span>
              {player.ninjaType && (
                <span className="text-xs text-[#86868b] capitalize">{player.ninjaType}</span>
              )}
              <span className="text-sm font-semibold text-[#ff9500]">
                {player.spent.toLocaleString()} <span className="text-xs text-[#86868b]">coins</span>
              </span>
              <span className="text-xs text-[#86868b]">
                ({coinsToJOD(player.spent)} JOD)
              </span>
            </motion.div>
          ))}
          {topSpenders.length === 0 && (
            <p className="text-sm text-[#86868b] text-center py-4">No player data available.</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
