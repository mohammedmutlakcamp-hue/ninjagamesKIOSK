'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, onSnapshot, doc, updateDoc, addDoc, query, orderBy, Timestamp,
  where, getDocs, serverTimestamp
} from 'firebase/firestore';
import {
  Shield, AlertTriangle, CheckCircle2, Clock, Eye, MessageSquare,
  Ban, X, Filter, ChevronDown, User, Flag, Search, FileWarning
} from 'lucide-react';

interface PlayerReport {
  id: string;
  reporterId: string;
  reporterName: string;
  reportedId: string;
  reportedName: string;
  reason: string;
  details: string;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: any;
  adminNotes: string;
  reviewedAt: any;
}

type StatusFilter = 'all' | 'pending' | 'reviewed' | 'resolved';

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'text-[#ff9500]', bg: 'bg-[#ff9500]/10', border: 'border-[#ff9500]/20', icon: <Clock size={14} /> },
  reviewed: { label: 'Reviewed', color: 'text-[#0071e3]', bg: 'bg-[#0071e3]/10', border: 'border-[#0071e3]/20', icon: <Eye size={14} /> },
  resolved: { label: 'Resolved', color: 'text-[#34c759]', bg: 'bg-[#34c759]/10', border: 'border-[#34c759]/20', icon: <CheckCircle2 size={14} /> },
};

