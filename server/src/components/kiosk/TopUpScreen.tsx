'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Sparkles, ArrowRight, CheckCircle2, Loader2, X } from 'lucide-react';
import { Lang, t } from '@/lib/translations';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { notifyAdmin } from '@/lib/notify-admin';

const TOKEN_MIN = 100;
const TOKENS_PER_JOD = 100;

interface Props {
  player: any;
  lang?: Lang;
  onClose?: () => void;
}

export function TopUpScreen({ player, lang = 'en', onClose }: Props) {
  const isAr = lang === 'ar';

  const [tokensInput, setTokensInput] = useState<string>('');
  const tokensNum = parseInt(tokensInput, 10);
  const tokensValid = !isNaN(tokensNum) && tokensNum >= TOKEN_MIN;
  const priceJOD = tokensValid ? Math.round((tokensNum / TOKENS_PER_JOD) * 100) / 100 : 0;

  const [requestSent, setRequestSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playerName, setPlayerName] = useState(player?.username || '');
  const [editingName, setEditingName] = useState(false);

  const handleSubmit = async () => {
    if (loading || requestSent || !tokensValid) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'topup-requests'), {
        playerId: player?.uid || '',
        playerName: playerName || player?.username || 'Unknown',
        pcName: player?.pcName || '',
        packageId: 'custom',
        coins: tokensNum,
        price: priceJOD,
        custom: true,
        status: 'pending',
        timestamp: Date.now(),
      });
      notifyAdmin('topup', 'Top-Up Request', `${playerName || player?.username || 'Player'} wants ${tokensNum} coins (${priceJOD} JOD)`);
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

        <div className="mb-6">
          <div
            className="relative rounded-2xl p-6 border"
            style={{
              background: 'rgba(57,255,20,0.04)',
              borderColor: tokensValid ? 'rgba(57,255,20,0.5)' : 'rgba(255,255,255,0.08)',
              boxShadow: tokensValid ? '0 0 24px rgba(57,255,20,0.12)' : 'none',
            }}
          >
            <label className="block font-ninja text-xs tracking-wider text-gray-400 mb-3">
              {isAr ? 'كم توكنز تريد؟' : 'HOW MANY TOKENS?'}
            </label>
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <input
                  type="number"
                  min={TOKEN_MIN}
                  step={50}
                  inputMode="numeric"
                  value={tokensInput}
                  onChange={(e) => setTokensInput(e.target.value)}
                  placeholder={isAr ? 'أدخل التوكنز' : 'Enter tokens'}
                  disabled={requestSent}
                  className="w-full bg-white/5 border border-ninja-green/30 rounded-xl px-4 py-3 font-ninja text-2xl text-white outline-none focus:border-ninja-green placeholder:text-gray-600 disabled:opacity-50"
                />
                <Coins size={18} className={`absolute ${isAr ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-yellow-400/70 pointer-events-none`} />
              </div>
              <div className={isAr ? 'text-left' : 'text-right'}>
                <div className="font-ninja text-3xl text-white leading-none">
                  {tokensValid ? priceJOD.toFixed(2) : '—'}
                </div>
                <div className="font-body text-xs text-gray-500 mt-0.5">JOD</div>
              </div>
            </div>
            <p className="font-body text-[11px] text-gray-500 mt-3">
              {isAr ? `الحد الأدنى ${TOKEN_MIN} · ${TOKENS_PER_JOD} توكنز = 1 دينار` : `Min ${TOKEN_MIN} · ${TOKENS_PER_JOD} tokens = 1 JOD`}
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!tokensValid || loading || requestSent}
            className={`mt-4 w-full py-4 rounded-xl font-ninja text-lg tracking-wider flex items-center justify-center gap-3 transition-all ${
              !tokensValid || loading || requestSent ? 'opacity-40 pointer-events-none' : ''
            }`}
            style={{
              background: tokensValid ? 'linear-gradient(135deg, #39FF14, #00e676)' : 'rgba(57,255,20,0.15)',
              color: tokensValid ? '#000' : 'rgba(57,255,20,0.4)',
              boxShadow: tokensValid ? '0 0 20px rgba(57,255,20,0.3)' : 'none',
            }}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            {loading ? (isAr ? 'جارٍ الإرسال…' : 'SENDING…') : (isAr ? 'طلب الشحن' : 'REQUEST TOP-UP')}
          </button>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="h-px flex-1 bg-white/5" />
            <Sparkles size={14} className="text-gray-600" />
            <div className="h-px flex-1 bg-white/5" />
          </div>
          <p className="font-body text-gray-600 text-xs">
            {isAr
              ? 'استخدم التوكنز لشراء الوقت والصناديق والطعام.'
              : 'Spend tokens on time, chests and food.'}
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
