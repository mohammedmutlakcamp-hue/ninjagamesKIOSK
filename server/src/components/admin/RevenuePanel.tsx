'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import {
  Users, UserCheck, Coins, BarChart3, Clock,
  ClipboardList, UtensilsCrossed, RefreshCw, Lightbulb
} from 'lucide-react';
import { HelpTip } from './HelpTip';

export function RevenuePanel() {
  const [stats, setStats] = useState({
    totalPlayers: 0,
    totalCoinsInCirculation: 0,
    totalCoinsSpent: 0,
    totalPlaytimeHours: 0,
    totalOrders: 0,
    totalFoodRevenue: 0,
    todayActivePlayers: 0,
  });

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try {
      const playersSnap = await getDocs(collection(db, 'players'));
      const ordersSnap = await getDocs(collection(db, 'orders'));
      let totalCoins = 0, totalSpent = 0, totalPlaytime = 0, todayActive = 0;
      const today = new Date().setHours(0, 0, 0, 0);

      playersSnap.docs.forEach(d => {
        const p = d.data();
        totalCoins += p.coins || 0;
        totalSpent += p.totalCoinsSpent || 0;
        totalPlaytime += p.totalPlaytime || 0;
        if (p.lastLogin > today) todayActive++;
      });

      let foodRevenue = 0;
      ordersSnap.docs.forEach(d => {
        const o = d.data();
        if (o.status !== 'cancelled') foodRevenue += o.totalCoins || 0;
      });

      setStats({
        totalPlayers: playersSnap.size,
        totalCoinsInCirculation: Math.floor(totalCoins),
        totalCoinsSpent: Math.floor(totalSpent),
        totalPlaytimeHours: Math.floor(totalPlaytime / 60),
        totalOrders: ordersSnap.size,
        totalFoodRevenue: foodRevenue,
        todayActivePlayers: todayActive,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const cards = [
    { label: 'Total Players', value: stats.totalPlayers, icon: <Users size={24} />, color: 'text-[#0071e3]' },
    { label: 'Active Today', value: stats.todayActivePlayers, icon: <UserCheck size={24} />, color: 'text-[#0071e3]' },
    { label: 'Coins in Circulation', value: stats.totalCoinsInCirculation.toLocaleString(), icon: <Coins size={24} />, color: 'text-[#ff9500]' },
    { label: 'Coins Spent (All Time)', value: stats.totalCoinsSpent.toLocaleString(), icon: <BarChart3 size={24} />, color: 'text-[#0071e3]' },
    { label: 'Total Playtime', value: `${stats.totalPlaytimeHours.toLocaleString()}h`, icon: <Clock size={24} />, color: 'text-[#af52de]' },
    { label: 'Total Orders', value: stats.totalOrders, icon: <ClipboardList size={24} />, color: 'text-[#ff9500]' },
    { label: 'Food Revenue', value: `${stats.totalFoodRevenue.toLocaleString()} coins`, icon: <UtensilsCrossed size={24} />, color: 'text-[#ff3b30]' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            Revenue & Stats
            <HelpTip title={{ en: 'Revenue & Stats', ar: 'الإيرادات والإحصائيات' }}
              ar={(
                <>
                  <p className="mb-2">ملخص سريع لإحصائيات المحل: عدد اللاعبين، التوكنز المتداولة، الطلبات، الجلسات، إلخ.</p>
                  <p className="text-[#86868b]">للأرقام المالية الكاملة (الربح، الهامش، تفصيل المصاريف)، استخدم تبويب "Real P&L".</p>
                </>
              )}>
              <p className="mb-2">Quick summary of shop stats: player count, tokens in circulation, orders, sessions, etc.</p>
              <p className="text-[#86868b]">For full financial numbers (profit, margin, cost breakdown), use the <strong>Real P&L</strong> tab.</p>
            </HelpTip>
          </h2>
          <p className="text-[#86868b] text-sm">Business overview</p>
        </div>
        <button
          onClick={loadStats}
          className="px-4 py-2 border border-[#d2d2d7] rounded-xl text-[#1d1d1f] text-sm font-medium hover:bg-[#f5f5f7] flex items-center gap-2 transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white rounded-2xl p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
          >
            <div className={`flex justify-center mb-3 ${card.color}`}>{card.icon}</div>
            <p className={`text-2xl font-semibold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-[#86868b] mt-1">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Note */}
      <div className="mt-8 bg-white rounded-2xl p-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
        <p className="text-[#86868b] text-sm flex items-center justify-center gap-2">
          <Lightbulb size={16} className="text-[#ff9500]" />
          Revenue tracking is based on coins. Set your coin-to-currency ratio in Settings to see actual money values.
        </p>
      </div>
    </div>
  );
}
