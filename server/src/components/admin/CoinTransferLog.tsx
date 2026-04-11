'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import {
  ArrowRightLeft, Search, Filter, SortAsc, SortDesc,
  Coins, TrendingUp, Users, Crown, ChefHat, ShoppingBag,
  Shield, Gift, ArrowUpDown, Calendar, RefreshCw
} from 'lucide-react';

interface CoinTransfer {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  amount: number;
  timestamp: number;
  type: 'send' | 'admin-add' | 'admin-remove' | 'chest' | 'purchase' | 'food';
}

type FilterType = 'all' | 'player-to-player' | 'admin' | 'purchases' | 'food';
type SortField = 'date' | 'amount';
type SortDir = 'desc' | 'asc';

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  'send':         { label: 'Player Transfer', color: 'text-[#34c759]',  bg: 'bg-[#34c759]/10',  icon: <ArrowRightLeft size={14} /> },
  'admin-add':    { label: 'Admin Add',       color: 'text-[#0071e3]',  bg: 'bg-[#0071e3]/10',  icon: <Shield size={14} /> },
  'admin-remove': { label: 'Admin Remove',    color: 'text-[#ff3b30]',  bg: 'bg-[#ff3b30]/10',  icon: <Shield size={14} /> },
  'chest':        { label: 'Chest Reward',     color: 'text-[#ff9500]',  bg: 'bg-[#ff9500]/10',  icon: <Gift size={14} /> },
  'purchase':     { label: 'Purchase',         color: 'text-[#5856d6]',  bg: 'bg-[#5856d6]/10',  icon: <ShoppingBag size={14} /> },
  'food':         { label: 'Food Order',       color: 'text-[#ff9500]',  bg: 'bg-[#ff9500]/10',  icon: <ChefHat size={14} /> },
};

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all',              label: 'All' },
  { value: 'player-to-player', label: 'Player to Player' },
  { value: 'admin',            label: 'Admin' },
  { value: 'purchases',        label: 'Purchases' },
  { value: 'food',             label: 'Food' },
];

