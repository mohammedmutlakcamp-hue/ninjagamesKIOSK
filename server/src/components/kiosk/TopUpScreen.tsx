'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Crown, Sparkles, ArrowRight, CheckCircle2, Loader2, Pencil, X } from 'lucide-react';
import { COIN_PACKAGES } from '@/lib/constants';
import { Lang, t } from '@/lib/translations';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { notifyAdmin } from '@/lib/notify-admin';

interface Props {
  player: any;
  lang?: Lang;
  onClose?: () => void;
}

export function TopUpScreen({ player, lang = 'en', onClose }: Props) {
  const isAr = lang === 'ar';

  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playerName, setPlayerName] = useState(player?.username || '');
  const [editingName, setEditingName] = useState(false);

  const handleSelectPackage = async (pkgId: string, coins: number, price: number) => {
    if (loading || requestSent) return;
    setSelectedPkg(pkgId);
    setLoading(true);

    try {
      await addDoc(collection(db, 'topup-requests'), {
        playerId: player?.uid || '',
        playerName: playerName || player?.username || 'Unknown',
        pcName: player?.pcName || '',
        packageId: pkgId,
        coins,
        price,
        status: 'pending',
        timestamp: Date.now(),
      });
      notifyAdmin('topup', 'Top-Up Request', `${playerName || player?.username || 'Player'} wants ${coins} coins (${price} JOD)`);
      setRequestSent(true);
    } catch (err) {
      console.error('TopUp request failed:', err);
    }

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center"
      dir={isAr ? 'rtl' : 'ltr'}
      style={{ background: 'rgba(11, 12, 16, 0.97)' }}>

      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.05) 0%, transparent 70%)', animation: 'topupPulse 4s ease-in-out infinite' }} />
        <style>{`@keyframes topupPulse { 0%,100% { transform: translate(-50%,-50%) scale(1); opacity: 0.5; } 50% { transform: translate(-50%,-50%) scale(1.1); opacity: 1; } }`}</style>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 30 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 120 }}
        className="relative z-10 w-[550px] max-w-[95vw]"
      >
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="inline-block mb-4"
          >
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-ninja-green/20 to-ninja-green/5 flex items-center justify-center border border-ninja-green/20 mx-auto">
              <Coins size={40} className="text-yellow-400" />
            </div>
          </motion.div>
          <h1 className="font-ninja text-3xl text-white mb-2">{t(lang, 'topup_required')}</h1>
          <p className="font-body text-gray-400 text-sm">
            {isAr ? '' : 'Hey '}
            {editingName ? (
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onBlur={() => setEditingName(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
                autoFocus
                className="inline-block bg-white/5 border border-ninja-green/40 rounded px-2 py-0.5 text-ninja-green font-ninja text-sm outline-none focus:border-ninja-green w-40 text-center"
              />
            ) : (
              <span
                onClick={() => setEditingName(true)}
                className="text-ninja-green font-ninja cursor-pointer hover:underline underline-offset-4"
                title={isAr ? 'اضغط لتغيير الاسم' : 'Click to change name'}
              >
                {playerName?.toUpperCase() || player?.username?.toUpperCase()}
              </span>
            )}
            {isAr ? '،' : ','} {t(lang, 'topup_message')}
          </p>
          <p className="font-body text-gray-600 text-xs mt-1">{t(lang, 'topup_ask')}</p>
        </div>

        {/* Success message */}
        <AnimatePresence>
          {requestSent && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mb-5 flex items-center gap-3 px-5 py-4 rounded-2xl border"
              style={{ background: 'rgba(57,255,20,0.08)', borderColor: 'rgba(57,255,20,0.3)' }}
            >
              <CheckCircle2 size={20} className="text-ninja-green flex-shrink-0" />
              <p className="font-body text-ninja-green text-sm">
                {isAr
                  ? 'تم إرسال طلبك! اطلب من الموظفين الموافقة عليه.'
                  : 'Request sent! Ask staff to approve your top-up.'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-3 mb-6">
          {COIN_PACKAGES.map((pkg, i) => {
            const isPopular = pkg.popular;
            const isSelected = selectedPkg === pkg.id;

            return (
              <motion.div
                key={pkg.id}
                initial={{ opacity: 0, x: isAr ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                onClick={() => handleSelectPackage(pkg.id, pkg.coins, pkg.price)}
                className={`relative rounded-2xl p-5 border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-ninja-green/60 bg-ninja-green/[0.1] shadow-[0_0_24px_rgba(57,255,20,0.12)]'
                    : isPopular
                      ? 'border-ninja-green/40 bg-ninja-green/[0.06] hover:border-ninja-green/60 hover:bg-ninja-green/[0.09]'
                      : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'
                } ${loading && selectedPkg === pkg.id ? 'pointer-events-none' : ''}`}
                style={{ transform: isSelected ? 'scale(1.01)' : 'scale(1)' }}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-ninja-green text-black font-ninja text-[10px] tracking-wider flex items-center gap-1">
                    <Crown size={10} /> {t(lang, 'best_value')}
                  </div>
                )}

                {/* Selected checkmark */}
                {isSelected && !loading && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute top-3 right-3 w-6 h-6 rounded-full bg-ninja-green flex items-center justify-center"
                  >
                    <CheckCircle2 size={14} className="text-black" />
                  </motion.div>
                )}

                {/* Loading spinner */}
                {isSelected && loading && (
                  <div className="absolute top-3 right-3">
                    <Loader2 size={18} className="animate-spin text-ninja-green" />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isSelected || isPopular ? 'bg-ninja-green/20' : 'bg-white/5'}`}>
                      <Coins size={22} className={isSelected || isPopular ? 'text-yellow-400' : 'text-gray-400'} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-ninja text-xl text-white">{pkg.coins.toLocaleString()}</span>
                        <span className="font-body text-gray-500 text-sm">{t(lang, 'coins')}</span>
                      </div>
                      {(pkg.bonusPercentage || 0) > 0 && (
                        <div className="mt-0.5">
                          <span className="font-ninja text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(57,255,20,0.12)', color: '#39FF14', border: '1px solid rgba(57,255,20,0.3)' }}>+{pkg.bonusPercentage}% {isAr ? 'مكافأة' : 'BONUS'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={isAr ? 'text-left' : 'text-right'}>
                    <span className="font-ninja text-2xl text-white">{pkg.price}</span>
                    <span className="font-body text-gray-500 text-sm ml-1">JOD</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="h-px flex-1 bg-white/5" />
            <Sparkles size={14} className="text-gray-600" />
            <div className="h-px flex-1 bg-white/5" />
          </div>
          <p className="font-body text-gray-600 text-xs">
            {isAr
              ? 'استخدم التوكنز لشراء الوقت والصناديق والطعام. الخصم المجمّع يُطبَّق على الوقت فقط.'
              : 'Spend tokens on time, chests and food. Bulk bonus applies to time only — chest & food prices stay at their real value.'}
          </p>
          {!requestSent && (
            <div className="mt-4 flex items-center justify-center gap-2 text-ninja-green/50">
              <ArrowRight size={14} />
              <span className="font-body text-xs">{t(lang, 'show_front_desk')}</span>
              <ArrowRight size={14} className={isAr ? 'rotate-180' : ''} />
            </div>
          )}

          {onClose && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              onClick={onClose}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="mt-6 inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white font-body text-sm transition-all"
            >
              <X size={15} />
              {isAr ? 'إغلاق' : 'CLOSE'}
            </motion.button>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
