'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, onSnapshot, doc, updateDoc, query, where, orderBy, getDocs, getDoc
} from 'firebase/firestore';
import { useVipConfig } from '@/lib/usePricingConfig';
import {
  Crown, Check, X, Clock, Loader2, User, Coins, Calendar, Shield, AlertTriangle
} from 'lucide-react';
import { HelpTip } from './HelpTip';

interface VIPRequest {
  id: string;
  playerId: string;
  playerName: string;
  price: number;
  trial: boolean;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export function VIPRequests() {
  const VIP_CONFIG = useVipConfig();
  const [requests, setRequests] = useState<VIPRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // Real-time listener for VIP requests
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'vip_requests'), (snap) => {
      const reqs: VIPRequest[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as VIPRequest));
      reqs.sort((a, b) => b.createdAt - a.createdAt);
      setRequests(reqs);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredRequests = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const handleApprove = async (req: VIPRequest) => {
    setProcessing(req.id);
    try {
      const durationDays = req.trial ? VIP_CONFIG.trialDays : VIP_CONFIG.durationDays;
      const now = Date.now();
      const expiresAt = now + durationDays * 24 * 60 * 60 * 1000;

      // Check current VIP status -- extend if already active
      const playerSnap = await getDoc(doc(db, 'players', req.playerId));
      const playerData = playerSnap.data();
      const currentVip = playerData?.vip;
      let finalExpiry = expiresAt;

      // If already VIP and not expired, extend from current expiry
      if (currentVip?.active && currentVip.expiresAt > now) {
        finalExpiry = currentVip.expiresAt + durationDays * 24 * 60 * 60 * 1000;
      }

      // Activate VIP on player doc
      await updateDoc(doc(db, 'players', req.playerId), {
        'vip.active': true,
        'vip.startedAt': currentVip?.active ? currentVip.startedAt : now,
        'vip.expiresAt': finalExpiry,
        'vip.trialUsed': currentVip?.trialUsed || req.trial,
        'vip.tier': 'basic',
      });

      // Update request status
      await updateDoc(doc(db, 'vip_requests', req.id), {
        status: 'approved',
        approvedAt: now,
      });
    } catch (err) {
      console.error('VIP approve failed:', err);
    }
    setProcessing(null);
  };

