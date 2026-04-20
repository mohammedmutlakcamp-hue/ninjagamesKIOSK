'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, query, where, getDocs, addDoc, orderBy, limit,
  onSnapshot, Timestamp
} from 'firebase/firestore';
import {
  Search, Printer, FileText, Coins, User, Clock, Hash,
  Receipt, Plus, ChevronRight, X, Loader2, CreditCard,
  Calendar, CheckCircle, Zap
} from 'lucide-react';
import { HelpTip } from './HelpTip';

interface TopUpRecord {
  id: string;
  playerId: string;
  playerName: string;
  coins: number;
  priceJOD: number;
  status: string;
  createdAt: number;
  approvedAt?: number;
}

interface ReceiptData {
  id?: string;
  receiptNumber: string;
  playerName: string;
  playerId: string;
  coins: number;
  priceJOD: number;
  createdAt: number;
  items: string;
}

type Tab = 'search' | 'quick' | 'history';

function generateReceiptNumber(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `NJ-${y}${m}${d}-${rand}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(ts: number): string {
  return `${formatDate(ts)} ${formatTime(ts)}`;
}

// ─── Printable Receipt Component ───────────────────────────────
function PrintableReceipt({ receipt }: { receipt: ReceiptData }) {
  return (
    <div className="receipt-print-area" style={{
      width: '300px',
      margin: '0 auto',
      padding: '24px 16px',
      fontFamily: "'Segoe UI', Arial, sans-serif",
      color: '#000',
      background: '#fff',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '16px', borderBottom: '2px dashed #ccc', paddingBottom: '16px' }}>
        <div style={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '2px', marginBottom: '4px' }}>
          NINJA GAMES
        </div>
        <div style={{ fontSize: '11px', color: '#666' }}>Amman, Jordan</div>
        <div style={{ fontSize: '11px', color: '#666' }}>www.ninjagamesjo.com</div>
      </div>

      {/* Receipt Info */}
      <div style={{ marginBottom: '12px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#666' }}>Receipt #:</span>
          <span style={{ fontWeight: 'bold' }}>{receipt.receiptNumber}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#666' }}>Date:</span>
          <span>{formatDate(receipt.createdAt)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#666' }}>Time:</span>
          <span>{formatTime(receipt.createdAt)}</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px dashed #ccc', margin: '12px 0' }} />

      {/* Player */}
      <div style={{ marginBottom: '12px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#666' }}>Player:</span>
          <span style={{ fontWeight: 'bold' }}>{receipt.playerName}</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px dashed #ccc', margin: '12px 0' }} />

      {/* Items */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#666', marginBottom: '8px', textTransform: 'uppercase' }}>
          Items
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
          <span>Coin Top-Up</span>
          <span style={{ fontWeight: 'bold' }}>{receipt.priceJOD.toFixed(2)} JOD</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' }}>
          <span>Coins:</span>
          <span>{receipt.coins.toLocaleString()} coins</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '2px solid #000', margin: '12px 0' }} />

      {/* Total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold', marginBottom: '4px' }}>
        <span>TOTAL</span>
        <span>{receipt.priceJOD.toFixed(2)} JOD</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666', marginBottom: '12px' }}>
        <span>Payment:</span>
        <span>Cash</span>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px dashed #ccc', margin: '12px 0' }} />

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
        Thank you for playing!
      </div>
      <div style={{ textAlign: 'center', fontSize: '10px', color: '#999' }}>
        Keep this receipt for your records
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────
export function InvoiceGenerator() {
  const [tab, setTab] = useState<Tab>('search');

  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<any>(null);
  const [topUps, setTopUps] = useState<TopUpRecord[]>([]);
  const [loadingTopUps, setLoadingTopUps] = useState(false);
  const [selectedTopUp, setSelectedTopUp] = useState<TopUpRecord | null>(null);

  // Quick receipt state
  const [quickName, setQuickName] = useState('');
  const [quickCoins, setQuickCoins] = useState('');
  const [quickPrice, setQuickPrice] = useState('');

  // Receipt preview
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptData | null>(null);
  const [saving, setSaving] = useState(false);

  // History
  const [receiptHistory, setReceiptHistory] = useState<ReceiptData[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  // Load receipt history
  useEffect(() => {
    if (tab !== 'history') return;
    setLoadingHistory(true);
    const q = query(collection(db, 'receipts'), orderBy('createdAt', 'desc'), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as ReceiptData));
      setReceiptHistory(data);
      setLoadingHistory(false);
    });
    return () => unsub();
  }, [tab]);

  // Search players
  const searchPlayers = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const snap = await getDocs(collection(db, 'players'));
      const q = searchQuery.toLowerCase();
      const results = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter((p: any) => p.username?.toLowerCase().includes(q));
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
    }
    setSearching(false);
  };

  // Load approved top-ups for selected player
  const selectPlayer = async (player: any) => {
    setSelectedPlayer(player);
    setSearchResults([]);
    setLoadingTopUps(true);
    try {
      const q = query(
        collection(db, 'topup-requests'),
        where('playerId', '==', player.uid),
        where('status', '==', 'approved')
      );
      const snap = await getDocs(q);
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as TopUpRecord))
        .sort((a, b) => b.createdAt - a.createdAt);
      setTopUps(data);
    } catch (err) {
      console.error('Failed to load top-ups:', err);
    }
    setLoadingTopUps(false);
  };

  // Generate receipt from top-up
  const generateFromTopUp = (topUp: TopUpRecord) => {
    setSelectedTopUp(topUp);
    setPreviewReceipt({
      receiptNumber: generateReceiptNumber(),
      playerName: topUp.playerName,
      playerId: topUp.playerId,
      coins: topUp.coins,
      priceJOD: topUp.priceJOD,
      createdAt: Date.now(),
      items: 'Coin Top-Up',
    });
  };

  // Generate quick receipt
  const generateQuickReceipt = () => {
    if (!quickName.trim() || !quickCoins || !quickPrice) return;
    setPreviewReceipt({
      receiptNumber: generateReceiptNumber(),
      playerName: quickName.trim(),
      playerId: 'manual',
      coins: parseInt(quickCoins),
      priceJOD: parseFloat(quickPrice),
      createdAt: Date.now(),
      items: 'Coin Top-Up',
    });
  };

  // Save receipt to Firestore
  const saveReceipt = async () => {
    if (!previewReceipt) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'receipts'), {
        receiptNumber: previewReceipt.receiptNumber,
        playerName: previewReceipt.playerName,
        playerId: previewReceipt.playerId,
        coins: previewReceipt.coins,
        priceJOD: previewReceipt.priceJOD,
        createdAt: previewReceipt.createdAt,
        items: previewReceipt.items,
      });
    } catch (err) {
      console.error('Failed to save receipt:', err);
    }
    setSaving(false);
  };

  // Print receipt
  const handlePrint = async () => {
    // Save first if not already saved
    await saveReceipt();

    // Open print dialog
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt - ${previewReceipt?.receiptNumber}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #fff; }
          @media print {
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // View history receipt
  const viewHistoryReceipt = (r: ReceiptData) => {
    setPreviewReceipt(r);
  };

  const timeSince = (ts: number) => {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  const resetSearch = () => {
    setSelectedPlayer(null);
    setTopUps([]);
    setSelectedTopUp(null);
    setSearchQuery('');
    setSearchResults([]);
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            Invoice Generator
            <HelpTip title={{ en: 'Invoices', ar: 'الفواتير' }}
              ar={<p>أنشئ فواتير للطباعة للشحن أو الطلبات أو الحجوزات. التصدير PDF.</p>}>
              <p>Generate printable invoices for top-ups, food/hubbly orders, or reservations. Export to PDF.</p>
            </HelpTip>
          </h2>
          <p className="text-[#86868b] text-sm">Generate and print receipts for top-ups</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {([
          { key: 'search' as Tab, label: 'Search Player', icon: Search },
          { key: 'quick' as Tab, label: 'Quick Receipt', icon: Zap },
          { key: 'history' as Tab, label: 'Receipt History', icon: Clock },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPreviewReceipt(null); }}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 transition-all ${
              tab === t.key
                ? 'bg-[#0071e3] text-white'
                : 'bg-white border border-[#d2d2d7] text-[#86868b] hover:text-[#1d1d1f] hover:border-[#86868b]'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Left -- Input */}
        <div>
          {/* ── Search Player Tab ────────────────────────────── */}
          {tab === 'search' && (
            <div>
              {!selectedPlayer ? (
                <>
                  {/* Search bar */}
                  <div className="flex gap-2 mb-4">
                    <div className="flex-1 relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchPlayers()}
                        placeholder="Search by username..."
                        className="w-full pl-10 pr-4 py-3 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                      />
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={searchPlayers}
                      disabled={searching}
                      className="px-5 py-3 bg-[#0071e3] text-white rounded-xl font-medium flex items-center gap-2 hover:bg-[#0077ED] transition-all disabled:opacity-50"
                    >
                      {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                      Search
                    </motion.button>
                  </div>

                  {/* Results */}
                  {searchResults.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-[#86868b] mb-2">{searchResults.length} players found</p>
                      {searchResults.map((p: any) => (
                        <motion.button
                          key={p.uid}
                          whileHover={{ scale: 1.01 }}
                          onClick={() => selectPlayer(p)}
                          className="w-full bg-white rounded-xl p-4 border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center justify-between hover:border-[#0071e3]/30 transition-all text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#0071e3]/10 flex items-center justify-center">
                              <User size={18} className="text-[#0071e3]" />
                            </div>
                            <div>
                              <span className="font-medium text-[#1d1d1f]">{p.username}</span>
                              <p className="text-xs text-[#86868b]">{p.coins?.toLocaleString() || 0} coins</p>
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-[#86868b]" />
                        </motion.button>
                      ))}
                    </div>
                  )}

                  {searchResults.length === 0 && searchQuery && !searching && (
                    <div className="text-center py-8">
                      <User size={32} className="text-[#d2d2d7] mx-auto mb-2" />
                      <p className="text-[#86868b] text-sm">No players found</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Selected player header */}
                  <div className="bg-white rounded-xl p-4 border border-[#0071e3]/20 shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#0071e3]/10 flex items-center justify-center">
                        <User size={18} className="text-[#0071e3]" />
                      </div>
                      <div>
                        <span className="font-medium text-[#1d1d1f] text-lg">{selectedPlayer.username}</span>
                        <p className="text-xs text-[#86868b]">{selectedPlayer.coins?.toLocaleString() || 0} coins</p>
                      </div>
                    </div>
                    <button onClick={resetSearch} className="text-[#86868b] hover:text-[#1d1d1f] transition-colors">
                      <X size={18} />
                    </button>
                  </div>

                  {/* Top-up history */}
                  <h3 className="text-sm text-[#86868b] mb-3 flex items-center gap-2 font-medium">
                    <Coins size={14} /> Approved Top-Ups
                  </h3>

                  {loadingTopUps ? (
                    <div className="text-center py-8">
                      <Loader2 size={24} className="animate-spin text-[#86868b] mx-auto" />
                    </div>
                  ) : topUps.length > 0 ? (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                      {topUps.map((tu) => (
                        <motion.button
                          key={tu.id}
                          whileHover={{ scale: 1.01 }}
                          onClick={() => generateFromTopUp(tu)}
                          className={`w-full bg-white rounded-xl p-4 border flex items-center justify-between transition-all text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${
                            selectedTopUp?.id === tu.id ? 'border-[#0071e3]/50 bg-[#0071e3]/5' : 'border-[#e5e5ea]/60 hover:border-[#0071e3]/20'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-[#34c759]/10 flex items-center justify-center">
                              <Coins size={16} className="text-[#34c759]" />
                            </div>
                            <div>
                              <span className="text-[#0071e3] text-sm font-medium">{tu.coins.toLocaleString()} coins</span>
                              <p className="text-xs text-[#86868b]">{tu.priceJOD} JOD</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-[#86868b]">{timeSince(tu.createdAt)}</span>
                            <p className="text-[10px] text-[#0071e3] font-medium">SELECT</p>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Receipt size={32} className="text-[#d2d2d7] mx-auto mb-2" />
                      <p className="text-[#86868b] text-sm">No approved top-ups found</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Quick Receipt Tab ────────────────────────────── */}
          {tab === 'quick' && (
            <div className="space-y-4">
              <p className="text-[#86868b] text-sm mb-2">Generate a receipt without searching. Enter details manually.</p>

              <div>
                <label className="text-xs text-[#86868b] mb-1 block font-medium uppercase tracking-wider">Player Name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                  <input
                    type="text"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    placeholder="Enter player name..."
                    className="w-full pl-10 pr-4 py-3 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#86868b] mb-1 block font-medium uppercase tracking-wider">Coins</label>
                  <div className="relative">
                    <Coins size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                    <input
                      type="number"
                      value={quickCoins}
                      onChange={(e) => setQuickCoins(e.target.value)}
                      placeholder="100"
                      className="w-full pl-10 pr-4 py-3 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[#86868b] mb-1 block font-medium uppercase tracking-wider">Price (JOD)</label>
                  <div className="relative">
                    <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
                    <input
                      type="number"
                      step="0.5"
                      value={quickPrice}
                      onChange={(e) => setQuickPrice(e.target.value)}
                      placeholder="1.00"
                      className="w-full pl-10 pr-4 py-3 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Quick presets */}
              <div>
                <label className="text-xs text-[#86868b] mb-2 block font-medium uppercase tracking-wider">Quick Presets</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { coins: 100, price: 1 },
                    { coins: 550, price: 5 },
                    { coins: 1150, price: 10 },
                  ].map((p) => (
                    <button
                      key={p.coins}
                      onClick={() => { setQuickCoins(String(p.coins)); setQuickPrice(String(p.price)); }}
                      className={`bg-white rounded-xl p-3 border transition-all text-center hover:border-[#0071e3]/30 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${
                        quickCoins === String(p.coins) ? 'border-[#0071e3]/50 bg-[#0071e3]/5' : 'border-[#e5e5ea]/60'
                      }`}
                    >
                      <p className="text-[#0071e3] text-sm font-medium">{p.coins}</p>
                      <p className="text-xs text-[#86868b]">{p.price} JOD</p>
                    </button>
                  ))}
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={generateQuickReceipt}
                disabled={!quickName.trim() || !quickCoins || !quickPrice}
                className="w-full py-3 bg-[#0071e3] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#0077ED] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <FileText size={16} />
                Generate Receipt
              </motion.button>
            </div>
          )}

          {/* ── Receipt History Tab ──────────────────────────── */}
          {tab === 'history' && (
            <div>
              <h3 className="text-sm text-[#86868b] mb-3 flex items-center gap-2 font-medium">
                <Clock size={14} /> Last 20 Receipts
              </h3>

              {loadingHistory ? (
                <div className="text-center py-8">
                  <Loader2 size={24} className="animate-spin text-[#86868b] mx-auto" />
                </div>
              ) : receiptHistory.length > 0 ? (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {receiptHistory.map((r) => (
                    <motion.button
                      key={r.id || r.receiptNumber}
                      whileHover={{ scale: 1.01 }}
                      onClick={() => viewHistoryReceipt(r)}
                      className={`w-full bg-white rounded-xl px-4 py-3 border flex items-center justify-between transition-all text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${
                        previewReceipt?.receiptNumber === r.receiptNumber ? 'border-[#0071e3]/50 bg-[#0071e3]/5' : 'border-[#e5e5ea]/60 hover:border-[#d2d2d7]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#0071e3]/10 flex items-center justify-center">
                          <Receipt size={14} className="text-[#0071e3]" />
                        </div>
                        <div>
                          <span className="font-medium text-[#1d1d1f] text-sm">{r.playerName}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#34c759]">{r.coins.toLocaleString()} coins</span>
                            <span className="text-xs text-[#d2d2d7]">-</span>
                            <span className="text-xs text-[#1d1d1f]">{r.priceJOD} JOD</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-[#86868b]">{r.receiptNumber}</span>
                        <p className="text-[10px] text-[#86868b]">{timeSince(r.createdAt)}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Receipt size={40} className="text-[#d2d2d7] mx-auto mb-3" />
                  <p className="text-[#86868b] font-medium">No Receipts Yet</p>
                  <p className="text-[#86868b] text-sm mt-1">Generated receipts will appear here</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right -- Receipt Preview */}
        <div>
          {previewReceipt ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm text-[#86868b] flex items-center gap-2 font-medium">
                  <FileText size={14} /> Receipt Preview
                </h3>
                <button
                  onClick={() => setPreviewReceipt(null)}
                  className="text-[#86868b] hover:text-[#1d1d1f] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Receipt card with white background */}
              <div className="rounded-2xl overflow-hidden border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <div ref={printRef} className="bg-white">
                  <PrintableReceipt receipt={previewReceipt} />
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handlePrint}
                  disabled={saving}
                  className="flex-1 py-3 bg-[#0071e3] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#0077ED] transition-all disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                  {saving ? 'Saving...' : 'Print Receipt'}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={saveReceipt}
                  disabled={saving}
                  className="px-5 py-3 bg-white border border-[#d2d2d7] text-[#1d1d1f] rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-[#f5f5f7] transition-all disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Save
                </motion.button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center">
                <Receipt size={48} className="text-[#d2d2d7] mx-auto mb-4" />
                <p className="text-lg text-[#86868b] font-medium">No Receipt Selected</p>
                <p className="text-[#86868b] mt-2 text-sm">
                  {tab === 'search' ? 'Search a player and select a top-up' :
                   tab === 'quick' ? 'Fill in the details and generate' :
                   'Click a receipt to preview'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
