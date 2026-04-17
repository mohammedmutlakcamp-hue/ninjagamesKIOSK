'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, setDoc, deleteDoc, query, where, orderBy, limit, getDocs, arrayUnion, arrayRemove, writeBatch } from 'firebase/firestore';
import { NinjaAvatar } from '@/components/NinjaAvatar';
import { NINJA_SKINS, CHEST_REWARDS, COINS_PER_MINUTE } from '@/lib/constants';

// Time-left helper. Player's coin balance → playable minutes.
// Default rate: 2.5 coins/min (= 150 coins/hour).
function formatTimeLeft(coins: number): string {
  if (!coins || coins <= 0) return '0m';
  const totalMin = Math.floor(coins / (COINS_PER_MINUTE || 2.5));
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
import {
  Search, Coins, Clock, Crosshair, X, UserCheck, Ban, ShieldCheck, User, UserPlus, History,
  Package, Trash2, Gift, Crown, Star, Key, RotateCcw, Eye, Users, Palette, ChevronDown,
  Check, AlertTriangle, Shield, Calendar, Phone, Globe, Hash, Gamepad2, UtensilsCrossed,
  Swords, Target, Flame, Award, Sparkles, Lock, Unlock, Plus, Minus, ChevronRight,
  FileText, Timer, Merge, Save
} from 'lucide-react';

// Tab type for detail modal
type DetailTab = 'profile' | 'inventory' | 'friends' | 'actions';

// Rarity colors
const RARITY_COLORS: Record<string, string> = {
  common: '#9CA3AF',
  uncommon: '#34D399',
  rare: '#60A5FA',
  epic: '#A78BFA',
  legendary: '#FBBF24',
  mythical: '#F472B6',
  mythic: '#F472B6',
  immortal: '#EF4444',
};

export function PlayerManagement() {
  const [players, setPlayers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [playerHistory, setPlayerHistory] = useState<any[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newCoins, setNewCoins] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Detail modal state
  const [detailTab, setDetailTab] = useState<DetailTab>('profile');
  const [addCoinsAmount, setAddCoinsAmount] = useState('');
  const [addCoinsLoading, setAddCoinsLoading] = useState(false);
  const [addCoinsMsg, setAddCoinsMsg] = useState('');
  const [addCoinsConfirm, setAddCoinsConfirm] = useState(false);
  const [removeCoinsAmount, setRemoveCoinsAmount] = useState('');
  const [removeCoinsLoading, setRemoveCoinsLoading] = useState(false);
  const [removeCoinsMsg, setRemoveCoinsMsg] = useState('');
  const [removeCoinsConfirm, setRemoveCoinsConfirm] = useState(false);

  // Inventory
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [removeItemConfirm, setRemoveItemConfirm] = useState(false);
  const [removeItemLoading, setRemoveItemLoading] = useState(false);

  // Grant skin
  const [grantSkinId, setGrantSkinId] = useState('');
  const [grantSkinLoading, setGrantSkinLoading] = useState(false);
  const [grantSkinMsg, setGrantSkinMsg] = useState('');

  // Grant item
  const [grantItemId, setGrantItemId] = useState('');
  const [grantItemLoading, setGrantItemLoading] = useState(false);
  const [grantItemMsg, setGrantItemMsg] = useState('');

  // Reset / VIP
  const [resetPinConfirm, setResetPinConfirm] = useState(false);
  const [resetStatsConfirm, setResetStatsConfirm] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [vipExpiry, setVipExpiry] = useState('');

  // Friends
  const [friendPlayers, setFriendPlayers] = useState<any[]>([]);

  // Player Notes
  const [adminNotes, setAdminNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesMsg, setNotesMsg] = useState('');

  // Temporary Ban
  const [showBanOptions, setShowBanOptions] = useState(false);
  const [banLoading, setBanLoading] = useState(false);

  // Player Merge
  const [mergeSearch, setMergeSearch] = useState('');
  const [mergeTarget, setMergeTarget] = useState<any>(null);
  const [mergePreview, setMergePreview] = useState(false);
  const [mergeConfirm, setMergeConfirm] = useState(false);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeMsg, setMergeMsg] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'players'), (snap) => {
      setPlayers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // When selected player changes, update local state
  useEffect(() => {
    if (selected) {
      const live = players.find(p => p.uid === selected.uid);
      if (live) setSelected(live);
    }
  }, [players]);

  // Sync adminNotes when selected player changes
  useEffect(() => {
    if (selected) {
      setAdminNotes(selected.adminNotes || '');
    }
  }, [selected?.uid]);

  // Load friends when friends tab is opened
  useEffect(() => {
    if (selected && detailTab === 'friends') {
      const friendIds: string[] = selected.friends || [];
      const friends = players.filter(p => friendIds.includes(p.uid));
      setFriendPlayers(friends);
    }
  }, [selected, detailTab, players]);

  const filtered = players.filter(p =>
    p.username?.toLowerCase().includes(search.toLowerCase()) ||
    p.phone?.includes(search)
  );

  const loadPlayerHistory = async (playerId: string) => {
    try {
      const q2 = query(collection(db, 'topup-requests'), where('playerId', '==', playerId), orderBy('createdAt', 'desc'), limit(20));
      const snap = await getDocs(q2);
      setPlayerHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { setPlayerHistory([]); }
  };

  const toggleBan = async (playerId: string, banned: boolean) => {
    await updateDoc(doc(db, 'players', playerId), { banned: !banned, bannedUntil: 0 });
    setShowBanOptions(false);
  };

  const timedBan = async (durationMs: number | null) => {
    if (!selected) return;
    setBanLoading(true);
    try {
      const update: any = { banned: true };
      if (durationMs !== null) {
        update.bannedUntil = Date.now() + durationMs;
      } else {
        update.bannedUntil = 0;
      }
      await updateDoc(doc(db, 'players', selected.uid), update);
      setShowBanOptions(false);
      setActionMsg(durationMs !== null ? `Player banned for ${formatDuration(durationMs)}` : 'Player permanently banned');
    } catch (err: any) {
      setActionMsg('Failed: ' + (err.message || 'Unknown'));
    }
    setBanLoading(false);
  };

  const saveAdminNotes = async () => {
    if (!selected) return;
    setNotesSaving(true);
    setNotesMsg('');
    try {
      await updateDoc(doc(db, 'players', selected.uid), { adminNotes });
      setNotesMsg('Notes saved!');
      setTimeout(() => setNotesMsg(''), 2000);
    } catch (err: any) {
      setNotesMsg('Failed: ' + (err.message || 'Unknown'));
    }
    setNotesSaving(false);
  };

  const mergeFilteredPlayers = useMemo(() => {
    if (!mergeSearch.trim() || !selected) return [];
    return players.filter(p =>
      p.uid !== selected.uid &&
      (p.username?.toLowerCase().includes(mergeSearch.toLowerCase()) || p.phone?.includes(mergeSearch))
    ).slice(0, 8);
  }, [mergeSearch, players, selected?.uid]);

  const executeMerge = async () => {
    if (!selected || !mergeTarget) return;
    setMergeLoading(true);
    setMergeMsg('');
    try {
      const batch = writeBatch(db);
      const targetRef = doc(db, 'players', selected.uid);
      const sourceRef = doc(db, 'players', mergeTarget.uid);

      const combinedCoins = (selected.coins || 0) + (mergeTarget.coins || 0);
      const combinedInventory = [...(selected.inventory || []), ...(mergeTarget.inventory || [])];
      const combinedFriends = Array.from(new Set([...(selected.friends || []), ...(mergeTarget.friends || [])]))
        .filter(id => id !== selected.uid && id !== mergeTarget.uid);
      const combinedOwnedNinjas = Array.from(new Set([...(selected.ownedNinjas || []), ...(mergeTarget.ownedNinjas || [])]));
      const combinedTitles = Array.from(new Set([...(selected.titles || []), ...(mergeTarget.titles || [])]));

      const s1 = selected.stats || {};
      const s2 = mergeTarget.stats || {};
      const combinedStats = {
        totalKills: (s1.totalKills || 0) + (s2.totalKills || 0),
        totalDeaths: (s1.totalDeaths || 0) + (s2.totalDeaths || 0),
        totalHeadshots: (s1.totalHeadshots || 0) + (s2.totalHeadshots || 0),
        totalWins: (s1.totalWins || 0) + (s2.totalWins || 0),
        gamesPlayed: (s1.gamesPlayed || 0) + (s2.gamesPlayed || 0),
        chestsOpened: (s1.chestsOpened || 0) + (s2.chestsOpened || 0),
        foodOrdered: (s1.foodOrdered || 0) + (s2.foodOrdered || 0),
        longestStreak: Math.max(s1.longestStreak || 0, s2.longestStreak || 0),
        favoriteGame: s1.favoriteGame || s2.favoriteGame || '',
      };

      const combinedPlaytime = (selected.totalPlaytime || 0) + (mergeTarget.totalPlaytime || 0);
      const combinedCoinsSpent = (selected.totalCoinsSpent || 0) + (mergeTarget.totalCoinsSpent || 0);

      batch.update(targetRef, {
        coins: combinedCoins,
        inventory: combinedInventory,
        friends: combinedFriends,
        ownedNinjas: combinedOwnedNinjas,
        titles: combinedTitles,
        stats: combinedStats,
        totalPlaytime: combinedPlaytime,
        totalCoinsSpent: combinedCoinsSpent,
      });

      batch.delete(sourceRef);

      await batch.commit();
      setMergeMsg(`Merged "${mergeTarget.username}" into "${selected.username}" successfully! Source account deleted.`);
      setMergeTarget(null);
      setMergePreview(false);
      setMergeConfirm(false);
      setMergeSearch('');
    } catch (err: any) {
      setMergeMsg('Failed: ' + (err.message || 'Unknown'));
    }
    setMergeLoading(false);
  };

  const formatDuration = (ms: number) => {
    const hours = ms / (1000 * 60 * 60);
    if (hours < 24) return `${hours}h`;
    return `${hours / 24}d`;
  };

  const getBanTimeRemaining = (bannedUntil: number) => {
    if (!bannedUntil || bannedUntil <= 0) return null;
    const remaining = bannedUntil - Date.now();
    if (remaining <= 0) return 'expired';
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      return `${days}d ${remHours}h remaining`;
    }
    return `${hours}h ${minutes}m remaining`;
  };

  const addCoinsToPlayer = async () => {
    if (!selected) return;
    const amount = parseInt(addCoinsAmount);
    if (!amount || amount <= 0) { setAddCoinsMsg('Enter a valid amount'); return; }
    if (!addCoinsConfirm) {
      setAddCoinsConfirm(true);
      setAddCoinsMsg(`Confirm: Add ${amount} coins to ${selected.username}?`);
      return;
    }
    setAddCoinsLoading(true);
    setAddCoinsMsg('');
    setAddCoinsConfirm(false);
    try {
      const currentCoins = selected.coins || 0;
      await updateDoc(doc(db, 'players', selected.uid), { coins: currentCoins + amount });
      setAddCoinsMsg(`+${amount} coins added!`);
      setAddCoinsAmount('');
    } catch (err: any) {
      setAddCoinsMsg('Failed: ' + (err.message || 'Unknown error'));
    }
    setAddCoinsLoading(false);
  };

  const removeCoinsFromPlayer = async () => {
    if (!selected) return;
    const amount = parseInt(removeCoinsAmount);
    if (!amount || amount <= 0) { setRemoveCoinsMsg('Enter a valid amount'); return; }
    const currentCoins = selected.coins || 0;
    if (amount > currentCoins) { setRemoveCoinsMsg(`Player only has ${currentCoins} coins`); return; }
    if (!removeCoinsConfirm) {
      setRemoveCoinsConfirm(true);
      setRemoveCoinsMsg(`Confirm: Remove ${amount} coins from ${selected.username}?`);
      return;
    }
    setRemoveCoinsLoading(true);
    setRemoveCoinsMsg('');
    setRemoveCoinsConfirm(false);
    try {
      await updateDoc(doc(db, 'players', selected.uid), { coins: currentCoins - amount });
      setRemoveCoinsMsg(`-${amount} coins removed`);
      setRemoveCoinsAmount('');
    } catch (err: any) {
      setRemoveCoinsMsg('Failed: ' + (err.message || 'Unknown error'));
    }
    setRemoveCoinsLoading(false);
  };

  const removeInventoryItem = async () => {
    if (!selected || !selectedItem) return;
    setRemoveItemLoading(true);
    try {
      const currentInventory: any[] = selected.inventory || [];
      const updated = currentInventory.filter((item: any) => item.id !== selectedItem.id);
      await updateDoc(doc(db, 'players', selected.uid), { inventory: updated });
      setSelectedItem(null);
      setRemoveItemConfirm(false);
    } catch (err: any) {
      console.error('Failed to remove item:', err);
    }
    setRemoveItemLoading(false);
  };

  const grantSkin = async () => {
    if (!selected || !grantSkinId) return;
    const skin = NINJA_SKINS.find(s => s.id === grantSkinId);
    if (!skin) return;
    const owned: string[] = selected.ownedNinjas || [];
    if (owned.includes(grantSkinId)) { setGrantSkinMsg('Player already owns this skin'); return; }
    setGrantSkinLoading(true);
    setGrantSkinMsg('');
    try {
      await updateDoc(doc(db, 'players', selected.uid), {
        ownedNinjas: arrayUnion(grantSkinId),
        inventory: [...(selected.inventory || []), {
          id: `skin_${grantSkinId}_${Date.now()}`,
          type: 'skin',
          name: skin.name,
          rarity: skin.tier,
          skinId: grantSkinId,
          value: 0,
          used: false,
          tradeable: false,
          equipped: false,
        }],
      });
      setGrantSkinMsg(`Granted ${skin.name}!`);
      setGrantSkinId('');
    } catch (err: any) {
      setGrantSkinMsg('Failed: ' + (err.message || 'Unknown'));
    }
    setGrantSkinLoading(false);
  };

  const grantItem = async () => {
    if (!selected || !grantItemId) return;
    const reward = CHEST_REWARDS.find(r => r.id === grantItemId);
    if (!reward) return;
    setGrantItemLoading(true);
    setGrantItemMsg('');
    try {
      const newItem = {
        id: `${reward.id}_admin_${Date.now()}`,
        type: reward.type === 'coins' ? 'item' : reward.type === 'skin' ? 'skin' : 'voucher',
        name: reward.name,
        rarity: reward.rarity,
        value: reward.value || 0,
        used: false,
        tradeable: true,
        equipped: false,
        image: reward.image,
        ...(reward.skinId ? { skinId: reward.skinId } : {}),
      };
      if (reward.type === 'coins') {
        await updateDoc(doc(db, 'players', selected.uid), { coins: (selected.coins || 0) + (reward.value || 0) });
        setGrantItemMsg(`Added ${reward.value} coins to balance`);
      } else {
        await updateDoc(doc(db, 'players', selected.uid), {
          inventory: [...(selected.inventory || []), newItem],
          ...(reward.skinId ? { ownedNinjas: arrayUnion(reward.skinId) } : {}),
        });
        setGrantItemMsg(`Granted ${reward.name}!`);
      }
      setGrantItemId('');
    } catch (err: any) {
      setGrantItemMsg('Failed: ' + (err.message || 'Unknown'));
    }
    setGrantItemLoading(false);
  };

  const resetPin = async () => {
    if (!selected) return;
    try {
      // Reuse the legacy-login flow: clear pin, mark as legacy with temp
      // password '0000'. Player types username -> kiosk detects legacy ->
      // asks for old password -> '0000' -> forced to set a new 6-digit PIN.
      await updateDoc(doc(db, 'players', selected.uid), {
        pin: '',
        isLegacyUser: true,
        legacyPassword: '000000',
      });
      setActionMsg('PIN reset → tell player to log in with temp password 000000 (they\'ll set a new PIN)');
      setResetPinConfirm(false);
    } catch (err: any) {
      setActionMsg('Failed: ' + (err.message || 'Unknown'));
    }
  };

  const resetStats = async () => {
    if (!selected) return;
    try {
      await updateDoc(doc(db, 'players', selected.uid), {
        stats: { totalKills: 0, totalDeaths: 0, totalHeadshots: 0, totalWins: 0, gamesPlayed: 0, chestsOpened: 0, foodOrdered: 0, longestStreak: 0, favoriteGame: '' },
        totalPlaytime: 0,
        totalCoinsSpent: 0,
      });
      setActionMsg('All stats have been reset to zero');
      setResetStatsConfirm(false);
    } catch (err: any) {
      setActionMsg('Failed: ' + (err.message || 'Unknown'));
    }
  };

  const toggleVip = async (activate: boolean) => {
    if (!selected) return;
    try {
      if (activate) {
        const expiry = vipExpiry ? new Date(vipExpiry).getTime() : Date.now() + 30 * 24 * 60 * 60 * 1000;
        await updateDoc(doc(db, 'players', selected.uid), {
          vip: { active: true, expiresAt: expiry, startedAt: Date.now(), trialUsed: false, tier: 'basic' },
        });
        setActionMsg('VIP activated!');
      } else {
        await updateDoc(doc(db, 'players', selected.uid), {
          vip: { active: false, expiresAt: 0, startedAt: 0, trialUsed: selected.vip?.trialUsed || false, tier: 'basic' },
        });
        setActionMsg('VIP deactivated');
      }
    } catch (err: any) {
      setActionMsg('Failed: ' + (err.message || 'Unknown'));
    }
  };

  const createPlayer = async () => {
    const username = newUsername.toLowerCase().trim();
    if (!username) { setCreateError('Enter a username'); return; }
    if (username.length < 3) { setCreateError('Username too short (min 3)'); return; }
    if (!/^[a-z0-9_]+$/.test(username)) { setCreateError('Only letters, numbers, underscore'); return; }
    if (players.some(p => p.username === username)) { setCreateError('Username already taken'); return; }
    const coins = parseInt(newCoins) || 0;
    setCreating(true);
    setCreateError('');
    try {
      const id = `player_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await setDoc(doc(db, 'players', id), {
        username, pin: '', coins, totalCoinsSpent: 0, totalPlaytime: 0,
        character: { skinColor: '#39FF14', outfitId: 'default', maskId: '', accessoryId: '', equippedSkins: [] },
        inventory: [], titles: [], activeTitle: 'Newcomer',
        stats: { totalKills: 0, totalDeaths: 0, totalHeadshots: 0, totalWins: 0, gamesPlayed: 0, chestsOpened: 0, foodOrdered: 0, longestStreak: 0, favoriteGame: '' },
        friends: [], ninjaType: 'neon', ownedNinjas: ['neon', 'shadow'],
        createdAt: Date.now(), lastLogin: 0, banned: false, usernameChanges: 0,
      });
      setNewUsername('');
      setNewCoins('');
      setShowCreate(false);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create');
    }
    setCreating(false);
  };

  const closeDetail = () => {
    setSelected(null);
    setPlayerHistory([]);
    setDetailTab('profile');
    setAddCoinsAmount(''); setAddCoinsMsg(''); setAddCoinsConfirm(false);
    setRemoveCoinsAmount(''); setRemoveCoinsMsg(''); setRemoveCoinsConfirm(false);
    setSelectedItem(null); setRemoveItemConfirm(false);
    setGrantSkinId(''); setGrantSkinMsg('');
    setGrantItemId(''); setGrantItemMsg('');
    setResetPinConfirm(false); setResetStatsConfirm(false);
    setActionMsg(''); setVipExpiry('');
    setAdminNotes(''); setNotesSaving(false); setNotesMsg('');
    setShowBanOptions(false); setBanLoading(false);
    setMergeSearch(''); setMergeTarget(null); setMergePreview(false);
    setMergeConfirm(false); setMergeLoading(false); setMergeMsg('');
  };

  const StatRow = ({ label, value, icon: Icon }: { label: string; value: string | number; icon?: any }) => (
    <div className="flex justify-between text-sm py-1.5 border-b border-[#e5e5ea] last:border-0">
      <span className="text-[#86868b] flex items-center gap-1.5">
        {Icon && <Icon size={12} className="text-[#86868b]" />} {label}
      </span>
      <span className="text-[#1d1d1f]">{value}</span>
    </div>
  );

  const inventory = useMemo(() => {
    if (!selected) return [];
    return (selected.inventory || []).map((item: any, i: number) => ({
      ...item,
      _index: i,
    }));
  }, [selected?.inventory]);

  const availableSkins = useMemo(() => {
    if (!selected) return NINJA_SKINS;
    const owned: string[] = selected.ownedNinjas || [];
    return NINJA_SKINS.filter(s => !owned.includes(s.id));
  }, [selected?.ownedNinjas]);

  // Tinasoft-import salvage: any migrated player whose remainingPlaytime
  // (legacy minute balance) is > 0 but coins is 0 has lost their balance
  // because the kiosk economy is coins-only. We can mint the equivalent
  // coins (1 min = 2.5 coins). Show a count + one-click bulk-convert.
  const legacyPending = useMemo(() => {
    return players.filter((p: any) => {
      const rem = Number(p.remainingPlaytime || 0);
      const coins = Number(p.coins || 0);
      return rem > 0 && coins <= 0;
    });
  }, [players]);

  const [legacyConverting, setLegacyConverting] = useState(false);
  const [legacyConvertMsg, setLegacyConvertMsg] = useState('');

  const convertLegacyTimeBulk = async () => {
    if (legacyPending.length === 0 || legacyConverting) return;
    if (!confirm(`Convert legacy Tinasoft time → coins for ${legacyPending.length} player(s)? This adds the equivalent coin balance and clears the old field.`)) return;
    setLegacyConverting(true);
    setLegacyConvertMsg('');
    let ok = 0;
    for (const p of legacyPending) {
      const rem = Math.floor(Number(p.remainingPlaytime || 0));
      const mint = Math.floor(rem * (COINS_PER_MINUTE || 2.5));
      try {
        await updateDoc(doc(db, 'players', p.uid), {
          coins: mint,
          remainingPlaytime: 0,
          legacyRemainingMinutes: rem, // audit trail
        });
        ok++;
      } catch (err) { console.error('legacy convert failed for', p.uid, err); }
    }
    setLegacyConvertMsg(`Converted ${ok}/${legacyPending.length} players.`);
    setLegacyConverting(false);
    setTimeout(() => setLegacyConvertMsg(''), 3500);
  };

  return (
    <div>
      {/* Legacy-time salvage banner — only renders when there's something to fix */}
      {legacyPending.length > 0 && (
        <div className="mb-4 rounded-2xl p-4 flex items-center gap-3 bg-[#ff9500]/8 border border-[#ff9500]/30">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,149,0,0.15)', border: '1px solid rgba(255,149,0,0.3)' }}>
            <AlertTriangle size={18} className="text-[#ff9500]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#1d1d1f]">
              {legacyPending.length} migrated player{legacyPending.length === 1 ? '' : 's'} still have unconverted Tinasoft time
            </p>
            <p className="text-xs text-[#86868b] mt-0.5">
              Their <code className="px-1 py-0.5 rounded bg-white border border-[#e5e5ea] text-[10px]">remainingPlaytime</code> is set but <code className="px-1 py-0.5 rounded bg-white border border-[#e5e5ea] text-[10px]">coins</code> is 0, so the kiosk shows them as having no time. Convert at 2.5 coins/min (= 150 coins/hr).
            </p>
          </div>
          {legacyConvertMsg && <span className="text-xs text-[#34c759] font-medium">{legacyConvertMsg}</span>}
          <button
            onClick={convertLegacyTimeBulk}
            disabled={legacyConverting}
            className="flex-shrink-0 px-4 py-2 rounded-xl bg-[#ff9500] text-white font-medium text-sm hover:bg-[#e68a00] disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {legacyConverting ? <RotateCcw size={14} className="animate-spin" /> : <Coins size={14} />}
            Convert all
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">Players</h2>
          <p className="text-[#86868b] text-sm">{players.length} registered players</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#0071e3] text-white rounded-xl font-medium text-sm hover:bg-[#0077ED] transition-all"
          >
            <UserPlus size={16} /> New Player
          </button>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players..."
              className="bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl pl-10 pr-4 py-2 text-[#1d1d1f] w-64 focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Player List */}
      <div className="space-y-2">
        {filtered.map((player, i) => (
          <motion.div
            key={player.uid}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02 }}
            onClick={() => { setSelected(player); setDetailTab('profile'); }}
            className="bg-white rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-[#0071e3]/20 border border-[#e5e5ea]/60 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
          >
            <div className="flex items-center gap-4">
              <NinjaAvatar
                skinColor={player.character?.skinColor || '#8D6E63'}
                outfitColor="#333"
                size={40}
                animated={false}
              />
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-[#1d1d1f]">{player.username?.toUpperCase()}</p>
                  {player.vip?.active && <Crown size={14} className="text-[#ff9500]" />}
                </div>
                <p className="text-xs text-[#86868b]">{player.phone} · {player.activeTitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              {/* Time left = coins / coins-per-minute. Highlighted if low so
                  the worker can see at a glance who's about to run out. */}
              {(() => {
                const minLeft = Math.floor((player.coins || 0) / (COINS_PER_MINUTE || 2.5));
                const low = minLeft > 0 && minLeft <= 15;
                const empty = minLeft <= 0;
                const color = empty ? '#ff3b30' : low ? '#ff9500' : '#34c759';
                return (
                  <div className="text-right min-w-[88px]">
                    <p className="font-semibold flex items-center gap-1 justify-end" style={{ color }}>
                      <Timer size={14} /> {formatTimeLeft(player.coins || 0)}
                    </p>
                    <p className="text-[10px] text-[#86868b] uppercase tracking-wider">time left</p>
                  </div>
                );
              })()}
              <div className="text-right">
                <p className="font-semibold text-[#0071e3] flex items-center gap-1 justify-end">
                  <Coins size={14} /> {Math.floor(player.coins || 0)}
                </p>
                <p className="text-xs text-[#86868b] flex items-center gap-1 justify-end">
                  <Clock size={10} /> {Math.floor((player.totalPlaytime || 0) / 60)}h played
                </p>
              </div>
              {/* Legacy Tinasoft time still pending conversion */}
              {Number(player.remainingPlaytime || 0) > 0 && Number(player.coins || 0) <= 0 && (
                <span className="px-2 py-1 bg-[#ff9500]/10 text-[#ff9500] text-xs rounded-full font-medium border border-[#ff9500]/25 flex items-center gap-1" title="Tinasoft balance not yet converted to coins. Use 'Convert all' at the top of the list.">
                  <AlertTriangle size={10} /> {formatTimeLeft(Math.floor(Number(player.remainingPlaytime) * (COINS_PER_MINUTE || 2.5)))} legacy
                </span>
              )}
              {player.banned && (
                <span className="px-2 py-1 bg-[#ff3b30]/10 text-[#ff3b30] text-xs rounded-full font-medium">BANNED</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Create Player Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowCreate(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-8 w-[420px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-[#e5e5ea]/60"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0071e3]/10 flex items-center justify-center border border-[#0071e3]/20">
                  <UserPlus size={20} className="text-[#0071e3]" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#1d1d1f]">New Player</h3>
                  <p className="text-xs text-[#86868b]">Player sets PIN on first login</p>
                </div>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-[#86868b] hover:text-[#1d1d1f]"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[#86868b] text-xs font-medium mb-1 block uppercase tracking-wider">Username</label>
                <input
                  value={newUsername}
                  onChange={(e) => { setNewUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, '')); setCreateError(''); }}
                  placeholder="e.g. ninja_king"
                  className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                />
              </div>
              <div>
                <label className="text-[#86868b] text-xs font-medium mb-1 block uppercase tracking-wider">Starting Coins</label>
                <input
                  type="number"
                  value={newCoins}
                  onChange={(e) => setNewCoins(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
                />
                <div className="flex gap-2 mt-2">
                  {[200, 500, 1000, 2000].map(amount => (
                    <button
                      key={amount}
                      onClick={() => setNewCoins(String(amount))}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all ${
                        newCoins === String(amount)
                          ? 'bg-[#0071e3] text-white'
                          : 'bg-[#0071e3]/5 border border-[#0071e3]/20 text-[#0071e3] hover:bg-[#0071e3]/10'
                      }`}
                    >
                      {amount}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {createError && <p className="text-[#ff3b30] text-sm mt-3">{createError}</p>}
            <button
              onClick={createPlayer}
              disabled={creating}
              className="w-full mt-6 py-3 bg-[#0071e3] text-white rounded-xl font-medium text-sm hover:bg-[#0077ED] transition-all disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Player'}
            </button>
          </motion.div>
        </div>
      )}

      {/* Player Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={closeDetail}>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl w-[700px] max-h-[92vh] flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-[#e5e5ea]/60"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 pb-4 border-b border-[#e5e5ea]">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <NinjaAvatar
                    skinColor={selected.character?.skinColor || '#8D6E63'}
                    outfitColor="#333"
                    size={56}
                    animated={false}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-semibold text-[#0071e3]">{selected.username?.toUpperCase()}</h3>
                      {selected.vip?.active && (
                        <span className="px-2 py-0.5 bg-[#ff9500]/10 border border-[#ff9500]/20 rounded-full text-[#ff9500] text-[10px] font-medium">VIP</span>
                      )}
                      {selected.banned && (
                        <span className="px-2 py-0.5 bg-[#ff3b30]/10 text-[#ff3b30] text-[10px] rounded-full font-medium">BANNED</span>
                      )}
                    </div>
                    <p className="text-[#86868b] text-sm">{selected.phone || 'No phone'} · {selected.activeTitle || 'No title'}</p>
                    {selected.firstName && <p className="text-[#86868b] text-xs">{selected.firstName} {selected.lastName}</p>}
                  </div>
                </div>
                <button onClick={closeDetail} className="text-[#86868b] hover:text-[#1d1d1f]"><X size={20} /></button>
              </div>

              {/* Quick Stats Row */}
              <div className="grid grid-cols-5 gap-2">
                <div className="bg-[#f5f5f7] rounded-xl p-2 text-center">
                  <p className="text-sm font-semibold text-[#0071e3] flex items-center justify-center gap-1"><Coins size={12} /> {Math.floor(selected.coins || 0)}</p>
                  <p className="text-[10px] text-[#86868b]">Coins</p>
                </div>
                {(() => {
                  const minLeft = Math.floor((selected.coins || 0) / (COINS_PER_MINUTE || 2.5));
                  const low = minLeft > 0 && minLeft <= 15;
                  const empty = minLeft <= 0;
                  const color = empty ? '#ff3b30' : low ? '#ff9500' : '#34c759';
                  const bg = empty ? 'bg-[#ff3b30]/5' : low ? 'bg-[#ff9500]/5' : 'bg-[#34c759]/5';
                  return (
                    <div className={`rounded-xl p-2 text-center border ${bg}`} style={{ borderColor: `${color}33` }}>
                      <p className="text-sm font-semibold flex items-center justify-center gap-1" style={{ color }}>
                        <Timer size={12} /> {formatTimeLeft(selected.coins || 0)}
                      </p>
                      <p className="text-[10px] text-[#86868b]">Time Left</p>
                    </div>
                  );
                })()}
                <div className="bg-[#f5f5f7] rounded-xl p-2 text-center">
                  <p className="text-sm font-semibold text-[#1d1d1f] flex items-center justify-center gap-1"><Clock size={12} /> {Math.floor((selected.totalPlaytime || 0) / 60)}h</p>
                  <p className="text-[10px] text-[#86868b]">Playtime</p>
                </div>
                <div className="bg-[#f5f5f7] rounded-xl p-2 text-center">
                  <p className="text-sm font-semibold text-[#1d1d1f] flex items-center justify-center gap-1"><Gamepad2 size={12} /> {selected.stats?.gamesPlayed || 0}</p>
                  <p className="text-[10px] text-[#86868b]">Games</p>
                </div>
                <div className="bg-[#f5f5f7] rounded-xl p-2 text-center">
                  <p className="text-sm font-semibold text-[#1d1d1f] flex items-center justify-center gap-1"><Package size={12} /> {(selected.inventory || []).length}</p>
                  <p className="text-[10px] text-[#86868b]">Items</p>
                </div>
              </div>

              {/* Tab Bar */}
              <div className="flex gap-1 mt-4">
                {([
                  { id: 'profile', label: 'Profile', icon: User },
                  { id: 'inventory', label: 'Inventory', icon: Package },
                  { id: 'friends', label: 'Friends', icon: Users },
                  { id: 'actions', label: 'Actions', icon: Sparkles },
                ] as { id: DetailTab; label: string; icon: any }[]).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setDetailTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all ${
                      detailTab === tab.id
                        ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/20'
                        : 'text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]'
                    }`}
                  >
                    <tab.icon size={14} /> {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* PROFILE TAB */}
              {detailTab === 'profile' && (
                <div className="space-y-6">
                  <div className="bg-[#f5f5f7] rounded-2xl p-4 border border-[#e5e5ea]/60">
                    <h4 className="text-sm font-semibold text-[#0071e3] mb-3 flex items-center gap-2"><User size={14} /> Player Info</h4>
                    <div className="space-y-0">
                      <StatRow label="UID" value={selected.uid} icon={Hash} />
                      <StatRow label="Username" value={selected.username || 'N/A'} icon={User} />
                      <StatRow label="Phone" value={selected.phone || 'N/A'} icon={Phone} />
                      <StatRow label="Country" value={selected.country || 'N/A'} icon={Globe} />
                      <StatRow label="Ninja Type" value={selected.ninjaType || 'neon'} icon={Palette} />
                      <StatRow label="Joined" value={selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : 'N/A'} icon={Calendar} />
                      <StatRow label="Last Login" value={selected.lastLogin ? new Date(selected.lastLogin).toLocaleString() : 'Never'} icon={Clock} />
                      <StatRow label="Username Changes" value={selected.usernameChanges || 0} icon={RotateCcw} />
                      <StatRow label="VIP Status" value={selected.vip?.active ? `Active (expires ${new Date(selected.vip.expiresAt).toLocaleDateString()})` : 'Inactive'} icon={Crown} />
                      <StatRow label="Friends Count" value={(selected.friends || []).length} icon={Users} />
                      <StatRow label="Skins Owned" value={(selected.ownedNinjas || []).length} icon={Palette} />
                    </div>
                  </div>

                  <div className="bg-[#f5f5f7] rounded-2xl p-4 border border-[#e5e5ea]/60">
                    <h4 className="text-sm font-semibold text-[#0071e3] mb-3 flex items-center gap-2"><Swords size={14} /> Stats</h4>
                    <div className="grid grid-cols-2 gap-x-6">
                      <StatRow label="Games Played" value={selected.stats?.gamesPlayed || 0} icon={Gamepad2} />
                      <StatRow label="Total Wins" value={selected.stats?.totalWins || 0} icon={Award} />
                      <StatRow label="Total Kills" value={selected.stats?.totalKills || 0} icon={Crosshair} />
                      <StatRow label="Total Deaths" value={selected.stats?.totalDeaths || 0} icon={Target} />
                      <StatRow label="Headshots" value={selected.stats?.totalHeadshots || 0} icon={Target} />
                      <StatRow label="Longest Streak" value={selected.stats?.longestStreak || 0} icon={Flame} />
                      <StatRow label="Chests Opened" value={selected.stats?.chestsOpened || 0} icon={Package} />
                      <StatRow label="Food Ordered" value={selected.stats?.foodOrdered || 0} icon={UtensilsCrossed} />
                      <StatRow label="Favorite Game" value={selected.stats?.favoriteGame || 'None'} icon={Star} />
                      <StatRow label="Total Coins Spent" value={selected.totalCoinsSpent || 0} icon={Coins} />
                      <StatRow label="Playtime (mins)" value={selected.totalPlaytime || 0} icon={Clock} />
                    </div>
                  </div>

                  <div className="bg-[#f5f5f7] rounded-2xl p-4 border border-[#e5e5ea]/60">
                    <button
                      onClick={() => loadPlayerHistory(selected.uid)}
                      className="w-full flex items-center justify-center gap-2 py-2 border border-[#d2d2d7] rounded-xl text-[#86868b] text-sm hover:bg-white transition-all mb-3"
                    >
                      <History size={14} /> Load Top-Up History
                    </button>
                    {playerHistory.length > 0 && (
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                        {playerHistory.map((h: any) => (
                          <div key={h.id} className="flex items-center justify-between px-3 py-2 bg-white rounded-xl text-xs">
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${h.status === 'approved' ? 'bg-[#34c759]' : h.status === 'rejected' ? 'bg-[#ff3b30]' : 'bg-[#ff9500]'}`} />
                              <span className="text-[#1d1d1f]">{h.coins} coins · {h.priceJOD} JOD</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${h.status === 'approved' ? 'text-[#34c759]' : h.status === 'rejected' ? 'text-[#ff3b30]' : 'text-[#ff9500]'}`}>
                                {h.status?.toUpperCase()}
                              </span>
                              <span className="text-[#86868b]">{h.createdAt ? new Date(h.createdAt).toLocaleDateString() : ''}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* INVENTORY TAB */}
              {detailTab === 'inventory' && (
                <div>
                  <h4 className="text-sm font-semibold text-[#0071e3] mb-3 flex items-center gap-2">
                    <Package size={14} /> Inventory ({inventory.length} items)
                  </h4>

                  {inventory.length === 0 ? (
                    <div className="bg-[#f5f5f7] rounded-2xl p-8 text-center border border-[#e5e5ea]/60">
                      <Package size={32} className="text-[#d2d2d7] mx-auto mb-2" />
                      <p className="text-[#86868b]">No items in inventory</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {inventory.map((item: any) => {
                        const rarityColor = RARITY_COLORS[item.rarity || 'common'] || '#9CA3AF';
                        const isSelected = selectedItem?.id === item.id;
                        return (
                          <motion.div
                            key={item.id || item._index}
                            whileHover={{ scale: 1.02 }}
                            onClick={() => { setSelectedItem(isSelected ? null : item); setRemoveItemConfirm(false); }}
                            className={`bg-white rounded-2xl p-3 cursor-pointer border transition-all relative shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${
                              isSelected ? 'border-[#0071e3]/50 ring-1 ring-[#0071e3]/30' : 'border-[#e5e5ea]/60 hover:border-[#d2d2d7]'
                            }`}
                          >
                            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ backgroundColor: rarityColor }} />

                            {item.image && (
                              <div className="w-full h-16 flex items-center justify-center mb-2">
                                <img src={item.image} alt={item.name} className="h-14 w-14 object-contain" />
                              </div>
                            )}
                            {!item.image && item.skinId && (
                              <div className="w-full h-16 flex items-center justify-center mb-2">
                                <img
                                  src={NINJA_SKINS.find(s => s.id === item.skinId)?.profileImage || `/ninjas/profiles/${item.skinId}-ninja-profile-photo.png`}
                                  alt={item.name}
                                  className="h-14 w-14 object-contain rounded-full"
                                />
                              </div>
                            )}
                            {!item.image && !item.skinId && (
                              <div className="w-full h-16 flex items-center justify-center mb-2">
                                <Package size={24} className="text-[#d2d2d7]" />
                              </div>
                            )}

                            <p className="text-[#1d1d1f] text-xs truncate">{item.name}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[10px] font-medium uppercase" style={{ color: rarityColor }}>{item.rarity || 'common'}</span>
                              <span className="text-[10px] text-[#86868b]">{item.type}</span>
                            </div>

                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {item.equipped && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-[#34c759]/10 text-[#34c759] rounded-full font-medium">EQUIPPED</span>
                              )}
                              {item.tradeable === false && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-[#ff3b30]/10 text-[#ff3b30] rounded-full font-medium flex items-center gap-0.5">
                                  <Lock size={8} /> LOCKED
                                </span>
                              )}
                              {item.sentBy && (
                                <span className="text-[9px] px-1.5 py-0.5 bg-[#af52de]/10 text-[#af52de] rounded-full font-medium">
                                  from {item.sentBy}
                                </span>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}

                  {selectedItem && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 bg-[#f5f5f7] rounded-2xl p-4 border border-[#ff3b30]/20"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-[#1d1d1f]">Selected: {selectedItem.name}</p>
                          <p className="text-xs text-[#86868b]">{selectedItem.type} · {selectedItem.rarity}</p>
                        </div>
                        {!removeItemConfirm ? (
                          <button
                            onClick={() => setRemoveItemConfirm(true)}
                            className="flex items-center gap-1.5 px-3 py-2 text-[#ff3b30] rounded-xl font-medium text-xs hover:bg-[#fff5f5] transition-all border border-[#d2d2d7]"
                          >
                            <Trash2 size={14} /> Remove Item
                          </button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#ff9500] flex items-center gap-1"><AlertTriangle size={12} /> Sure?</span>
                            <button
                              onClick={removeInventoryItem}
                              disabled={removeItemLoading}
                              className="px-3 py-2 bg-[#ff3b30] text-white rounded-xl font-medium text-xs hover:bg-[#ff3b30]/90 transition-all disabled:opacity-50"
                            >
                              {removeItemLoading ? '...' : 'Confirm Delete'}
                            </button>
                            <button
                              onClick={() => setRemoveItemConfirm(false)}
                              className="px-3 py-2 border border-[#d2d2d7] rounded-xl text-[#86868b] text-xs hover:bg-[#f5f5f7]"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* FRIENDS TAB */}
              {detailTab === 'friends' && (
                <div>
                  <h4 className="text-sm font-semibold text-[#0071e3] mb-3 flex items-center gap-2">
                    <Users size={14} /> Friends ({(selected.friends || []).length})
                  </h4>

                  {(selected.friends || []).length === 0 ? (
                    <div className="bg-[#f5f5f7] rounded-2xl p-8 text-center border border-[#e5e5ea]/60">
                      <Users size={32} className="text-[#d2d2d7] mx-auto mb-2" />
                      <p className="text-[#86868b]">No friends added yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {friendPlayers.map(friend => (
                        <div key={friend.uid} className="bg-white rounded-xl p-3 flex items-center justify-between border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                          <div className="flex items-center gap-3">
                            <NinjaAvatar
                              skinColor={friend.character?.skinColor || '#8D6E63'}
                              outfitColor="#333"
                              size={36}
                              animated={false}
                            />
                            <div>
                              <p className="text-sm font-semibold text-[#1d1d1f]">{friend.username?.toUpperCase()}</p>
                              <p className="text-[10px] text-[#86868b]">
                                {friend.activeTitle} · {Math.floor(friend.coins || 0)} coins
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs text-[#86868b]">
                                {Math.floor((friend.totalPlaytime || 0) / 60)}h played
                              </p>
                              <p className="text-[10px] text-[#86868b]">
                                Last: {friend.lastLogin ? new Date(friend.lastLogin).toLocaleDateString() : 'Never'}
                              </p>
                            </div>
                            <button
                              onClick={() => { setSelected(friend); setDetailTab('profile'); }}
                              className="p-1.5 rounded-xl hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] transition-all"
                            >
                              <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {(selected.friends || []).filter((id: string) => !friendPlayers.find(f => f.uid === id)).map((id: string) => (
                        <div key={id} className="bg-[#f5f5f7] rounded-xl p-3 flex items-center gap-3 border border-[#e5e5ea]/60 opacity-50">
                          <User size={20} className="text-[#86868b]" />
                          <p className="text-xs text-[#86868b] truncate">{id}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ACTIONS TAB */}
              {detailTab === 'actions' && (
                <div className="space-y-4">

                  {/* Add Coins */}
                  <div className="bg-[#f5f5f7] rounded-2xl p-4 border border-[#0071e3]/10">
                    <h4 className="text-sm font-semibold text-[#0071e3] mb-3 flex items-center gap-2"><Plus size={14} /> Add Coins</h4>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={addCoinsAmount}
                        onChange={(e) => setAddCoinsAmount(e.target.value)}
                        placeholder="Amount..."
                        className="flex-1 bg-white border border-[#d2d2d7] rounded-xl px-3 py-2 text-[#1d1d1f] text-sm focus:border-[#0071e3] outline-none"
                        onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && addCoinsToPlayer()}
                      />
                      <button
                        onClick={addCoinsToPlayer}
                        disabled={addCoinsLoading}
                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all disabled:opacity-50 ${
                          addCoinsConfirm ? 'bg-[#ff9500] text-white hover:bg-[#ff9500]/90' : 'bg-[#0071e3] text-white hover:bg-[#0077ED]'
                        }`}
                      >
                        {addCoinsLoading ? '...' : addCoinsConfirm ? 'Confirm' : 'Add'}
                      </button>
                      {addCoinsConfirm && (
                        <button onClick={() => { setAddCoinsConfirm(false); setAddCoinsMsg(''); }}
                          className="px-3 py-2 border border-[#d2d2d7] rounded-xl text-[#86868b] text-sm hover:bg-white">Cancel</button>
                      )}
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      {[50, 100, 200, 500, 1000].map(amt => (
                        <button key={amt} onClick={() => setAddCoinsAmount(String(amt))}
                          className="flex-1 py-1 rounded-xl bg-white text-[#86868b] text-[10px] hover:bg-[#e8e8ed] hover:text-[#1d1d1f] transition-all border border-[#e5e5ea]">+{amt}</button>
                      ))}
                    </div>
                    {addCoinsMsg && (
                      <p className={`text-xs mt-2 ${addCoinsMsg.startsWith('+') || addCoinsMsg.startsWith('Confirm') ? 'text-[#34c759]' : 'text-[#ff3b30]'}`}>{addCoinsMsg}</p>
                    )}
                  </div>

                  {/* Remove Coins */}
                  <div className="bg-[#f5f5f7] rounded-2xl p-4 border border-[#ff3b30]/10">
                    <h4 className="text-sm font-semibold text-[#ff3b30] mb-3 flex items-center gap-2"><Minus size={14} /> Remove Coins</h4>
                    <p className="text-xs text-[#86868b] mb-2">Current balance: <span className="text-[#0071e3] font-semibold">{Math.floor(selected.coins || 0)}</span></p>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={removeCoinsAmount}
                        onChange={(e) => setRemoveCoinsAmount(e.target.value)}
                        placeholder="Amount to remove..."
                        className="flex-1 bg-white border border-[#d2d2d7] rounded-xl px-3 py-2 text-[#1d1d1f] text-sm focus:border-[#ff3b30] outline-none"
                        onKeyDown={(e) => (e.key === 'Enter' || e.code === 'NumpadEnter') && removeCoinsFromPlayer()}
                      />
                      <button
                        onClick={removeCoinsFromPlayer}
                        disabled={removeCoinsLoading}
                        className={`px-4 py-2 rounded-xl font-medium text-sm transition-all disabled:opacity-50 ${
                          removeCoinsConfirm ? 'bg-[#ff9500] text-white hover:bg-[#ff9500]/90' : 'bg-[#ff3b30] text-white hover:bg-[#ff3b30]/90'
                        }`}
                      >
                        {removeCoinsLoading ? '...' : removeCoinsConfirm ? 'Confirm' : 'Remove'}
                      </button>
                      {removeCoinsConfirm && (
                        <button onClick={() => { setRemoveCoinsConfirm(false); setRemoveCoinsMsg(''); }}
                          className="px-3 py-2 border border-[#d2d2d7] rounded-xl text-[#86868b] text-sm hover:bg-white">Cancel</button>
                      )}
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      {[50, 100, 200, 500].map(amt => (
                        <button key={amt} onClick={() => setRemoveCoinsAmount(String(amt))}
                          className="flex-1 py-1 rounded-xl bg-[#ff3b30]/5 text-[#ff3b30]/70 text-[10px] hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] transition-all">-{amt}</button>
                      ))}
                      <button onClick={() => setRemoveCoinsAmount(String(Math.floor(selected.coins || 0)))}
                        className="flex-1 py-1 rounded-xl bg-[#ff3b30]/5 text-[#ff3b30]/70 text-[10px] hover:bg-[#ff3b30]/10 hover:text-[#ff3b30] transition-all">ALL</button>
                    </div>
                    {removeCoinsMsg && (
                      <p className={`text-xs mt-2 ${removeCoinsMsg.startsWith('-') ? 'text-[#ff3b30]' : removeCoinsMsg.startsWith('Confirm') ? 'text-[#ff9500]' : 'text-[#ff3b30]'}`}>{removeCoinsMsg}</p>
                    )}
                  </div>

                  {/* Grant Skin */}
                  <div className="bg-[#f5f5f7] rounded-2xl p-4 border border-[#af52de]/10">
                    <h4 className="text-sm font-semibold text-[#af52de] mb-3 flex items-center gap-2"><Palette size={14} /> Grant Skin</h4>
                    <p className="text-xs text-[#86868b] mb-2">
                      Owned: {(selected.ownedNinjas || []).length}/{NINJA_SKINS.length} skins · {availableSkins.length} available to grant
                    </p>
                    <div className="flex gap-2">
                      <select
                        value={grantSkinId}
                        onChange={(e) => setGrantSkinId(e.target.value)}
                        className="flex-1 bg-white border border-[#d2d2d7] rounded-xl px-3 py-2 text-[#1d1d1f] text-sm focus:border-[#af52de] outline-none appearance-none"
                      >
                        <option value="">Select a skin...</option>
                        {availableSkins.map(skin => (
                          <option key={skin.id} value={skin.id}>
                            {skin.name} ({skin.tier})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={grantSkin}
                        disabled={grantSkinLoading || !grantSkinId}
                        className="px-4 py-2 bg-[#af52de] text-white rounded-xl font-medium text-sm hover:bg-[#af52de]/90 transition-all disabled:opacity-50"
                      >
                        {grantSkinLoading ? '...' : 'Grant'}
                      </button>
                    </div>
                    {grantSkinMsg && (
                      <p className={`text-xs mt-2 ${grantSkinMsg.startsWith('Granted') ? 'text-[#af52de]' : 'text-[#ff3b30]'}`}>{grantSkinMsg}</p>
                    )}
                  </div>

                  {/* Grant Item */}
                  <div className="bg-[#f5f5f7] rounded-2xl p-4 border border-[#0071e3]/10">
                    <h4 className="text-sm font-semibold text-[#0071e3] mb-3 flex items-center gap-2"><Gift size={14} /> Grant Item</h4>
                    <div className="flex gap-2">
                      <select
                        value={grantItemId}
                        onChange={(e) => setGrantItemId(e.target.value)}
                        className="flex-1 bg-white border border-[#d2d2d7] rounded-xl px-3 py-2 text-[#1d1d1f] text-sm focus:border-[#0071e3] outline-none appearance-none"
                      >
                        <option value="">Select an item...</option>
                        <optgroup label="Coins">
                          {CHEST_REWARDS.filter(r => r.type === 'coins').map(r => (
                            <option key={r.id} value={r.id}>{r.name} ({r.rarity})</option>
                          ))}
                        </optgroup>
                        <optgroup label="Vouchers">
                          {CHEST_REWARDS.filter(r => r.type === 'voucher').map(r => (
                            <option key={r.id} value={r.id}>{r.name} ({r.rarity})</option>
                          ))}
                        </optgroup>
                        <optgroup label="Skins">
                          {CHEST_REWARDS.filter(r => r.type === 'skin').map(r => (
                            <option key={r.id} value={r.id}>{r.name} ({r.rarity})</option>
                          ))}
                        </optgroup>
                      </select>
                      <button
                        onClick={grantItem}
                        disabled={grantItemLoading || !grantItemId}
                        className="px-4 py-2 bg-[#0071e3] text-white rounded-xl font-medium text-sm hover:bg-[#0077ED] transition-all disabled:opacity-50"
                      >
                        {grantItemLoading ? '...' : 'Grant'}
                      </button>
                    </div>
                    {grantItemMsg && (
                      <p className={`text-xs mt-2 ${grantItemMsg.startsWith('Granted') || grantItemMsg.startsWith('Added') ? 'text-[#0071e3]' : 'text-[#ff3b30]'}`}>{grantItemMsg}</p>
                    )}
                  </div>

                  {/* VIP Control */}
                  <div className="bg-[#f5f5f7] rounded-2xl p-4 border border-[#ff9500]/10">
                    <h4 className="text-sm font-semibold text-[#ff9500] mb-3 flex items-center gap-2"><Crown size={14} /> VIP Control</h4>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs text-[#86868b]">Status:</span>
                      <span className={`text-sm font-semibold ${selected.vip?.active ? 'text-[#ff9500]' : 'text-[#86868b]'}`}>
                        {selected.vip?.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                      {selected.vip?.active && selected.vip?.expiresAt && (
                        <span className="text-xs text-[#86868b]">
                          Expires: {new Date(selected.vip.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="text-[#86868b] text-[10px] font-medium block mb-1">Expiry Date (optional)</label>
                        <input
                          type="date"
                          value={vipExpiry}
                          onChange={(e) => setVipExpiry(e.target.value)}
                          className="w-full bg-white border border-[#d2d2d7] rounded-xl px-3 py-2 text-[#1d1d1f] text-sm focus:border-[#ff9500] outline-none"
                        />
                      </div>
                      {!selected.vip?.active ? (
                        <button
                          onClick={() => toggleVip(true)}
                          className="px-4 py-2 bg-[#ff9500] text-white rounded-xl font-medium text-sm hover:bg-[#ff9500]/90 transition-all"
                        >
                          Activate VIP
                        </button>
                      ) : (
                        <button
                          onClick={() => toggleVip(false)}
                          className="px-4 py-2 text-[#ff3b30] rounded-xl font-medium text-sm hover:bg-[#fff5f5] transition-all border border-[#d2d2d7]"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="bg-[#f5f5f7] rounded-2xl p-4 border border-[#ff3b30]/10">
                    <h4 className="text-sm font-semibold text-[#ff3b30] mb-3 flex items-center gap-2"><AlertTriangle size={14} /> Danger Zone</h4>
                    <div className="space-y-3">

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-[#1d1d1f]">Reset PIN</p>
                          <p className="text-[10px] text-[#86868b]">Player will set new 6-digit PIN on next login</p>
                        </div>
                        {!resetPinConfirm ? (
                          <button
                            onClick={() => setResetPinConfirm(true)}
                            className="flex items-center gap-1.5 px-3 py-2 text-[#ff9500] rounded-xl font-medium text-xs hover:bg-[#ff9500]/5 transition-all border border-[#d2d2d7]"
                          >
                            <Key size={14} /> Reset PIN
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={resetPin} className="px-3 py-2 bg-[#ff3b30] text-white rounded-xl font-medium text-xs hover:bg-[#ff3b30]/90">Confirm</button>
                            <button onClick={() => setResetPinConfirm(false)} className="px-3 py-2 border border-[#d2d2d7] rounded-xl text-[#86868b] text-xs hover:bg-white">Cancel</button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-[#1d1d1f]">Reset All Stats</p>
                          <p className="text-[10px] text-[#86868b]">Zeros out kills, deaths, wins, playtime, coins spent</p>
                        </div>
                        {!resetStatsConfirm ? (
                          <button
                            onClick={() => setResetStatsConfirm(true)}
                            className="flex items-center gap-1.5 px-3 py-2 text-[#ff3b30] rounded-xl font-medium text-xs hover:bg-[#fff5f5] transition-all border border-[#d2d2d7]"
                          >
                            <RotateCcw size={14} /> Reset Stats
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={resetStats} className="px-3 py-2 bg-[#ff3b30] text-white rounded-xl font-medium text-xs hover:bg-[#ff3b30]/90">Confirm</button>
                            <button onClick={() => setResetStatsConfirm(false)} className="px-3 py-2 border border-[#d2d2d7] rounded-xl text-[#86868b] text-xs hover:bg-white">Cancel</button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-[#1d1d1f]">{selected.banned ? 'Unban Player' : 'Ban Player'}</p>
                          <p className="text-[10px] text-[#86868b]">
                            {selected.banned
                              ? (selected.bannedUntil && selected.bannedUntil > 0
                                ? `Temp ban — ${getBanTimeRemaining(selected.bannedUntil) || 'expired'}`
                                : 'Permanently banned — restore access')
                              : 'Block player from logging in'}
                          </p>
                        </div>
                        {selected.banned ? (
                          <button
                            onClick={() => toggleBan(selected.uid, true)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-[#34c759]/10 text-[#34c759] hover:bg-[#34c759]/20 rounded-xl font-medium text-xs transition-all"
                          >
                            <ShieldCheck size={14} /> Unban
                          </button>
                        ) : (
                          <button
                            onClick={() => setShowBanOptions(!showBanOptions)}
                            className="flex items-center gap-1.5 px-3 py-2 text-[#ff3b30] hover:bg-[#fff5f5] rounded-xl font-medium text-xs transition-all border border-[#d2d2d7]"
                          >
                            <Ban size={14} /> Ban
                          </button>
                        )}
                      </div>

                      {showBanOptions && !selected.banned && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="mt-2 p-3 bg-white rounded-xl border border-[#ff3b30]/20"
                        >
                          <p className="text-xs text-[#86868b] mb-2 flex items-center gap-1"><Timer size={12} /> Select ban duration:</p>
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: '1 Hour', ms: 1000 * 60 * 60 },
                              { label: '6 Hours', ms: 1000 * 60 * 60 * 6 },
                              { label: '24 Hours', ms: 1000 * 60 * 60 * 24 },
                              { label: '7 Days', ms: 1000 * 60 * 60 * 24 * 7 },
                              { label: '30 Days', ms: 1000 * 60 * 60 * 24 * 30 },
                              { label: 'Permanent', ms: null as number | null },
                            ].map(opt => (
                              <button
                                key={opt.label}
                                onClick={() => timedBan(opt.ms)}
                                disabled={banLoading}
                                className={`py-2 rounded-xl font-medium text-[11px] transition-all disabled:opacity-50 ${
                                  opt.ms === null
                                    ? 'bg-[#ff3b30] text-white hover:bg-[#ff3b30]/90 col-span-3'
                                    : 'bg-[#ff3b30]/5 text-[#ff3b30] hover:bg-[#ff3b30]/10'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => setShowBanOptions(false)}
                            className="w-full mt-2 py-1.5 text-[#86868b] text-xs hover:text-[#1d1d1f] transition-all"
                          >
                            Cancel
                          </button>
                        </motion.div>
                      )}
                    </div>

                    {actionMsg && (
                      <p className={`text-xs mt-3 pt-3 border-t border-[#e5e5ea] ${actionMsg.includes('Failed') ? 'text-[#ff3b30]' : 'text-[#34c759]'}`}>{actionMsg}</p>
                    )}
                  </div>

                  {/* Player Notes */}
                  <div className="bg-white rounded-2xl p-4 border border-[#e5e5ea]/60">
                    <h4 className="text-sm font-semibold text-[#1d1d1f] mb-3 flex items-center gap-2"><FileText size={14} /> Admin Notes</h4>
                    <p className="text-[10px] text-[#86868b] mb-2">Private notes — only visible to admins</p>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add notes about this player..."
                      rows={4}
                      className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-3 py-2 text-[#1d1d1f] text-sm focus:border-[#0071e3] outline-none resize-none"
                    />
                    <div className="flex items-center justify-between mt-2">
                      <div>
                        {notesMsg && (
                          <p className={`text-xs ${notesMsg.includes('Failed') ? 'text-[#ff3b30]' : 'text-[#34c759]'}`}>{notesMsg}</p>
                        )}
                      </div>
                      <button
                        onClick={saveAdminNotes}
                        disabled={notesSaving}
                        className="flex items-center gap-1.5 px-4 py-2 bg-[#0071e3] text-white rounded-xl font-medium text-xs hover:bg-[#0077ED] transition-all disabled:opacity-50"
                      >
                        <Save size={14} /> {notesSaving ? 'Saving...' : 'Save Notes'}
                      </button>
                    </div>
                  </div>

                  {/* Player Merge */}
                  <div className="bg-[#f5f5f7] rounded-2xl p-4 border border-[#ff9500]/10">
                    <h4 className="text-sm font-semibold text-[#ff9500] mb-3 flex items-center gap-2"><Merge size={14} /> Merge Accounts</h4>
                    <p className="text-[10px] text-[#86868b] mb-3">
                      Search for a second account to merge INTO <span className="text-[#0071e3] font-semibold">{selected.username?.toUpperCase()}</span>. The source account will be deleted.
                    </p>

                    <div className="relative mb-2">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                      <input
                        value={mergeSearch}
                        onChange={(e) => { setMergeSearch(e.target.value); setMergeTarget(null); setMergePreview(false); setMergeConfirm(false); }}
                        placeholder="Search player to merge from..."
                        className="w-full bg-white border border-[#d2d2d7] rounded-xl pl-9 pr-4 py-2 text-[#1d1d1f] text-sm focus:border-[#ff9500] outline-none"
                      />
                    </div>

                    {mergeSearch && !mergeTarget && mergeFilteredPlayers.length > 0 && (
                      <div className="space-y-1 mb-3 max-h-[200px] overflow-y-auto">
                        {mergeFilteredPlayers.map(p => (
                          <button
                            key={p.uid}
                            onClick={() => { setMergeTarget(p); setMergePreview(true); }}
                            className="w-full flex items-center gap-3 p-2 bg-white rounded-xl border border-[#e5e5ea]/60 hover:border-[#ff9500]/30 transition-all text-left"
                          >
                            <NinjaAvatar skinColor={p.character?.skinColor || '#8D6E63'} outfitColor="#333" size={28} animated={false} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-[#1d1d1f] truncate">{p.username?.toUpperCase()}</p>
                              <p className="text-[10px] text-[#86868b]">{Math.floor(p.coins || 0)} coins · {(p.inventory || []).length} items</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {mergeSearch && !mergeTarget && mergeFilteredPlayers.length === 0 && (
                      <p className="text-xs text-[#86868b] mb-3">No players found</p>
                    )}

                    {mergeTarget && mergePreview && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl p-4 border border-[#ff9500]/20 mb-3"
                      >
                        <div className="flex items-center justify-center gap-4 mb-4">
                          <div className="text-center">
                            <NinjaAvatar skinColor={mergeTarget.character?.skinColor || '#8D6E63'} outfitColor="#333" size={40} animated={false} />
                            <p className="text-xs font-semibold text-[#ff3b30] mt-1">{mergeTarget.username?.toUpperCase()}</p>
                            <p className="text-[9px] text-[#86868b]">SOURCE (deleted)</p>
                          </div>
                          <div className="text-2xl text-[#ff9500]">→</div>
                          <div className="text-center">
                            <NinjaAvatar skinColor={selected.character?.skinColor || '#8D6E63'} outfitColor="#333" size={40} animated={false} />
                            <p className="text-xs font-semibold text-[#34c759] mt-1">{selected.username?.toUpperCase()}</p>
                            <p className="text-[9px] text-[#86868b]">TARGET (kept)</p>
                          </div>
                        </div>

                        <h5 className="text-[10px] font-semibold text-[#ff9500] mb-2">Merge Preview</h5>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between py-1 border-b border-[#e5e5ea]">
                            <span className="text-[#86868b]">Coins</span>
                            <span className="text-[#1d1d1f]">{Math.floor(selected.coins || 0)} + {Math.floor(mergeTarget.coins || 0)} = <span className="text-[#34c759]">{Math.floor((selected.coins || 0) + (mergeTarget.coins || 0))}</span></span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-[#e5e5ea]">
                            <span className="text-[#86868b]">Inventory</span>
                            <span className="text-[#1d1d1f]">{(selected.inventory || []).length} + {(mergeTarget.inventory || []).length} = <span className="text-[#34c759]">{(selected.inventory || []).length + (mergeTarget.inventory || []).length}</span> items</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-[#e5e5ea]">
                            <span className="text-[#86868b]">Skins</span>
                            <span className="text-[#1d1d1f]">{(selected.ownedNinjas || []).length} + {(mergeTarget.ownedNinjas || []).length} → <span className="text-[#34c759]">{Array.from(new Set([...(selected.ownedNinjas || []), ...(mergeTarget.ownedNinjas || [])])).length}</span> unique</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-[#e5e5ea]">
                            <span className="text-[#86868b]">Friends</span>
                            <span className="text-[#1d1d1f]">{(selected.friends || []).length} + {(mergeTarget.friends || []).length} → <span className="text-[#34c759]">{Array.from(new Set([...(selected.friends || []), ...(mergeTarget.friends || [])].filter(id => id !== selected.uid && id !== mergeTarget.uid))).length}</span> unique</span>
                          </div>
                          <div className="flex justify-between py-1 border-b border-[#e5e5ea]">
                            <span className="text-[#86868b]">Kills</span>
                            <span className="text-[#34c759]">{(selected.stats?.totalKills || 0) + (mergeTarget.stats?.totalKills || 0)}</span>
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-[#86868b]">Playtime</span>
                            <span className="text-[#34c759]">{Math.floor(((selected.totalPlaytime || 0) + (mergeTarget.totalPlaytime || 0)) / 60)}h</span>
                          </div>
                        </div>

                        <div className="mt-3 p-2 bg-[#ff3b30]/5 border border-[#ff3b30]/20 rounded-xl flex items-start gap-2">
                          <AlertTriangle size={16} className="text-[#ff3b30] shrink-0 mt-0.5" />
                          <div>
                            <p className="text-[10px] font-semibold text-[#ff3b30]">Warning: Irreversible</p>
                            <p className="text-[10px] text-[#ff3b30]/70">
                              The account "{mergeTarget.username}" will be permanently deleted. All their data will be merged into "{selected.username}". This cannot be undone.
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2 mt-3">
                          {!mergeConfirm ? (
                            <button
                              onClick={() => setMergeConfirm(true)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#ff9500] text-white rounded-xl font-medium text-xs hover:bg-[#ff9500]/90 transition-all"
                            >
                              <Merge size={14} /> Merge Accounts
                            </button>
                          ) : (
                            <button
                              onClick={executeMerge}
                              disabled={mergeLoading}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#ff3b30] text-white rounded-xl font-medium text-xs hover:bg-[#ff3b30]/90 transition-all disabled:opacity-50 animate-pulse"
                            >
                              {mergeLoading ? 'Merging...' : 'Confirm — Delete & Merge'}
                            </button>
                          )}
                          <button
                            onClick={() => { setMergeTarget(null); setMergePreview(false); setMergeConfirm(false); setMergeSearch(''); }}
                            className="px-4 py-2 border border-[#d2d2d7] rounded-xl text-[#86868b] text-xs hover:bg-[#f5f5f7] transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {mergeMsg && (
                      <p className={`text-xs mt-2 ${mergeMsg.includes('Failed') ? 'text-[#ff3b30]' : 'text-[#34c759]'}`}>{mergeMsg}</p>
                    )}
                  </div>

                </div>
              )}

            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