  const handleDecline = async (req: VIPRequest) => {
    setProcessing(req.id);
    try {
      await updateDoc(doc(db, 'vip_requests', req.id), {
        status: 'rejected',
        rejectedAt: Date.now(),
      });
    } catch (err) {
      console.error('VIP decline failed:', err);
    }
    setProcessing(null);
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatDaysLeft = (expiresAt: number) => {
    const days = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
    if (days <= 0) return 'Expired';
    return `${days}d left`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ff9500]/10 border border-[#ff9500]/20 flex items-center justify-center">
            <Crown size={20} className="text-[#ff9500]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[#1d1d1f] flex items-center gap-2">
              VIP Requests
              <HelpTip title={{ en: 'VIP Requests', ar: 'طلبات VIP' }}
                ar={<p>اللاعبون الذين يريدون الترقية إلى VIP. اعتمد لخصم التوكنز وتفعيل المدة والمميزات.</p>}>
                <p>Players who want to upgrade to VIP. Approve to deduct the token cost and activate their VIP period + perks.</p>
              </HelpTip>
            </h2>
            <p className="text-sm text-[#86868b]">{pendingCount} pending request{pendingCount !== 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(f => {
          const count = f === 'all' ? requests.length : requests.filter(r => r.status === f).length;
          const colors: Record<string, string> = {
            pending: 'text-[#ff9500] bg-[#ff9500]/10 border-[#ff9500]/20',
            approved: 'text-[#34c759] bg-[#34c759]/10 border-[#34c759]/20',
            rejected: 'text-[#ff3b30] bg-[#ff3b30]/10 border-[#ff3b30]/20',
            all: 'text-[#0071e3] bg-[#0071e3]/10 border-[#0071e3]/20',
          };
          return (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                filter === f ? colors[f] : 'text-[#86868b] bg-[#f5f5f7] border-[#e5e5ea] hover:bg-white'
              }`}>
              {f.charAt(0).toUpperCase() + f.slice(1)} ({count})
            </button>
          );
        })}
      </div>

      {/* Requests List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-[#ff9500] animate-spin" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-20">
          <Crown size={40} className="text-[#d2d2d7] mx-auto mb-3" />
          <p className="text-[#86868b]">No {filter === 'all' ? '' : filter} VIP requests</p>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredRequests.map(req => (
              <motion.div key={req.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={`bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border ${
                  req.status === 'pending' ? 'border-[#ff9500]/20' :
                  req.status === 'approved' ? 'border-[#34c759]/20' :
                  'border-[#ff3b30]/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  {/* Left: Player info */}
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                      req.trial ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20' : 'bg-[#ff9500]/10 text-[#ff9500] border border-[#ff9500]/20'
                    }`}>
                      {req.playerName?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[#1d1d1f] font-medium">{req.playerName}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          req.trial ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20' : 'bg-[#ff9500]/10 text-[#ff9500] border border-[#ff9500]/20'
                        }`}>
                          {req.trial ? '7-DAY TRIAL' : 'PAID'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-[#86868b] flex items-center gap-1">
                          <Clock size={10} /> {formatDate(req.createdAt)}
                        </span>
                        {!req.trial && (
                          <span className="text-xs text-[#ff9500] flex items-center gap-1">
                            <Coins size={10} /> {req.price} JOD
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions or Status */}
                  <div className="flex items-center gap-2">
                    {req.status === 'pending' ? (
                      <>
                        <button onClick={() => handleDecline(req)} disabled={processing === req.id}
                          className="px-4 py-2 rounded-xl text-[#ff3b30] border border-[#d2d2d7] text-sm font-medium hover:bg-[#fff5f5] transition-colors disabled:opacity-50 flex items-center gap-1.5">
                          {processing === req.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                          Decline
                        </button>
                        <button onClick={() => handleApprove(req)} disabled={processing === req.id}
                          className="px-4 py-2 rounded-xl bg-[#34c759] text-white text-sm font-medium hover:bg-[#2db84e] transition-colors disabled:opacity-50 flex items-center gap-1.5">
                          {processing === req.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          Approve{!req.trial && ` (${req.price} JOD)`}
                        </button>
                      </>
                    ) : (
                      <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${
                        req.status === 'approved' ? 'bg-[#34c759]/10 text-[#34c759] border border-[#34c759]/20' : 'bg-[#ff3b30]/10 text-[#ff3b30] border border-[#ff3b30]/20'
                      }`}>
                        {req.status === 'approved' ? 'APPROVED' : 'DECLINED'}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* VIP Info Card */}
      <div className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
        <h3 className="text-sm font-semibold text-[#86868b] mb-3 flex items-center gap-2">
          <Shield size={14} /> VIP Perks Reference
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-[#86868b]">
          <div className="flex items-center gap-2"><span className="text-[#ff9500] font-medium">15%</span> Cafe discount</div>
          <div className="flex items-center gap-2"><span className="text-[#ff9500] font-medium">+1</span> Coin per daily task</div>
          <div className="flex items-center gap-2"><span className="text-[#ff9500] font-medium">30m</span> Daily free play invite</div>
          <div className="flex items-center gap-2"><span className="text-[#ff9500] font-medium">50</span> Daily invite coins gift</div>
          <div className="flex items-center gap-2"><Crown size={10} className="text-[#ff9500]" /> VIP badge everywhere</div>
          <div className="flex items-center gap-2"><Crown size={10} className="text-[#ff9500]" /> Exclusive skins</div>
        </div>
        <div className="mt-3 pt-3 border-t border-[#e5e5ea] text-xs text-[#86868b]">
          Trial: {VIP_CONFIG.trialDays} days free · Paid: {VIP_CONFIG.durationDays} days per renewal
        </div>
      </div>
    </div>
  );
}