export function PlayerReports() {
  const [reports, setReports] = useState<PlayerReport[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selectedReport, setSelectedReport] = useState<PlayerReport | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  // Real-time listener
  useEffect(() => {
    const q = query(collection(db, 'player-reports'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as PlayerReport));
      setReports(data);
      setLoading(false);
    }, (err) => {
      console.error('Reports listener error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);

  const stats = {
    total: reports.length,
    pending: reports.filter(r => r.status === 'pending').length,
    reviewed: reports.filter(r => r.status === 'reviewed').length,
    resolved: reports.filter(r => r.status === 'resolved').length,
    thisWeek: reports.filter(r => {
      const ts = r.createdAt instanceof Timestamp ? r.createdAt.toMillis() : (r.createdAt || 0);
      return ts > Date.now() - 7 * 24 * 60 * 60 * 1000;
    }).length,
  };

  async function updateReportStatus(reportId: string, status: 'reviewed' | 'resolved', notes?: string) {
    setActionLoading(true);
    try {
      const updateData: any = { status, reviewedAt: Date.now() };
      if (notes !== undefined) updateData.adminNotes = notes;
      await updateDoc(doc(db, 'player-reports', reportId), updateData);
      if (selectedReport?.id === reportId) {
        setSelectedReport(prev => prev ? { ...prev, status, adminNotes: notes || prev.adminNotes } : null);
      }
    } catch (err) {
      console.error('Failed to update report:', err);
    }
    setActionLoading(false);
  }

  async function warnPlayer(playerId: string, playerName: string) {
    setActionLoading(true);
    try {
      // Add warning to player doc
      const playerRef = doc(db, 'players', playerId);
      const playerSnap = await getDocs(query(collection(db, 'players'), where('__name__', '==', playerId)));
      if (!playerSnap.empty) {
        const playerData = playerSnap.docs[0].data();
        const warnings = (playerData.warnings || 0) + 1;
        await updateDoc(playerRef, {
          warnings,
          lastWarning: Date.now(),
          lastWarningReason: `Warning issued from player report`,
        });
      }
      // Update report
      if (selectedReport) {
        await updateReportStatus(selectedReport.id, 'resolved', `${adminNotes}\n[ACTION] Warned player ${playerName}`);
      }
    } catch (err) {
      console.error('Failed to warn player:', err);
    }
    setActionLoading(false);
  }

  async function banPlayer(playerId: string, playerName: string, permanent: boolean) {
    setActionLoading(true);
    try {
      const playerRef = doc(db, 'players', playerId);
      const banData: any = {
        banned: true,
        banType: permanent ? 'permanent' : 'temporary',
        bannedAt: Date.now(),
        banReason: `Banned from player report`,
      };
      if (!permanent) {
        banData.banExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
      }
      await updateDoc(playerRef, banData);
      if (selectedReport) {
        const banLabel = permanent ? 'PERMANENT BAN' : 'TEMP BAN (7 days)';
        await updateReportStatus(selectedReport.id, 'resolved', `${adminNotes}\n[ACTION] ${banLabel} on ${playerName}`);
      }
    } catch (err) {
      console.error('Failed to ban player:', err);
    }
    setActionLoading(false);
  }

  function formatTime(ts: any) {
    if (!ts) return 'Unknown';
    const ms = ts instanceof Timestamp ? ts.toMillis() : ts;
    const date = new Date(ms);
    const now = Date.now();
    const diff = now - ms;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
          <Shield size={32} className="text-[#0071e3]" />
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-3">
          <Shield size={24} className="text-[#0071e3]" /> Player Reports
        </h2>
        <p className="text-[#86868b] text-sm mt-1">Review and manage player reports. Take action on violations.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Total Reports', value: stats.total, color: 'text-[#1d1d1f]' },
          { label: 'Pending', value: stats.pending, color: 'text-[#ff9500]' },
          { label: 'Reviewed', value: stats.reviewed, color: 'text-[#0071e3]' },
          { label: 'Resolved', value: stats.resolved, color: 'text-[#34c759]' },
          { label: 'This Week', value: stats.thisWeek, color: 'text-[#af52de]' },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
          >
            <p className={`text-2xl font-semibold ${card.color}`}>{card.value}</p>
            <p className="text-[#86868b] text-xs">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative">
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-[#d2d2d7] text-sm text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors"
          >
            <Filter size={14} className="text-[#86868b]" />
            {filter === 'all' ? 'All Reports' : STATUS_CONFIG[filter].label}
            <ChevronDown size={14} className="text-[#86868b]" />
          </button>
          {showFilterMenu && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute top-full left-0 mt-1 w-44 bg-white rounded-xl border border-[#e5e5ea] shadow-[0_4px_12px_rgba(0,0,0,0.1)] overflow-hidden z-20"
            >
              {(['all', 'pending', 'reviewed', 'resolved'] as StatusFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setShowFilterMenu(false); }}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    filter === f ? 'text-[#0071e3] bg-[#0071e3]/5' : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'
                  }`}
                >
                  {f === 'all' ? 'All Reports' : STATUS_CONFIG[f].label}
                  {f !== 'all' && (
                    <span className="ml-2 text-xs text-[#86868b]">
                      ({f === 'pending' ? stats.pending : f === 'reviewed' ? stats.reviewed : stats.resolved})
                    </span>
                  )}
                </button>
              ))}
            </motion.div>
          )}
        </div>
        <span className="text-xs text-[#86868b]">{filtered.length} report{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Report Queue */}
        <div className="xl:col-span-2 space-y-3">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
              <FileWarning size={48} className="text-[#d2d2d7] mx-auto mb-3" />
              <p className="text-[#86868b]">No reports {filter !== 'all' ? `with status "${filter}"` : 'yet'}</p>
            </div>
          ) : (
            filtered.map((report, i) => {
              const statusCfg = STATUS_CONFIG[report.status];
              return (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => { setSelectedReport(report); setAdminNotes(report.adminNotes || ''); }}
                  className={`bg-white rounded-2xl p-5 border cursor-pointer transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] ${
                    selectedReport?.id === report.id ? 'border-[#0071e3] ring-1 ring-[#0071e3]/20' : 'border-[#e5e5ea]/60'
                  } ${report.status === 'pending' ? 'border-l-2 border-l-[#ff9500]' : ''} shadow-[0_1px_3px_rgba(0,0,0,0.04)]`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#ff3b30]/10 flex items-center justify-center">
                        <Flag size={16} className="text-[#ff3b30]" />
                      </div>
                      <div>
                        <p className="text-sm text-[#1d1d1f]">
                          <span className="text-[#86868b]">Report against</span>{' '}
                          <span className="text-[#ff3b30] font-medium">{report.reportedName}</span>
                        </p>
                        <p className="text-xs text-[#86868b]">
                          by {report.reporterName} &middot; {formatTime(report.createdAt)}
                        </p>
                      </div>
                    </div>
                    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${statusCfg.bg} ${statusCfg.color} border ${statusCfg.border}`}>
                      {statusCfg.icon} {statusCfg.label}
                    </span>
                  </div>
                  <div className="ml-12">
                    <p className="text-sm text-[#ff9500] mb-1">{report.reason}</p>
                    {report.details && (
                      <p className="text-xs text-[#86868b] line-clamp-2">{report.details}</p>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Detail Panel */}
        <div className="xl:col-span-1">
          {selectedReport ? (
            <motion.div
              key={selectedReport.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60 sticky top-8"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-semibold text-[#1d1d1f]">Report Details</h3>
                <button onClick={() => setSelectedReport(null)} className="text-[#86868b] hover:text-[#1d1d1f] transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Players */}
              <div className="space-y-3 mb-5">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#f5f5f7]">
                  <User size={16} className="text-[#86868b]" />
                  <div>
                    <p className="text-[10px] text-[#86868b] uppercase tracking-wide">Reporter</p>
                    <p className="text-sm text-[#1d1d1f]">{selectedReport.reporterName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#ff3b30]/5 border border-[#ff3b30]/10">
                  <AlertTriangle size={16} className="text-[#ff3b30]" />
                  <div>
                    <p className="text-[10px] text-[#86868b] uppercase tracking-wide">Reported Player</p>
                    <p className="text-sm text-[#ff3b30] font-medium">{selectedReport.reportedName}</p>
                  </div>
                </div>
              </div>

              {/* Reason & Details */}
              <div className="mb-5">
                <p className="text-[10px] text-[#86868b] uppercase tracking-wide mb-1">Reason</p>
                <p className="text-sm text-[#ff9500]">{selectedReport.reason}</p>
              </div>
              {selectedReport.details && (
                <div className="mb-5">
                  <p className="text-[10px] text-[#86868b] uppercase tracking-wide mb-1">Details</p>
                  <p className="text-sm text-[#86868b]">{selectedReport.details}</p>
                </div>
              )}

              {/* Time */}
              <div className="mb-5 flex items-center gap-2 text-xs text-[#86868b]">
                <Clock size={12} /> {formatTime(selectedReport.createdAt)}
              </div>

              {/* Admin Notes */}
              <div className="mb-5">
                <label className="text-[10px] text-[#86868b] uppercase tracking-wide block mb-1">Admin Notes</label>
                <textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  rows={3}
                  className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-sm text-[#1d1d1f] resize-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                  placeholder="Add notes about this report..."
                />
              </div>

              {/* Status Change */}
              {selectedReport.status !== 'resolved' && (
                <div className="mb-5 flex gap-2">
                  {selectedReport.status === 'pending' && (
                    <button
                      onClick={() => updateReportStatus(selectedReport.id, 'reviewed', adminNotes)}
                      disabled={actionLoading}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#0071e3]/10 border border-[#0071e3]/20 text-[#0071e3] text-sm font-medium hover:bg-[#0071e3]/15 transition-colors disabled:opacity-50"
                    >
                      <Eye size={14} /> Mark Reviewed
                    </button>
                  )}
                  <button
                    onClick={() => updateReportStatus(selectedReport.id, 'resolved', adminNotes)}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#34c759]/10 border border-[#34c759]/20 text-[#34c759] text-sm font-medium hover:bg-[#34c759]/15 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} /> Resolve
                  </button>
                </div>
              )}

              {/* Quick Actions */}
              <div className="border-t border-[#e5e5ea]/60 pt-4">
                <p className="text-[10px] text-[#86868b] uppercase tracking-wide mb-3">Quick Actions</p>
                <div className="space-y-2">
                  <button
                    onClick={() => warnPlayer(selectedReport.reportedId, selectedReport.reportedName)}
                    disabled={actionLoading}
                    className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl bg-[#ff9500]/10 border border-[#ff9500]/20 text-[#ff9500] text-sm font-medium hover:bg-[#ff9500]/15 transition-colors disabled:opacity-50"
                  >
                    <AlertTriangle size={14} /> Warn Player
                  </button>
                  <button
                    onClick={() => banPlayer(selectedReport.reportedId, selectedReport.reportedName, false)}
                    disabled={actionLoading}
                    className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl border border-[#d2d2d7] text-[#ff9500] text-sm font-medium hover:bg-[#fff5f5] transition-colors disabled:opacity-50"
                  >
                    <Ban size={14} /> Temp Ban (7 days)
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Permanently ban ${selectedReport.reportedName}? This cannot be undone easily.`)) {
                        banPlayer(selectedReport.reportedId, selectedReport.reportedName, true);
                      }
                    }}
                    disabled={actionLoading}
                    className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl text-[#ff3b30] border border-[#d2d2d7] hover:bg-[#fff5f5] text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    <Ban size={14} /> Permanent Ban
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="bg-white rounded-2xl p-8 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60">
              <Shield size={40} className="text-[#d2d2d7] mx-auto mb-3" />
              <p className="text-[#86868b] text-sm">Select a report to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