export function CoinTransferLog() {
  const [transfers, setTransfers] = useState<CoinTransfer[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [loading, setLoading] = useState(true);

  // Real-time listener
  useEffect(() => {
    const q = query(
      collection(db, 'coin-transfers'),
      orderBy('timestamp', 'desc'),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as CoinTransfer));
      setTransfers(data);
      setLoading(false);
    }, (err) => {
      console.error('Failed to load coin transfers:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Filter transfers by type
  const filteredByType = useMemo(() => {
    if (filter === 'all') return transfers;
    if (filter === 'player-to-player') return transfers.filter(t => t.type === 'send');
    if (filter === 'admin') return transfers.filter(t => t.type === 'admin-add' || t.type === 'admin-remove');
    if (filter === 'purchases') return transfers.filter(t => t.type === 'purchase' || t.type === 'chest');
    if (filter === 'food') return transfers.filter(t => t.type === 'food');
    return transfers;
  }, [transfers, filter]);

  // Search by player name
  const searched = useMemo(() => {
    if (!search.trim()) return filteredByType;
    const q = search.toLowerCase();
    return filteredByType.filter(t =>
      t.senderName.toLowerCase().includes(q) ||
      t.receiverName.toLowerCase().includes(q)
    );
  }, [filteredByType, search]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...searched];
    arr.sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1;
      if (sortField === 'date') return mul * (a.timestamp - b.timestamp);
      return mul * (a.amount - b.amount);
    });
    return arr;
  }, [searched, sortField, sortDir]);

  // Summary stats (today only)
  const stats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const todayTransfers = transfers.filter(t => t.timestamp >= todayMs);
    const totalCoinsToday = todayTransfers.reduce((sum, t) => sum + t.amount, 0);

    // Most active sender today
    const senderCounts: Record<string, { name: string; count: number }> = {};
    todayTransfers.forEach(t => {
      if (!senderCounts[t.senderId]) senderCounts[t.senderId] = { name: t.senderName, count: 0 };
      senderCounts[t.senderId].count++;
    });
    const topSender = Object.values(senderCounts).sort((a, b) => b.count - a.count)[0];

    return {
      transfersToday: todayTransfers.length,
      coinsMovedToday: totalCoinsToday,
      mostActiveSender: topSender?.name || '-',
      mostActiveSenderCount: topSender?.count || 0,
    };
  }, [transfers]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Today ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const statCards = [
    { label: 'Transfers Today', value: stats.transfersToday, icon: <ArrowRightLeft size={20} />, color: 'text-[#34c759]' },
    { label: 'Coins Moved Today', value: stats.coinsMovedToday.toLocaleString(), icon: <Coins size={20} />, color: 'text-[#ff9500]' },
    { label: 'Most Active Sender', value: stats.mostActiveSender, sub: stats.mostActiveSenderCount > 0 ? `${stats.mostActiveSenderCount} transfers` : '', icon: <Crown size={20} />, color: 'text-[#5856d6]' },
    { label: 'Total Logged', value: transfers.length, icon: <TrendingUp size={20} />, color: 'text-[#0071e3]' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">Coin Transfers</h2>
          <p className="text-[#86868b] text-sm">Track all coin movements between players</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#86868b]">
            {sorted.length} result{sorted.length !== 1 ? 's' : ''}
          </span>
          {loading && (
            <RefreshCw size={16} className="text-[#0071e3] animate-spin" />
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={card.color}>{card.icon}</div>
              <span className="text-xs text-[#86868b] uppercase">{card.label}</span>
            </div>
            <p className={`text-xl font-semibold ${card.color}`}>{card.value}</p>
            {card.sub && <p className="text-xs text-[#86868b] mt-1">{card.sub}</p>}
          </motion.div>
        ))}
      </div>

      {/* Controls: Search + Filter + Sort */}
      <div className="flex items-center gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by player name..."
            className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-9 pr-3 py-2 text-sm text-[#1d1d1f] placeholder-[#86868b] outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 transition-all"
          />
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1">
          <Filter size={14} className="text-[#86868b] mr-1" />
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                filter === opt.value
                  ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20'
                  : 'bg-[#f5f5f7] text-[#86868b] border border-[#d2d2d7] hover:bg-[#e5e5ea]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sort buttons */}
        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => toggleSort('date')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              sortField === 'date'
                ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20'
                : 'bg-[#f5f5f7] text-[#86868b] border border-[#d2d2d7] hover:bg-[#e5e5ea]'
            }`}
          >
            <Calendar size={12} />
            Date
            {sortField === 'date' && (sortDir === 'desc' ? <SortDesc size={12} /> : <SortAsc size={12} />)}
          </button>
          <button
            onClick={() => toggleSort('amount')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              sortField === 'amount'
                ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20'
                : 'bg-[#f5f5f7] text-[#86868b] border border-[#d2d2d7] hover:bg-[#e5e5ea]'
            }`}
          >
            <ArrowUpDown size={12} />
            Amount
            {sortField === 'amount' && (sortDir === 'desc' ? <SortDesc size={12} /> : <SortAsc size={12} />)}
          </button>
        </div>
      </div>

      {/* Transfer List */}
      <div className="bg-white rounded-2xl border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_auto_1fr_100px_120px_100px] gap-4 px-4 py-3 border-b border-[#e5e5ea] bg-[#f5f5f7]">
          <span className="text-xs text-[#86868b] uppercase font-medium">Sender</span>
          <span className="text-xs text-[#86868b] uppercase w-8 text-center"></span>
          <span className="text-xs text-[#86868b] uppercase font-medium">Receiver</span>
          <span className="text-xs text-[#86868b] uppercase text-right font-medium">Amount</span>
          <span className="text-xs text-[#86868b] uppercase text-center font-medium">Type</span>
          <span className="text-xs text-[#86868b] uppercase text-right font-medium">Time</span>
        </div>

        {/* Rows */}
        <div className="max-h-[500px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw size={24} className="text-[#0071e3] animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-20">
              <ArrowRightLeft size={40} className="text-[#d2d2d7] mx-auto mb-3" />
              <p className="text-[#86868b]">No transfers found</p>
              <p className="text-xs text-[#86868b] mt-1">
                {transfers.length === 0
                  ? 'Transfers will appear here once logging is enabled'
                  : 'Try adjusting your filters or search'}
              </p>
            </div>
          ) : (
            sorted.map((t, i) => {
              const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG['send'];
              return (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.01 }}
                  className="grid grid-cols-[1fr_auto_1fr_100px_120px_100px] gap-4 px-4 py-3 border-b border-[#e5e5ea]/40 hover:bg-[#f5f5f7] transition-colors items-center"
                >
                  {/* Sender */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[#f5f5f7] flex items-center justify-center shrink-0">
                      <Users size={12} className="text-[#86868b]" />
                    </div>
                    <span className="text-sm text-[#1d1d1f] truncate">{t.senderName}</span>
                  </div>

                  {/* Arrow */}
                  <div className="w-8 flex justify-center">
                    <ArrowRightLeft size={14} className={cfg.color} />
                  </div>

                  {/* Receiver */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-[#f5f5f7] flex items-center justify-center shrink-0">
                      <Users size={12} className="text-[#86868b]" />
                    </div>
                    <span className="text-sm text-[#1d1d1f] truncate">{t.receiverName}</span>
                  </div>

                  {/* Amount */}
                  <div className="text-right">
                    <span className={`text-sm font-semibold ${
                      t.type === 'admin-remove' ? 'text-[#ff3b30]' : 'text-[#ff9500]'
                    }`}>
                      {t.type === 'admin-remove' ? '-' : '+'}{t.amount.toLocaleString()}
                    </span>
                  </div>

                  {/* Type badge */}
                  <div className="flex justify-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} text-[10px] uppercase font-medium`}>
                      {cfg.icon}
                      {cfg.label}
                    </span>
                  </div>

                  {/* Time */}
                  <div className="text-right">
                    <span className="text-xs text-[#86868b]">{formatTime(t.timestamp)}</span>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
