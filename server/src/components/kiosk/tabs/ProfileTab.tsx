'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { doc, updateDoc, increment, collection, query, where, getDocs, addDoc, orderBy, limit as fbLimit, onSnapshot, arrayUnion } from 'firebase/firestore';
import {
  Clock, Gift, MessageSquare,
  Gamepad2, Award, User, Volume2, VolumeX,
  Send, Search, Coins, AlertTriangle, CheckCircle2, X,
  Loader2, Settings, Lock, Shield,
  Eye, EyeOff, Pencil, Flag, Link2, Share2, Copy,
  UserPlus, Camera
} from 'lucide-react';
import { NinjaInput } from '@/components/kiosk/NinjaInput';
import { calculateTotalXP, getLevelInfo } from '@/lib/xp';
import { NINJA_SKINS, RARITY_COLORS, TIER_BORDER_COLORS, COUNTRY_FLAGS, USERNAME_CHANGE_COST, REFERRAL_CONFIG } from '@/lib/constants';
import { trackDailyTask } from '@/lib/daily-tasks';

interface Props {
  player: any;
}

const TIER_ORDER = ['free', 'rare', 'epic', 'legendary', 'mythic'] as const;

export function ProfileTab({ player }: Props) {
  const lang: 'en' | 'ar' = typeof window !== 'undefined' ? ((localStorage.getItem('kiosk-lang') as 'en' | 'ar') || 'en') : 'en';
  const ar = lang === 'ar';
  // --- State ---
  const [showSendCoins, setShowSendCoins] = useState(false);
  const [sendUsername, setSendUsername] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendError, setSendError] = useState('');
  const [sendSuccess, setSendSuccess] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [foundPlayer, setFoundPlayer] = useState<any>(null);

  const [isAppearOffline, setIsAppearOffline] = useState(player.onlineStatus?.appearOffline || false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(player.username || '');
  const [usernamePin, setUsernamePin] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);

  const [changingPin, setChangingPin] = useState(false);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSaving, setPinSaving] = useState(false);

  const [soundEnabled, setSoundEnabled] = useState(true);

  // Bio
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState(player.bio || '');
  const [bioSaving, setBioSaving] = useState(false);

  // Social links
  const [editingSocials, setEditingSocials] = useState(false);
  const [socialLinks, setSocialLinks] = useState(player.socialLinks || {});

  // Profile comments
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentSaving, setCommentSaving] = useState(false);

  // Privacy
  const [privacySettings, setPrivacySettings] = useState(player.privacySettings || { inventoryVisibility: 'public', profileVisibility: 'public' });

  // Country
  const [selectedCountry, setSelectedCountry] = useState(player.country || '');
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // Profile photo upload
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Referral
  const [referralCopied, setReferralCopied] = useState(false);

  const skinStripRef = useRef<HTMLDivElement>(null);

  // --- Derived data ---
  const stats = player.stats || {};
  const totalXP = calculateTotalXP(player);
  const levelInfo = getLevelInfo(totalXP);

  const currentSkin = useMemo(() =>
    NINJA_SKINS.find(s => s.id === player.ninjaType) || NINJA_SKINS[0],
    [player.ninjaType]
  );

  const ownedNinjaIds: string[] = player.ownedNinjas || NINJA_SKINS.filter(s => s.tier === 'free').map(s => s.id);

  const ownedSkins = useMemo(() =>
    NINJA_SKINS.filter(s => ownedNinjaIds.includes(s.id)),
    [ownedNinjaIds]
  );

  const ninjaColor = currentSkin.color === '#1a1a2e' || currentSkin.color === '#000000'
    ? '#6366f1' // use indigo for very dark colors
    : currentSkin.color;

  // --- Handlers ---
  const toggleOnlineStatus = async () => {
    const newOffline = !isAppearOffline;
    setIsAppearOffline(newOffline);
    try {
      await updateDoc(doc(db, 'players', player.uid), {
        'onlineStatus.isOnline': !newOffline,
        'onlineStatus.appearOffline': newOffline,
      });
    } catch {
      setIsAppearOffline(!newOffline);
    }
  };


  const handleChangePin = async () => {
    if (!oldPin || oldPin !== String(player.pin)) {
      setPinError(ar ? 'الرقم السري الحالي غير صحيح' : 'Current PIN is incorrect');
      return;
    }
    if (!newPin || newPin.length < 6) {
      setPinError(ar ? 'يجب أن يكون الرقم السري الجديد 6 أرقام على الأقل' : 'New PIN must be at least 6 digits');
      return;
    }
    setPinSaving(true);
    setPinError('');
    try {
      await updateDoc(doc(db, 'players', player.uid), { pin: newPin });
      setChangingPin(false);
      setOldPin('');
      setNewPin('');
    } catch {
      setPinError(ar ? 'فشل تحديث الرقم السري' : 'Failed to update PIN');
    }
    setPinSaving(false);
  };

  const changeAvatar = async (ninjaId: string) => {
    if (ninjaId === player.ninjaType) return;
    try {
      await updateDoc(doc(db, 'players', player.uid), { ninjaType: ninjaId });
    } catch {
      // silently fail
    }
  };

  const searchPlayer = async () => {
    if (!sendUsername.trim()) return;
    setSendError('');
    setFoundPlayer(null);
    try {
      const q = query(collection(db, 'players'), where('username', '==', sendUsername.toLowerCase().trim()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setSendError(ar ? 'لم يتم العثور على اللاعب' : 'Player not found');
        return;
      }
      const p = snap.docs[0];
      if (p.id === player.uid) {
        setSendError(ar ? 'لا يمكنك إرسال توكنز لنفسك' : "You can't send tokens to yourself");
        return;
      }
      setFoundPlayer({ uid: p.id, ...p.data() });
    } catch {
      setSendError(ar ? 'فشل البحث' : 'Search failed');
    }
  };

  const sendCoins = async () => {
    const amount = parseInt(sendAmount);
    if (!amount || amount <= 0) { setSendError(ar ? 'أدخل مبلغاً صالحاً' : 'Enter a valid amount'); return; }
    if (Math.ceil(amount * 1.1) > (player.coins || 0)) { setSendError(ar ? 'توكنز غير كافية (تشمل 10% رسوم)' : 'Not enough tokens (includes 10% fee)'); return; }
    if (!foundPlayer) { setSendError(ar ? 'ابحث عن لاعب أولاً' : 'Search for a player first'); return; }

    setSendLoading(true);
    try {
      const fee = Math.ceil(amount * 0.1);
      await updateDoc(doc(db, 'players', player.uid), { coins: increment(-(amount + fee)) });
      await updateDoc(doc(db, 'players', foundPlayer.uid), { coins: increment(amount) });
      setSendSuccess(ar ? `تم إرسال ${amount} توكنز إلى ${foundPlayer.username.toUpperCase()} (${fee} رسوم)` : `Sent ${amount} tokens to ${foundPlayer.username.toUpperCase()} (${fee} fee burned)`);
      setSendAmount('');
      setFoundPlayer(null);
      setSendUsername('');
      trackDailyTask(player.uid, 'send_coins').catch(() => {});
      setTimeout(() => { setSendSuccess(''); setShowSendCoins(false); }, 2000);
    } catch {
      setSendError(ar ? 'فشل التحويل' : 'Transfer failed');
    }
    setSendLoading(false);
  };

  // --- Quick stats for hero (no kills/wins/KD/chests) ---
  const inventoryCount = (player.inventory || []).filter((i: any) => !i.used).length;
  const skinsOwned = (player.ownedNinjas || []).length;
  const friendsCount = (player.friends || []).length;

  const quickStats = [
    { label: ar ? 'وقت اللعب' : 'Playtime', value: `${Math.floor((player.totalPlaytime || 0) / 60)}h`, icon: <Clock size={16} /> },
    { label: ar ? 'الألعاب' : 'Games', value: stats.gamesPlayed || 0, icon: <Gamepad2 size={16} /> },
    { label: ar ? 'المخزون' : 'Inventory', value: inventoryCount, icon: <Gift size={16} /> },
    { label: ar ? 'السكنز' : 'Skins', value: skinsOwned, icon: <Award size={16} /> },
    { label: ar ? 'الأصدقاء' : 'Friends', value: friendsCount, icon: <MessageSquare size={16} /> },
    { label: ar ? 'توكنز مصروفة' : 'Tokens Spent', value: (player.totalCoinsSpent || 0).toLocaleString(), icon: <Coins size={16} /> },
  ];

  // --- Load profile comments ---
  useEffect(() => {
    if (!player?.uid) return;
    const q = query(
      collection(db, 'profile-comments'),
      where('profileId', '==', player.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
      setComments(docs.slice(0, 20));
    }, (err) => { console.error('Comments query failed:', err); });
    return () => unsub();
  }, [player?.uid]);

  // --- Generate referral code if missing ---
  useEffect(() => {
    if (player?.uid && !player.referralCode) {
      const code = player.username?.toUpperCase().slice(0, 4) + player.uid.slice(0, 4).toUpperCase();
      updateDoc(doc(db, 'players', player.uid), { referralCode: code }).catch(() => {});
    }
  }, [player?.uid]);

  // --- Handlers for new features ---
  const saveBio = async () => {
    setBioSaving(true);
    try {
      await updateDoc(doc(db, 'players', player.uid), { bio: bioText.slice(0, 200) });
      setEditingBio(false);
    } catch { }
    setBioSaving(false);
  };

  const saveSocialLinks = async () => {
    try {
      await updateDoc(doc(db, 'players', player.uid), { socialLinks });
      setEditingSocials(false);
    } catch { }
  };

  const postComment = async () => {
    if (!commentText.trim() || commentSaving) return;
    setCommentSaving(true);
    try {
      await addDoc(collection(db, 'profile-comments'), {
        profileId: player.uid,
        fromId: player.uid,
        fromName: player.username,
        fromNinjaType: player.ninjaType,
        text: commentText.trim().slice(0, 300),
        createdAt: Date.now(),
      });
      setCommentText('');
    } catch { }
    setCommentSaving(false);
  };

  const updatePrivacy = async (key: string, value: string) => {
    const updated = { ...privacySettings, [key]: value };
    setPrivacySettings(updated);
    try {
      await updateDoc(doc(db, 'players', player.uid), { privacySettings: updated });
    } catch { }
  };

  const selectCountry = async (countryId: string) => {
    setSelectedCountry(countryId);
    setShowCountryPicker(false);
    try {
      await updateDoc(doc(db, 'players', player.uid), { country: countryId });
    } catch { }
  };

  const copyReferral = () => {
    navigator.clipboard.writeText(player.referralCode || '');
    setReferralCopied(true);
    setTimeout(() => setReferralCopied(false), 2000);
  };

  const usernameChangesUsed = player.usernameChanges || 0;
  const usernameChangeCost = usernameChangesUsed < 2 ? 0 : USERNAME_CHANGE_COST;

  const handleChangeUsernameWithCost = async () => {
    const trimmed = newUsername.trim().toLowerCase();
    if (!trimmed) { setUsernameError(ar ? 'اسم المستخدم لا يمكن أن يكون فارغاً' : 'Username cannot be empty'); return; }
    if (trimmed === player.username) { setEditingUsername(false); return; }
    if (!usernamePin || usernamePin !== String(player.pin)) {
      setUsernameError(ar ? 'رقم سري خاطئ' : 'Incorrect PIN');
      return;
    }
    if (usernameChangeCost > 0 && (player.coins || 0) < usernameChangeCost) {
      setUsernameError(ar ? `تحتاج ${usernameChangeCost} عملات لتغيير اسم المستخدم` : `Need ${usernameChangeCost} coins to change username`);
      return;
    }
    setUsernameSaving(true);
    setUsernameError('');
    try {
      const q2 = query(collection(db, 'players'), where('username', '==', trimmed));
      const snap = await getDocs(q2);
      if (!snap.empty) {
        setUsernameError(ar ? 'اسم المستخدم مستخدم بالفعل' : 'Username is already taken');
        setUsernameSaving(false);
        return;
      }
      const updateData: any = {
        username: trimmed,
        usernameChanges: increment(1),
        usernameHistory: arrayUnion({ oldName: player.username, newName: trimmed, changedAt: Date.now() }),
      };
      if (usernameChangeCost > 0) updateData.coins = increment(-usernameChangeCost);
      await updateDoc(doc(db, 'players', player.uid), updateData);
      setEditingUsername(false);
      setUsernamePin('');
    } catch {
      setUsernameError(ar ? 'فشل تحديث اسم المستخدم' : 'Failed to update username');
    }
    setUsernameSaving(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !player?.uid) return;
    if (file.size > 5 * 1024 * 1024) return; // 5MB max
    setUploadingPhoto(true);
    try {
      // Resize and compress to keep Firestore doc small
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new window.Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const size = 200;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d')!;
            // Crop to square center
            const min = Math.min(img.width, img.height);
            const sx = (img.width - min) / 2;
            const sy = (img.height - min) / 2;
            ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          };
          img.src = reader.result as string;
        };
        reader.readAsDataURL(file);
      });
      await updateDoc(doc(db, 'players', player.uid), { profilePhoto: dataUrl });
    } catch (err) {
      console.error('Photo upload failed:', err);
    }
    setUploadingPhoto(false);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  const playerCountryFlag = COUNTRY_FLAGS.find(c => c.id === (player.country || selectedCountry));

  const tierLabel = currentSkin.tier.toUpperCase();
  const tierColor = TIER_BORDER_COLORS[currentSkin.tier] || '#fff';
  const rarityKey = currentSkin.tier === 'free' ? 'common' : currentSkin.tier;
  const rarityInfo = RARITY_COLORS[rarityKey as keyof typeof RARITY_COLORS] || RARITY_COLORS.common;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="relative h-full overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #030508 0%, #04070e 20%, #050a14 50%, #04070e 80%, #030508 100%)' }}>
      {/* ═══ Background HUD layers ═══ */}
      <div className="absolute inset-0 pointer-events-none z-0 pcb-grid-fade" style={{
        backgroundImage: 'linear-gradient(rgba(0,200,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,200,255,0.04) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />
      <div className="absolute inset-0 pointer-events-none z-0 sidebar-hex-pattern" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='52' viewBox='0 0 60 52' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill='none' stroke='%2300c8ff' stroke-width='0.5' opacity='0.04'/%3E%3C/svg%3E")`,
        backgroundSize: '60px 52px',
      }} />
      <div className="absolute inset-0 pointer-events-none z-0" style={{
        background: 'radial-gradient(ellipse at 15% 10%, rgba(0,200,255,0.08) 0%, transparent 35%), radial-gradient(ellipse at 85% 90%, rgba(57,255,20,0.06) 0%, transparent 35%), radial-gradient(ellipse at 50% 50%, rgba(168,85,247,0.03) 0%, transparent 45%)',
      }} />
      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.4), rgba(57,255,20,0.25), transparent)', boxShadow: '0 0 12px rgba(0,200,255,0.18)' }} />
      <div className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none z-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,200,255,0.18), rgba(57,255,20,0.12), transparent)' }} />
      <div className="absolute top-0 left-0 bottom-0 w-[1px] pointer-events-none z-0" style={{ background: 'linear-gradient(180deg, rgba(0,200,255,0.22), rgba(57,255,20,0.1), transparent)' }} />
      <div className="absolute top-0 right-0 bottom-0 w-[1px] pointer-events-none z-0" style={{ background: 'linear-gradient(180deg, rgba(57,255,20,0.18), rgba(0,200,255,0.1), transparent)' }} />
      <div className="absolute left-[10%] top-[25%] w-3 h-3 rounded-full pointer-events-none z-0 sidebar-energy-orb" style={{ background: 'radial-gradient(circle, rgba(0,200,255,0.5) 0%, transparent 70%)', boxShadow: '0 0 12px rgba(0,200,255,0.3)' }} />
      <div className="absolute right-[15%] top-[60%] w-2.5 h-2.5 rounded-full pointer-events-none z-0 sidebar-energy-orb2" style={{ background: 'radial-gradient(circle, rgba(57,255,20,0.4) 0%, transparent 70%)', boxShadow: '0 0 10px rgba(57,255,20,0.25)' }} />
      <div className="absolute left-[50%] top-[80%] w-2 h-2 rounded-full pointer-events-none z-0 sidebar-energy-orb3" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.4) 0%, transparent 70%)', boxShadow: '0 0 8px rgba(168,85,247,0.2)' }} />

      <div className="relative z-10 px-5 py-3 h-full overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col">

      {/* ============================================================ */}
      {/* HERO BANNER — Cyberpunk HUD                                  */}
      {/* ============================================================ */}
      <div
        className="relative rounded-2xl overflow-hidden mb-3 flex-shrink-0"
        style={{
          background: `linear-gradient(135deg, ${ninjaColor}15 0%, ${ninjaColor}05 30%, rgba(8,10,16,0.95) 60%, rgba(6,8,12,0.98) 100%)`,
          border: `2px solid ${ninjaColor}30`,
          boxShadow: `0 0 30px ${ninjaColor}08, inset 0 0 30px ${ninjaColor}05`,
        }}
      >
        {/* HUD corner brackets */}
        <div className="absolute top-0 left-0 w-6 h-6 z-20" style={{ borderTop: `2px solid ${ninjaColor}`, borderLeft: `2px solid ${ninjaColor}` }} />
        <div className="absolute top-0 right-0 w-6 h-6 z-20" style={{ borderTop: `2px solid ${ninjaColor}`, borderRight: `2px solid ${ninjaColor}` }} />
        <div className="absolute bottom-0 left-0 w-6 h-6 z-20" style={{ borderBottom: `2px solid ${ninjaColor}`, borderLeft: `2px solid ${ninjaColor}` }} />
        <div className="absolute bottom-0 right-0 w-6 h-6 z-20" style={{ borderBottom: `2px solid ${ninjaColor}`, borderRight: `2px solid ${ninjaColor}` }} />
        {/* Top accent line */}
        <div className="absolute top-0 left-6 right-6 h-[2px] z-20" style={{ background: `linear-gradient(90deg, transparent, ${ninjaColor}60, transparent)` }} />
        {/* Decorative glow */}
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full blur-[100px] opacity-15 pointer-events-none" style={{ background: ninjaColor }} />
        {/* PCB traces */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-60" viewBox="0 0 800 300" preserveAspectRatio="none">
          <path d="M0,50 L100,50 L120,30 L300,30" stroke={ninjaColor} strokeWidth="0.5" fill="none" opacity="0.08" />
          <path d="M800,80 L700,80 L680,100 L500,100" stroke="#00c8ff" strokeWidth="0.4" fill="none" opacity="0.05" />
          <path d="M0,200 L150,200 L170,180 L400,180" stroke={ninjaColor} strokeWidth="0.4" fill="none" opacity="0.05" />
          <circle cx="300" cy="30" r="2" fill={ninjaColor} opacity="0.08" className="pcb-node-flash" />
          <circle cx="500" cy="100" r="2" fill="#00c8ff" opacity="0.06" className="pcb-node-flash2" />
        </svg>

        <div className="relative z-10 p-5 flex items-start gap-6">
          {/* Avatar + Upload */}
          <div className="flex flex-col items-center flex-shrink-0 gap-2">
            <div className="relative">
              {/* Octagonal sci-fi frame */}
              <div className="w-[130px] h-[130px] relative">
                <motion.div className="absolute inset-0"
                  style={{
                    clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
                    background: `linear-gradient(135deg, rgba(150,150,150,0.4), ${ninjaColor}60, rgba(150,150,150,0.4))`,
                  }}
                  animate={{ boxShadow: [`0 0 20px ${ninjaColor}30`, `0 0 40px ${ninjaColor}50`, `0 0 20px ${ninjaColor}30`] }}
                  transition={{ duration: 3, repeat: Infinity }} />
                <div className="absolute inset-[3px] overflow-hidden"
                  style={{ clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)', background: '#0a0a0a' }}>
                  {player.profilePhoto ? (
                    <img src={player.profilePhoto} alt="avatar" className="w-full h-full object-cover" />
                  ) : player.ninjaType ? (
                    <img src={`/img/pfp-${player.ninjaType}.png`} alt="avatar" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><User size={48} style={{ color: ninjaColor }} /></div>
                  )}
                </div>
              </div>
              {/* Level shield badge */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-10">
                <div className="w-10 h-11 flex items-center justify-center"
                  style={{
                    background: `linear-gradient(180deg, ${levelInfo.color}, ${levelInfo.color}AA)`,
                    clipPath: 'polygon(50% 0%, 100% 15%, 100% 70%, 50% 100%, 0% 70%, 0% 15%)',
                    boxShadow: `0 2px 10px ${levelInfo.color}60`,
                  }}>
                  <span className="font-ninja text-[13px] text-black font-bold mt-0.5">{levelInfo.level}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-body transition-all border border-white/10 hover:border-ninja-green/30 text-gray-400 hover:text-ninja-green"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              {uploadingPhoto ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />}
              {uploadingPhoto ? (ar ? 'جاري الرفع...' : 'Uploading...') : (ar ? 'تغيير الصورة' : 'Change Photo')}
            </button>
            <input ref={photoInputRef} type="file" accept="image/*,.webp,.avif,.svg,.heic,.heif" onChange={handlePhotoUpload} className="hidden" />
          </div>

          {/* Player info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              {playerCountryFlag && (
                <span className="text-3xl" title={playerCountryFlag.name}>{playerCountryFlag.flag}</span>
              )}
              <h1
                className="font-ninja text-4xl tracking-wide truncate"
                style={{ color: ninjaColor, textShadow: `0 0 30px ${ninjaColor}50` }}
              >
                {player.username?.toUpperCase()}
              </h1>
              {player.vip?.active && (
                <span className="px-2 py-0.5 rounded font-ninja text-[10px] uppercase tracking-wider bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">
                  VIP
                </span>
              )}
              {currentSkin.tier !== 'free' && (
                <span
                  className="px-2 py-0.5 rounded font-ninja text-[10px] uppercase tracking-wider"
                  style={{
                    background: `${rarityInfo.bg}30`,
                    color: rarityInfo.bg,
                    border: `1px solid ${rarityInfo.bg}50`,
                  }}
                >
                  {tierLabel}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mb-2">
              <Award size={14} className="text-yellow-400" />
              <span className="font-body text-sm text-gray-300">
                {player.activeTitle || levelInfo.title}
              </span>
            </div>

            {/* Bio */}
            {player.bio && (
              <p className="font-body text-sm text-gray-400 mb-3 max-w-lg italic">&ldquo;{player.bio}&rdquo;</p>
            )}

            {/* XP Progress bar */}
            <div className="mb-4 max-w-md">
              <div className="flex items-center justify-between mb-1">
                <span className="font-body text-[11px] text-gray-400">
                  {levelInfo.currentXP.toLocaleString()} / {levelInfo.xpForNext.toLocaleString()} XP
                </span>
                <span className="font-body text-[11px]" style={{ color: levelInfo.color }}>
                  {Math.round(levelInfo.progress * 100)}%
                </span>
              </div>
              <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden border border-white/5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${levelInfo.progress * 100}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${levelInfo.color}80, ${levelInfo.color})`,
                    boxShadow: `0 0 10px ${levelInfo.color}60`,
                  }}
                />
              </div>
            </div>

            {/* Quick stats row */}
            <div className="flex gap-4 flex-wrap">
              {quickStats.map(stat => (
                <div key={stat.label} className="flex items-center gap-1.5">
                  <div style={{ color: ninjaColor }} className="opacity-70">{stat.icon}</div>
                  <span className="font-ninja text-sm text-white">{stat.value}</span>
                  <span className="font-body text-[10px] text-gray-500 uppercase">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right side - Coins & Send — HUD styled */}
          <div className="flex flex-col items-end gap-3 flex-shrink-0">
            <div className="relative rounded-lg px-4 py-2.5 flex items-center gap-2"
              style={{ background: 'rgba(234,179,8,0.06)', border: '2px solid rgba(234,179,8,0.25)' }}>
              <div className="absolute top-0 left-0 w-3 h-3" style={{ borderTop: '2px solid #eab308', borderLeft: '2px solid #eab308' }} />
              <div className="absolute bottom-0 right-0 w-3 h-3" style={{ borderBottom: '2px solid #eab308', borderRight: '2px solid #eab308' }} />
              <Coins size={18} className="text-yellow-400" style={{ filter: 'drop-shadow(0 0 4px rgba(234,179,8,0.5))' }} />
              <span className="font-ninja text-xl text-yellow-400" style={{ textShadow: '0 0 8px rgba(234,179,8,0.3)' }}>{Math.floor(player.coins || 0)}</span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: '0 0 15px rgba(234,179,8,0.3)' }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowSendCoins(true)}
              className="px-4 py-2 rounded-lg font-ninja text-sm flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg, #d4a017, #eab308)', color: '#000', boxShadow: '0 0 10px rgba(234,179,8,0.2)' }}
            >
              <Send size={14} /> {ar ? 'إرسال توكنز' : 'Send Coins'}
            </motion.button>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* MIDDLE SECTION - THREE COLUMNS                               */}
      {/* ============================================================ */}
      <div className="grid grid-cols-[1fr_260px_260px] gap-3 flex-1 min-h-0 relative z-10">

        {/* ======== LEFT COLUMN - NINJA SKIN SELECTOR ======== */}
        <div
          className="relative rounded-2xl overflow-hidden overflow-y-auto"
          style={{
            background: 'linear-gradient(135deg, rgba(8,10,16,0.95), rgba(6,8,12,0.98))',
            border: '2px solid rgba(57,255,20,0.15)',
          }}
        >
          {/* HUD corners */}
          <div className="absolute top-0 left-0 w-5 h-5 z-10" style={{ borderTop: '2px solid #39FF14', borderLeft: '2px solid #39FF14' }} />
          <div className="absolute top-0 right-0 w-5 h-5 z-10" style={{ borderTop: '2px solid #00c8ff', borderRight: '2px solid #00c8ff' }} />
          <div className="absolute bottom-0 left-0 w-5 h-5 z-10" style={{ borderBottom: '2px solid #00c8ff', borderLeft: '2px solid #00c8ff' }} />
          <div className="absolute bottom-0 right-0 w-5 h-5 z-10" style={{ borderBottom: '2px solid #39FF14', borderRight: '2px solid #39FF14' }} />
          <div className="p-4">
            <p className="font-ninja text-xs text-white mb-3 flex items-center gap-2">
              <Shield size={14} style={{ color: ninjaColor }} /> {ar ? 'النينجا الخاصة بك' : 'YOUR NINJAS'} <span className="font-body text-[10px] text-gray-500">({ownedSkins.length})</span>
            </p>
            <div className="grid grid-cols-7 gap-2">
              {ownedSkins.map(skin => {
                const isEquipped = skin.id === player.ninjaType;
                const skinTierColor = TIER_BORDER_COLORS[skin.tier] || '#fff';
                const skinRarityKey = skin.tier === 'free' ? 'common' : skin.tier;
                const skinRarity = RARITY_COLORS[skinRarityKey as keyof typeof RARITY_COLORS] || RARITY_COLORS.common;
                return (
                  <motion.div
                    key={skin.id}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.93 }}
                    onClick={() => changeAvatar(skin.id)}
                    className="cursor-pointer rounded-lg p-1.5 transition-all relative group"
                    style={{
                      border: isEquipped ? `2px solid ${skinTierColor}` : '1px solid rgba(255,255,255,0.06)',
                      background: isEquipped ? `${skinTierColor}12` : 'rgba(0,0,0,0.3)',
                      boxShadow: isEquipped ? `0 0 12px ${skinTierColor}25` : 'none',
                    }}
                  >
                    <div className="aspect-square rounded overflow-hidden bg-black/40">
                      <img src={`/img/pfp-${skin.id}.png`} alt={skin.name} className="w-full h-full object-contain" />
                    </div>
                    <p className="font-body text-[8px] text-center truncate mt-1" style={{ color: skin.color === '#1a1a2e' || skin.color === '#000000' ? '#6366f1' : skin.color }}>
                      {skin.name}
                    </p>
                    {skin.tier !== 'free' && (
                      <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full" style={{ background: skinRarity.bg, boxShadow: `0 0 4px ${skinRarity.glow}` }} />
                    )}
                    {isEquipped && (
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 px-1 rounded font-ninja text-[6px]" style={{ background: skinTierColor, color: '#000' }}>ON</div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ======== MIDDLE COLUMN - SETTINGS ======== */}
        <div
          className="relative rounded-2xl overflow-hidden overflow-y-auto"
          style={{
            background: 'linear-gradient(180deg, rgba(8,10,16,0.95), rgba(6,8,12,0.98))',
            border: '2px solid rgba(0,200,255,0.15)',
            scrollbarWidth: 'thin', scrollbarColor: '#333 transparent',
          }}
        >
          {/* HUD corners */}
          <div className="absolute top-0 left-0 w-5 h-5 z-10" style={{ borderTop: '2px solid #00c8ff', borderLeft: '2px solid #00c8ff' }} />
          <div className="absolute top-0 right-0 w-5 h-5 z-10" style={{ borderTop: '2px solid #39FF14', borderRight: '2px solid #39FF14' }} />
          <div className="absolute bottom-0 left-0 w-5 h-5 z-10" style={{ borderBottom: '2px solid #39FF14', borderLeft: '2px solid #39FF14' }} />
          <div className="absolute bottom-0 right-0 w-5 h-5 z-10" style={{ borderBottom: '2px solid #00c8ff', borderRight: '2px solid #00c8ff' }} />
          {/* Top accent */}
          <div className="absolute top-0 left-5 right-5 h-[2px] z-10" style={{ background: 'linear-gradient(90deg, rgba(0,200,255,0.3), rgba(57,255,20,0.2), rgba(0,200,255,0.3))' }} />
          <div className="p-5">
            <h3 className="font-ninja text-lg text-white mb-4 flex items-center gap-2">
              <Settings size={18} style={{ color: ninjaColor }} /> {ar ? 'الإعدادات' : 'SETTINGS'}
            </h3>

            {/* Online Status Toggle */}
            <SettingRow
              label={isAppearOffline ? (ar ? 'ظهور كغير متصل' : 'Appear Offline') : (ar ? 'متصل' : 'Online')}
              icon={
                <div className={`w-2.5 h-2.5 rounded-full ${isAppearOffline ? 'bg-gray-500' : 'bg-green-500'}`}
                  style={!isAppearOffline ? { boxShadow: '0 0 8px rgba(34,197,94,0.5)' } : {}}
                />
              }
            >
              <ToggleSwitch active={!isAppearOffline} onToggle={toggleOnlineStatus} color={ninjaColor} />
            </SettingRow>

            {/* Sound Toggle */}
            <SettingRow
              label={soundEnabled ? (ar ? 'الصوت مفعل' : 'Sound On') : (ar ? 'الصوت مكتوم' : 'Sound Off')}
              icon={soundEnabled ? <Volume2 size={14} style={{ color: ninjaColor }} /> : <VolumeX size={14} className="text-gray-500" />}
            >
              <ToggleSwitch active={soundEnabled} onToggle={() => setSoundEnabled(!soundEnabled)} color={ninjaColor} />
            </SettingRow>

            {/* Change Username */}
            <div className="py-3 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User size={14} style={{ color: ninjaColor }} />
                  <div>
                    <p className="font-body text-[10px] text-gray-500 uppercase">{ar ? 'اسم المستخدم' : 'Username'}</p>
                    <p className="font-ninja text-sm text-white">{player.username?.toUpperCase()}</p>
                  </div>
                </div>
                {!editingUsername && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setEditingUsername(true); setNewUsername(player.username || ''); setUsernameError(''); setUsernamePin(''); }}
                    className="ninja-btn ninja-btn-ghost ninja-btn-sm flex items-center gap-1 text-xs"
                  >
                    <Pencil size={12} /> {ar ? 'تعديل' : 'Edit'} {usernameChangeCost > 0 ? <>({usernameChangeCost} <Coins size={10} className="inline text-yellow-400" />)</> : <>({ar ? `مجاني — ${2 - usernameChangesUsed} متبقي` : `Free — ${2 - usernameChangesUsed} left`})</>}
                  </motion.button>
                )}
              </div>
              <AnimatePresence>
                {editingUsername && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 space-y-2 overflow-hidden"
                  >
                    <NinjaInput
                      type="text"
                      icon={<User size={14} />}
                      value={newUsername}
                      onChange={(e) => { setNewUsername(e.target.value); setUsernameError(''); }}
                      placeholder={ar ? 'اسم المستخدم الجديد' : 'New username'}
                    />
                    <NinjaInput
                      type="password"
                      icon={<Lock size={14} />}
                      value={usernamePin}
                      onChange={(e) => { setUsernamePin(e.target.value); setUsernameError(''); }}
                      placeholder={ar ? 'أدخل الرقم السري للتأكيد' : 'Enter PIN to confirm'}
                      maxLength={6}
                    />
                    {usernameError && (
                      <p className="text-red-400 font-body text-xs flex items-center gap-1">
                        <AlertTriangle size={12} /> {usernameError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleChangeUsernameWithCost}
                        disabled={usernameSaving}
                        className="ninja-btn ninja-btn-green ninja-btn-sm flex-1 flex items-center justify-center gap-1"
                      >
                        {usernameSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        {usernameSaving ? (ar ? 'جاري الحفظ...' : 'Saving...') : (ar ? 'حفظ' : 'Save')}
                      </motion.button>
                      <button
                        onClick={() => { setEditingUsername(false); setUsernameError(''); setUsernamePin(''); }}
                        className="ninja-btn ninja-btn-ghost ninja-btn-sm"
                      >
                        {ar ? 'إلغاء' : 'Cancel'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Change PIN */}
            <div className="py-3 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock size={14} style={{ color: ninjaColor }} />
                  <div>
                    <p className="font-body text-[10px] text-gray-500 uppercase">{ar ? 'الرقم السري' : 'PIN Code'}</p>
                    <p className="font-body text-sm text-gray-400">****</p>
                  </div>
                </div>
                {!changingPin && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setChangingPin(true); setPinError(''); setOldPin(''); setNewPin(''); }}
                    className="ninja-btn ninja-btn-ghost ninja-btn-sm flex items-center gap-1 text-xs"
                  >
                    <Pencil size={12} /> {ar ? 'تغيير' : 'Change'}
                  </motion.button>
                )}
              </div>
              <AnimatePresence>
                {changingPin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 space-y-2 overflow-hidden"
                  >
                    <NinjaInput
                      type="password"
                      icon={<Lock size={14} />}
                      value={oldPin}
                      onChange={(e) => { setOldPin(e.target.value); setPinError(''); }}
                      placeholder={ar ? 'الرقم السري الحالي' : 'Current PIN'}
                      maxLength={6}
                    />
                    <NinjaInput
                      type="password"
                      icon={<Lock size={14} />}
                      value={newPin}
                      onChange={(e) => { setNewPin(e.target.value); setPinError(''); }}
                      placeholder={ar ? 'الرقم السري الجديد' : 'New PIN'}
                      maxLength={6}
                    />
                    {pinError && (
                      <p className="text-red-400 font-body text-xs flex items-center gap-1">
                        <AlertTriangle size={12} /> {pinError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleChangePin}
                        disabled={pinSaving}
                        className="ninja-btn ninja-btn-green ninja-btn-sm flex-1 flex items-center justify-center gap-1"
                      >
                        {pinSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        {pinSaving ? (ar ? 'جاري الحفظ...' : 'Saving...') : (ar ? 'حفظ الرقم السري' : 'Save PIN')}
                      </motion.button>
                      <button
                        onClick={() => { setChangingPin(false); setPinError(''); }}
                        className="ninja-btn ninja-btn-ghost ninja-btn-sm"
                      >
                        {ar ? 'إلغاء' : 'Cancel'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Account info */}
            <div className="pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-body text-[10px] text-gray-500 uppercase">{ar ? 'تاريخ الانضمام' : 'Joined'}</span>
                <span className="font-body text-xs text-gray-300">
                  {player.createdAt
                    ? new Date(
                        player.createdAt?.seconds
                          ? player.createdAt.seconds * 1000
                          : player.createdAt
                      ).toLocaleDateString(ar ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : (ar ? 'غير معروف' : 'Unknown')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-body text-[10px] text-gray-500 uppercase">{ar ? 'إجمالي الخبرة' : 'Total XP'}</span>
                <span className="font-ninja text-xs" style={{ color: levelInfo.color }}>
                  {totalXP.toLocaleString()} XP
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-body text-[10px] text-gray-500 uppercase">{ar ? 'توكنز مصروفة' : 'Tokens Spent'}</span>
                <span className="font-ninja text-xs text-yellow-400">
                  {(player.totalCoinsSpent || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ======== THIRD COLUMN - INFO ======== */}
        <div className="relative rounded-2xl overflow-hidden overflow-y-auto" style={{
          background: 'linear-gradient(180deg, rgba(8,10,16,0.95), rgba(6,8,12,0.98))',
          border: '2px solid rgba(57,255,20,0.12)',
        }}>
          <div className="absolute top-0 left-0 w-4 h-4 z-10" style={{ borderTop: '2px solid #39FF14', borderLeft: '2px solid #39FF14' }} />
          <div className="absolute bottom-0 right-0 w-4 h-4 z-10" style={{ borderBottom: '2px solid #39FF14', borderRight: '2px solid #39FF14' }} />
          <div className="p-4">

            {/* ── Bio ── */}
            <div className="py-3 border-b border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-body text-xs text-gray-400 flex items-center gap-1.5"><Pencil size={12} style={{ color: ninjaColor }} /> {ar ? 'نبذة' : 'Bio'}</span>
                {!editingBio ? (
                  <button onClick={() => { setEditingBio(true); setBioText(player.bio || ''); }} className="font-body text-[10px] text-gray-500 hover:text-white transition-all">{ar ? 'تعديل' : 'Edit'}</button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={saveBio} disabled={bioSaving} className="font-body text-[10px] text-ninja-green">{bioSaving ? '...' : (ar ? 'حفظ' : 'Save')}</button>
                    <button onClick={() => setEditingBio(false)} className="font-body text-[10px] text-gray-500">{ar ? 'إلغاء' : 'Cancel'}</button>
                  </div>
                )}
              </div>
              {editingBio ? (
                <textarea value={bioText} onChange={(e) => setBioText(e.target.value)} maxLength={200} placeholder={ar ? 'أخبر الجميع عن نفسك...' : 'Tell everyone about yourself...'}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white font-body resize-none focus:outline-none focus:border-ninja-green/40" rows={2} />
              ) : (
                <p className="font-body text-xs text-gray-500 italic">{player.bio || (ar ? 'لا توجد نبذة' : 'No bio set')}</p>
              )}
            </div>

            {/* ── Social Links ── */}
            <div className="py-3 border-b border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-body text-xs text-gray-400 flex items-center gap-1.5"><Link2 size={12} style={{ color: ninjaColor }} /> {ar ? 'وسائل التواصل' : 'Socials'}</span>
                {!editingSocials ? (
                  <button onClick={() => { setEditingSocials(true); setSocialLinks(player.socialLinks || {}); }} className="font-body text-[10px] text-gray-500 hover:text-white transition-all">{ar ? 'تعديل' : 'Edit'}</button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={saveSocialLinks} className="font-body text-[10px] text-ninja-green">{ar ? 'حفظ' : 'Save'}</button>
                    <button onClick={() => setEditingSocials(false)} className="font-body text-[10px] text-gray-500">{ar ? 'إلغاء' : 'Cancel'}</button>
                  </div>
                )}
              </div>
              {editingSocials ? (
                <div className="space-y-1.5">
                  {['instagram', 'discord', 'tiktok', 'snapchat', 'youtube'].map(key => (
                    <input key={key} type="text" value={(socialLinks as any)[key] || ''} onChange={(e) => setSocialLinks({ ...socialLinks, [key]: e.target.value })}
                      placeholder={key} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white font-body focus:outline-none focus:border-ninja-green/40 capitalize" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(player.socialLinks || {}).filter(([, v]) => v).length === 0 ? (
                    <span className="font-body text-xs text-gray-600">{ar ? 'لم يتم تعيين' : 'None set'}</span>
                  ) : Object.entries(player.socialLinks || {}).filter(([, v]) => v).map(([k, v]) => (
                    <span key={k} className="font-body text-[10px] px-2 py-0.5 rounded bg-black/30 border border-white/5 text-gray-300 capitalize">{k}: <span style={{ color: ninjaColor }}>{v as string}</span></span>
                  ))}
                </div>
              )}
            </div>

            {/* ── Country ── */}
            <div className="py-3 border-b border-white/5 flex items-center justify-between">
              <span className="font-body text-xs text-gray-400 flex items-center gap-1.5"><Flag size={12} style={{ color: ninjaColor }} /> {ar ? 'الدولة' : 'Country'}</span>
              {playerCountryFlag ? (
                <span className="flex items-center gap-1.5"><span className="text-lg">{playerCountryFlag.flag}</span><span className="font-body text-xs text-gray-300">{playerCountryFlag.name}</span></span>
              ) : <span className="font-body text-xs text-gray-600">{ar ? 'غير محدد' : 'Not set'}</span>}
            </div>

            {/* ── Privacy ── */}
            <div className="py-3 border-b border-white/5">
              <span className="font-body text-xs text-gray-400 flex items-center gap-1.5 mb-2"><Shield size={12} style={{ color: ninjaColor }} /> {ar ? 'الخصوصية' : 'Privacy'}</span>
              {['profileVisibility', 'inventoryVisibility'].map(key => (
                <div key={key} className="flex items-center justify-between mb-1.5">
                  <span className="font-body text-[10px] text-gray-500 capitalize">{ar ? (key === 'profileVisibility' ? 'الملف الشخصي' : 'المخزون') : key.replace('Visibility', '')}</span>
                  <div className="flex gap-1">
                    {['public', 'friends', 'private'].map(v => (
                      <button key={v} onClick={() => updatePrivacy(key, v)}
                        className={`px-1.5 py-0.5 rounded font-ninja text-[8px] uppercase transition-all ${(privacySettings as any)[key] === v ? 'bg-ninja-green/20 text-ninja-green border border-ninja-green/30' : 'text-gray-600 border border-white/5'}`}>
                        {ar ? (v === 'public' ? 'عام' : v === 'friends' ? 'أصدقاء' : 'خاص') : v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Referral ── */}
            <div className="py-3 border-b border-white/5">
              <span className="font-body text-xs text-gray-400 flex items-center gap-1.5 mb-2"><UserPlus size={12} style={{ color: ninjaColor }} /> {ar ? 'كود الإحالة' : 'Referral'}</span>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 font-ninja text-xs tracking-wider" style={{ color: ninjaColor }}>{player.referralCode || '...'}</div>
                <button onClick={copyReferral} className="font-body text-[10px] text-gray-500 hover:text-white">{referralCopied ? (ar ? 'تم النسخ!' : 'Copied!') : (ar ? 'نسخ' : 'Copy')}</button>
              </div>
            </div>

            {/* ── Most Played ── */}
            {Object.keys(player.gamePlaytime || {}).length > 0 && (
              <div className="py-3">
                <span className="font-body text-xs text-gray-400 flex items-center gap-1.5 mb-2"><Gamepad2 size={12} style={{ color: ninjaColor }} /> {ar ? 'أكثر الألعاب' : 'Top Games'}</span>
                <div className="space-y-1.5">
                  {Object.entries(player.gamePlaytime || {}).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 5).map(([gameId, minutes]) => {
                    const hrs = Math.floor((minutes as number) / 60);
                    const mins = (minutes as number) % 60;
                    const maxM = Math.max(...Object.values(player.gamePlaytime || {}).map(v => v as number));
                    const pct = maxM > 0 ? ((minutes as number) / maxM) * 100 : 0;
                    return (
                      <div key={gameId} className="flex items-center gap-2">
                        <span className="font-body text-[10px] text-gray-400 w-24 truncate capitalize">{gameId.replace(/-/g, ' ')}</span>
                        <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ninjaColor }} />
                        </div>
                        <span className="font-ninja text-[9px] text-gray-500 w-12 text-right">{hrs}h {mins}m</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* PROFILE COMMENTS                                              */}
      {/* ============================================================ */}
      <div className="rounded-xl overflow-hidden mt-3 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare size={13} style={{ color: ninjaColor }} />
            <span className="font-ninja text-xs text-white">{ar ? 'التعليقات' : 'COMMENTS'}</span>
          </div>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={ar ? 'اكتب تعليقاً...' : 'Write a comment...'}
              maxLength={300}
              onKeyDown={(e) => e.key === 'Enter' && postComment()}
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-body focus:outline-none focus:border-ninja-green/40"
            />
            <button onClick={postComment} disabled={commentSaving || !commentText.trim()}
              className="ninja-btn ninja-btn-green ninja-btn-sm px-4">
              {commentSaving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
          {/* Comment list */}
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
            {comments.length === 0 ? (
              <p className="text-gray-500 font-body text-sm text-center py-4">{ar ? 'لا توجد تعليقات بعد. كن الأول!' : 'No comments yet. Be the first!'}</p>
            ) : (
              comments.map((c: any) => (
                <div key={c.id} className="flex gap-2 p-2 rounded-lg bg-black/20 border border-white/5 flex-shrink-0 min-w-[200px] max-w-[260px]">
                  <div className="w-6 h-6 rounded-full overflow-hidden bg-black/40 flex-shrink-0">
                    {c.fromNinjaType && <img src={`/img/pfp-${c.fromNinjaType}.png`} alt="" className="w-full h-full object-contain" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-ninja text-[9px]" style={{ color: ninjaColor }}>{c.fromName?.toUpperCase()}</span>
                    <p className="font-body text-[10px] text-gray-300 mt-0.5 line-clamp-2">{c.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SEND COINS MODAL                                             */}
      {/* ============================================================ */}
      <AnimatePresence>
        {showSendCoins && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
            onClick={() => { setShowSendCoins(false); setSendError(''); setSendSuccess(''); setFoundPlayer(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative overflow-hidden rounded-2xl p-8 w-[450px] max-w-[90vw]"
              style={{
                background: 'linear-gradient(180deg, #060810 0%, #040608 50%, #050a10 100%)',
                border: '1px solid rgba(57,255,20,0.15)',
                boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 40px rgba(57,255,20,0.04)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderTop: '2px solid rgba(57,255,20,0.4)', borderLeft: '2px solid rgba(57,255,20,0.4)' }} />
              <div className="absolute bottom-0 right-0 w-4 h-4 pointer-events-none z-[2]" style={{ borderBottom: '2px solid rgba(0,200,255,0.25)', borderRight: '2px solid rgba(0,200,255,0.25)' }} />
              <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none z-[2]" style={{ background: 'linear-gradient(90deg, rgba(57,255,20,0.4), rgba(0,200,255,0.2), transparent)' }} />
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-ninja text-2xl text-yellow-400 flex items-center gap-2">
                  <Send size={22} /> {ar ? 'إرسال توكنز' : 'SEND COINS'}
                </h2>
                <button
                  onClick={() => { setShowSendCoins(false); setSendError(''); setSendSuccess(''); setFoundPlayer(null); }}
                  className="ninja-btn ninja-btn-ghost ninja-btn-sm w-11 h-11 flex items-center justify-center"
                >
                  <X size={28} />
                </button>
              </div>

              <p className="font-body text-sm text-gray-400 mb-4">
                {ar ? 'رصيدك:' : 'Your balance:'} <span className="text-yellow-400 font-ninja">{Math.floor(player.coins || 0)} {ar ? 'توكنز' : 'tokens'}</span>
              </p>

              {/* Search Player */}
              <div className="mb-4">
                <label className="text-gray-400 text-[11px] font-body mb-1 block uppercase">{ar ? 'ابحث عن لاعب' : 'Find Player'}</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <NinjaInput
                      type="text"
                      icon={<User size={16} />}
                      value={sendUsername}
                      onChange={(e) => { setSendUsername(e.target.value); setFoundPlayer(null); setSendError(''); }}
                      placeholder={ar ? 'أدخل اسم المستخدم' : 'Enter username'}
                      onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && searchPlayer()}
                    />
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={searchPlayer}
                    className="ninja-btn ninja-btn-yellow ninja-btn-sm px-4"
                  >
                    <Search size={18} />
                  </motion.button>
                </div>
              </div>

              {/* Found Player */}
              {foundPlayer && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg p-4 mb-4 flex items-center gap-3"
                  style={{ background: `${ninjaColor}10`, border: `1px solid ${ninjaColor}25` }}
                >
                  <CheckCircle2 size={20} style={{ color: ninjaColor }} />
                  <div>
                    <p className="font-ninja" style={{ color: ninjaColor }}>{foundPlayer.username?.toUpperCase()}</p>
                    <p className="font-body text-xs text-gray-400">{foundPlayer.activeTitle || (ar ? 'وافد جديد' : 'Newcomer')}</p>
                  </div>
                </motion.div>
              )}

              {/* Amount */}
              <div className="mb-4">
                <label className="text-gray-400 text-[11px] font-body mb-1 block uppercase">{ar ? 'المبلغ' : 'Amount'}</label>
                <NinjaInput
                  type="number"
                  icon={<Coins size={16} />}
                  value={sendAmount}
                  onChange={(e) => { setSendAmount(e.target.value); setSendError(''); }}
                  placeholder={ar ? 'كم عدد التوكنز؟' : 'How many tokens?'}
                  min="1"
                  max={player.coins || 0}
                />
                <div className="flex gap-2 mt-2">
                  {[50, 100, 250, 500].map(amt => (
                    <button
                      key={amt}
                      onClick={() => setSendAmount(String(Math.min(amt, player.coins || 0)))}
                      className="ninja-btn ninja-btn-yellow ninja-btn-sm flex-1"
                    >
                      {amt}
                    </button>
                  ))}
                </div>
                {sendAmount && parseInt(sendAmount) > 0 && (
                  <div className="mt-2 p-2 bg-black/30 rounded-lg border border-white/5 space-y-1">
                    <div className="flex justify-between text-[11px] font-body">
                      <span className="text-gray-500">{ar ? 'مبلغ الإرسال' : 'Send amount'}</span>
                      <span className="text-white">{parseInt(sendAmount)} {ar ? 'توكنز' : 'tokens'}</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-body">
                      <span className="text-gray-500">{ar ? 'الرسوم (10%)' : 'Fee (10%)'}</span>
                      <span className="text-red-400">+{Math.ceil(parseInt(sendAmount) * 0.1)} {ar ? 'توكنز' : 'tokens'}</span>
                    </div>
                    <div className="border-t border-white/10 pt-1 flex justify-between text-[11px] font-body">
                      <span className="text-gray-400">{ar ? 'الرصيد بعد' : 'Balance after'}</span>
                      <span className={`font-ninja ${(player.coins - Math.ceil(parseInt(sendAmount) * 1.1)) < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                        {Math.floor(player.coins - Math.ceil(parseInt(sendAmount) * 1.1))} {ar ? 'توكنز' : 'tokens'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Error */}
              {sendError && (
                <div className="flex items-center gap-2 text-red-400 font-body text-sm mb-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle size={16} /> {sendError}
                </div>
              )}

              {/* Success */}
              {sendSuccess && (
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-2 font-body text-sm mb-4 rounded-lg px-3 py-2"
                  style={{ color: ninjaColor, background: `${ninjaColor}10`, border: `1px solid ${ninjaColor}20` }}
                >
                  <CheckCircle2 size={16} /> {sendSuccess}
                </motion.div>
              )}

              {/* Send Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={sendCoins}
                disabled={!foundPlayer || !sendAmount || sendLoading}
                className="ninja-btn ninja-btn-green-fill ninja-btn-full flex items-center justify-center gap-2"
              >
                {sendLoading ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                    <Coins size={18} />
                  </motion.div>
                ) : (
                  <>
                    <Send size={18} /> {ar ? 'إرسال توكنز' : 'SEND COINS'}
                  </>
                )}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      </div>
    </motion.div>
  );
}

/* ================================================================ */
/* UTILITY COMPONENTS                                                */
/* ================================================================ */

function SettingRow({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5">
      <div className="flex items-center gap-2.5">
        {icon}
        <span className="font-body text-sm text-gray-300">{label}</span>
      </div>
      {children}
    </div>
  );
}

function ToggleSwitch({ active, onToggle, color }: { active: boolean; onToggle: () => void; color: string }) {
  return (
    <button
      onClick={onToggle}
      className="relative w-11 h-6 rounded-full transition-colors duration-200"
      style={{ background: active ? `${color}60` : 'rgba(75,85,99,0.6)' }}
    >
      <motion.div
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md"
        animate={{ left: active ? '22px' : '2px' }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
