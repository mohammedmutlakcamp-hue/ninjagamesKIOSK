'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { HelpTip } from './HelpTip';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, increment } from 'firebase/firestore';
import { Coins, Check, X, Clock, User, AlertTriangle, Loader2, Package, Gamepad2, Timer } from 'lucide-react';
import { blendRate } from '@/lib/pricing';

interface TopUpRequest {
  id: string;
  playerId: string;
  playerName: string;
  packageId: string;
  coins: number;
  // Request docs are written with either `price` (TopUpScreen) or `priceJOD` (StoreTab
  // coin tab — legacy). Approval code reads whichever is present.
  price?: number;
  priceJOD?: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt?: number;
  timestamp?: number;
}

interface GuestRequest {
  id: string;
  pcName: string;
  pcDocId: string | null;
  status: 'pending' | 'approved' | 'rejected';
  timestamp: number;
  approvedMinutes?: number;
}

const GUEST_TIME_OPTIONS = [15, 30, 45, 60, 90, 120];

export function TopUpRequests() {
  const [requests, setRequests] = useState<TopUpRequest[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  // Guest requests
  const [guestRequests, setGuestRequests] = useState<GuestRequest[]>([]);
  const [guestProcessing, setGuestProcessing] = useState<string | null>(null);
  const [guestTimeSelection, setGuestTimeSelection] = useState<Record<string, number>>({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'topup-requests'), (snap) => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as TopUpRequest))
        .sort((a, b) => (b.createdAt ?? b.timestamp ?? 0) - (a.createdAt ?? a.timestamp ?? 0));
      setRequests(data);
    });
    return () => unsub();
  }, []);

  // Listen for guest requests
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'guest-requests'), (snap) => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as GuestRequest))
        .sort((a, b) => b.timestamp - a.timestamp);
      setGuestRequests(data);
    });
    return () => unsub();
  }, []);

  const approveGuest = async (req: GuestRequest) => {
    setGuestProcessing(req.id);
    const minutes = guestTimeSelection[req.id] || 30;
    await updateDoc(doc(db, 'guest-requests', req.id), {
      status: 'approved',
      approvedMinutes: minutes,
      approvedAt: Date.now(),
    });
    setGuestProcessing(null);
  };

  const rejectGuest = async (req: GuestRequest) => {
    setGuestProcessing(req.id);
    await updateDoc(doc(db, 'guest-requests', req.id), {
      status: 'rejected',
      rejectedAt: Date.now(),
    });
    setGuestProcessing(null);
  };

  const removeGuest = async (id: string) => {
    await deleteDoc(doc(db, 'guest-requests', id));
  };

  const approve = async (req: TopUpRequest) => {
    setProcessing(req.id);
    try {
      const priceJOD = req.price ?? req.priceJOD ?? 0;
      const { getDoc } = await import('firebase/firestore');
      const playerSnap = await getDoc(doc(db, 'players', req.playerId));
      if (playerSnap.exists()) {
        const data = playerSnap.data();
        const currentCoins = data.coins || 0;
        const prevRate = data.effectiveRate;
        const prevPurchased = data.coinsFromPurchases || 0;
        const { rate, coinsFromPurchases } = blendRate(prevPurchased, prevRate, req.coins, priceJOD);
        await updateDoc(doc(db, 'players', req.playerId), {
          coins: currentCoins + req.coins,
          effectiveRate: rate,
          coinsFromPurchases,
        });
      } else {
        // Fallback: increment only; rate stays at default.
        await updateDoc(doc(db, 'players', req.playerId), {
          coins: increment(req.coins),
        });
      }
      // Mark request as approved
      await updateDoc(doc(db, 'topup-requests', req.id), {
        status: 'approved',
        approvedAt: Date.now(),
      });

      // Audit log: record this in coin-transfers so the Transfers admin
      // panel shows it. Type 'admin-add' because the admin triggered it.
      try {
        const { addDoc, collection } = await import('firebase/firestore');
        await addDoc(collection(db, 'coin-transfers'), {
          senderId: 'ADMIN',
          senderName: 'Admin (top-up)',
          receiverId: req.playerId,
          receiverName: req.playerName,
          amount: req.coins,
          type: 'admin-add',
          priceJOD,
          timestamp: Date.now(),
        });
      } catch (logErr) { console.error('coin-transfer log', logErr); }

      // Customer receipt via WhatsApp (fire-and-forget). Skipped silently
      // if the player has no phone on file or WhatsApp integration is off.
      try {
        const playerSnap = await (await import('firebase/firestore')).getDoc(doc(db, 'players', req.playerId));
        const playerData = playerSnap.exists() ? (playerSnap.data() as any) : null;
        const phone = playerData?.phone || playerData?.whatsapp;
        if (phone) {
          const msg =
            `✅ *Top-up approved!*\n\n` +
            `+${req.coins.toLocaleString()} tokens added to your account\n` +
            `Paid: ${priceJOD.toFixed(2)} JOD\n\n` +
            `Your new balance is now live on the kiosk. Enjoy! 🎮`;
          fetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: phone, message: msg }),
          }).catch(() => {});
        }
      } catch { /* non-fatal */ }
    } catch (err) {
      console.error('Failed to approve:', err);
      alert('Failed to add coins: ' + (err as any)?.message);
    }
    setProcessing(null);
  };

  const reject = async (req: TopUpRequest) => {
    setProcessing(req.id);
    await updateDoc(doc(db, 'topup-requests', req.id), {
      status: 'rejected',
      rejectedAt: Date.now(),
    });
    setProcessing(null);
  };

  const remove = async (id: string) => {
    await deleteDoc(doc(db, 'topup-requests', id));
  };

  const pending = requests.filter(r => r.status === 'pending');
  const handled = requests.filter(r => r.status !== 'pending');

  const timeSince = (ts: number) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            Top Up Requests
            <HelpTip title={{ en: 'Top-Up Requests', ar: 'طلبات شحن التوكنز' }}
              ar={(
                <>
                  <p className="mb-2">قائمة بطلبات اللاعبين لشراء التوكنز. كل طلب يبيّن: اسم اللاعب، عدد التوكنز، المبلغ بالدينار، ورقم الجهاز.</p>
                  <p className="mb-1.5"><strong>المطلوب منك:</strong> اقبض المبلغ من اللاعب على الكاونتر، ثم اضغط "Approve" → التوكنز تُضاف فوراً لرصيده.</p>
                  <p className="mb-1.5"><strong>"Reject"</strong> ترفض الطلب بدون إضافة توكنز — مفيدة إذا اللاعب غيّر رأيه.</p>
                  <p className="text-[#86868b]">كل طلب جديد يرنّ كنبيوتر الأدمن وواتساب (إذا مُفعّل).</p>
                </>
              )}>
              <p className="mb-2">Queue of players who want to buy tokens. Each row: player name, tokens requested, JOD amount, PC.</p>
              <p className="mb-1.5"><strong>Your job:</strong> collect the cash at the counter, click <strong>Approve</strong> → tokens are added to their balance instantly.</p>
              <p className="mb-1.5"><strong>Reject</strong> denies without adding tokens (customer changed their mind).</p>
              <p className="text-[#86868b]">Every new request rings the admin PC + WhatsApp if enabled.</p>
            </HelpTip>
          </h2>
          <p className="text-[#86868b] text-sm">
            {pending.length} pending · {handled.length} handled
          </p>
        </div>
      </div>

      {/* Guest Requests */}
      {guestRequests.filter(r => r.status === 'pending').length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-[#af52de] mb-3 flex items-center gap-2">
            <Gamepad2 size={14} /> Guest Play Requests — {guestRequests.filter(r => r.status === 'pending').length} pending
          </h3>
          <div className="space-y-3">
            {guestRequests.filter(r => r.status === 'pending').map((req) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-5 border-2 border-[#af52de]/30 flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#af52de]/10 flex items-center justify-center border border-[#af52de]/20">
                    <Gamepad2 size={24} className="text-[#af52de]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#1d1d1f] text-base">{req.pcName || 'Unknown PC'}</span>
                    </div>
                    <span className="text-[#86868b] text-xs">{timeSince(req.timestamp)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {guestProcessing === req.id ? (
                    <Loader2 size={20} className="animate-spin text-[#86868b]" />
                  ) : (
                    <>
                      {/* Time selector */}
                      <div className="flex items-center gap-1.5">
                        <Timer size={14} className="text-[#86868b]" />
                        <select
                          value={guestTimeSelection[req.id] || 30}
                          onChange={(e) => setGuestTimeSelection(prev => ({ ...prev, [req.id]: Number(e.target.value) }))}
                          className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-2 py-1.5 text-[#1d1d1f] font-medium text-sm outline-none focus:border-[#af52de] cursor-pointer"
                        >
                          {GUEST_TIME_OPTIONS.map(m => (
                            <option key={m} value={m}>{m} min</option>
                          ))}
                        </select>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => approveGuest(req)}
                        className="px-5 py-2.5 bg-[#af52de] text-white rounded-xl font-medium flex items-center gap-2 hover:bg-[#af52de]/90 transition-all"
                      >
                        <Check size={16} /> Approve
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => rejectGuest(req)}
                        className="px-4 py-2.5 border border-[#d2d2d7] text-[#ff3b30] rounded-xl text-sm hover:bg-[#fff5f5] transition-all"
                      >
                        <X size={16} />
                      </motion.button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Requests */}
      {pending.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-[#ff9500] mb-3 flex items-center gap-2">
            <Clock size={14} /> Pending — Waiting for payment
          </h3>
          <div className="space-y-3">
            {pending.map((req) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-5 border-2 border-[#ff9500]/30 flex items-center justify-between shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#ff9500]/10 flex items-center justify-center border border-[#ff9500]/20">
                    <Coins size={24} className="text-[#ff9500]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-[#86868b]" />
                      <span className="font-semibold text-[#1d1d1f] text-base">{req.playerName?.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="font-semibold text-[#0071e3] text-lg">{req.coins.toLocaleString()} coins</span>
                      <span className="text-[#86868b] text-sm">·</span>
                      <span className="font-semibold text-[#1d1d1f] text-lg">{req.price ?? req.priceJOD} JOD</span>
                    </div>
                    <span className="text-[#86868b] text-xs">{timeSince(req.createdAt ?? req.timestamp ?? 0)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {processing === req.id ? (
                    <Loader2 size={20} className="animate-spin text-[#86868b]" />
                  ) : (
                    <>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => approve(req)}
                        className="px-5 py-2.5 bg-[#0071e3] text-white rounded-xl font-medium flex items-center gap-2 hover:bg-[#0077ED] transition-all"
                      >
                        <Check size={16} /> Approve & Add Coins
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => reject(req)}
                        className="px-4 py-2.5 border border-[#d2d2d7] text-[#ff3b30] rounded-xl text-sm hover:bg-[#fff5f5] transition-all"
                      >
                        <X size={16} />
                      </motion.button>
                    </>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <div className="text-center py-12 mb-8">
          <Coins size={48} className="text-[#d2d2d7] mx-auto mb-4" />
          <p className="text-lg font-semibold text-[#86868b]">No Pending Requests</p>
          <p className="text-[#86868b] mt-2 text-sm">Players can request top-ups from the kiosk sidebar</p>
        </div>
      )}

      {/* History */}
      {handled.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#86868b] mb-3">History</h3>
          <div className="space-y-2">
            {handled.slice(0, 20).map((req) => (
              <div key={req.id}
                className="bg-white rounded-xl px-4 py-3 flex items-center justify-between border border-[#e5e5ea]/60"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${req.status === 'approved' ? 'bg-[#34c759]' : 'bg-[#ff3b30]'}`} />
                  <span className="text-sm font-semibold text-[#1d1d1f]">{req.playerName?.toUpperCase()}</span>
                  <span className="text-[#86868b] text-xs">{req.coins} coins · {req.price ?? req.priceJOD} JOD</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium ${req.status === 'approved' ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>
                    {req.status === 'approved' ? 'APPROVED' : 'REJECTED'}
                  </span>
                  <span className="text-[#86868b] text-[10px]">{timeSince(req.createdAt ?? req.timestamp ?? 0)}</span>
                  <button onClick={() => remove(req.id)} className="text-[#d2d2d7] hover:text-[#86868b] transition-colors">
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
