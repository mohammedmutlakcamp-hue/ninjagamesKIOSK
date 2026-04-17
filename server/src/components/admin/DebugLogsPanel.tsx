'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, deleteDoc, query, orderBy, limit } from 'firebase/firestore';
import { Activity, ArrowLeft, Download, Trash2, RefreshCcw, Search, Eye, EyeOff } from 'lucide-react';

type DebugEntry = {
  ts: number;
  rel: number;
  category: string;
  msg: string;
  data?: unknown;
};

type DebugDoc = {
  id: string;                  // Firestore doc id (the sessionId)
  sessionId: string;
  station: string;
  ua?: string;
  url?: string;
  startedAt?: number;
  lastFlush?: number;
  reason?: string;
  count?: number;
  entries?: DebugEntry[];
};

const CATEGORY_COLOR: Record<string, string> = {
  visibility: '#FFD700',
  focus: '#39FF14',
  blur: '#FF4D4D',
  lifecycle: '#7F7FFF',
  bridge: '#00E5FF',
  frame: '#FF8C00',
  error: '#FF1F1F',
  net: '#A0A0A0',
  init: '#9CFFB5',
  click: '#FFB86C',
  heartbeat: '#5FB1FF',
  'paint-sample': '#C792EA',
  resize: '#7DD3FC',
  debug: '#39FF14',
};

function relTime(ms?: number): string {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmt(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}

export function DebugLogsPanel() {
  const [docs, setDocs] = useState<DebugDoc[]>([]);
  const [selected, setSelected] = useState<DebugDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());

  useEffect(() => {
    const q = query(collection(db, 'debug-logs'), orderBy('lastFlush', 'desc'), limit(200));
    const unsub = onSnapshot(q, snap => {
      const list: DebugDoc[] = [];
      snap.forEach(d => list.push({ id: d.id, ...(d.data() as Omit<DebugDoc, 'id'>) }));
      setDocs(list);
      setLoading(false);
      // Refresh selected with new data if it's still in the list
      if (selected) {
        const next = list.find(x => x.id === selected.id);
        if (next) setSelected(next);
      }
    }, err => {
      console.error('debug-logs subscription error', err);
      setLoading(false);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete debug log "${id}"? This is permanent.`)) return;
    await deleteDoc(doc(db, 'debug-logs', id));
    if (selected?.id === id) setSelected(null);
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Delete ALL ${docs.length} debug log sessions? Permanent.`)) return;
    await Promise.all(docs.map(d => deleteDoc(doc(db, 'debug-logs', d.id))));
    setSelected(null);
  };

  const downloadJson = (d: DebugDoc) => {
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `debug-${d.id}.json`;
    a.click();
  };

  // ---- DETAIL VIEW ----
  if (selected) {
    const all = selected.entries || [];
    const cats = Array.from(new Set(all.map(e => e.category))).sort();
    const filtered = all.filter(e => {
      if (hiddenCats.has(e.category)) return false;
      if (!search) return true;
      const blob = `${e.category} ${e.msg} ${JSON.stringify(e.data ?? '')}`.toLowerCase();
      return blob.includes(search.toLowerCase());
    });

    return (
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelected(null)}
              className="p-2 rounded-xl bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] transition"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">{selected.id}</h2>
              <p className="text-sm text-[#86868b] mt-0.5">
                station <span className="font-mono text-[#1d1d1f]">{selected.station}</span>
                {' · '}{all.length} entries
                {' · '}last flush {relTime(selected.lastFlush)}
                {' · '}{selected.reason ? `reason: ${selected.reason}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadJson(selected)}
              className="px-4 py-2 rounded-xl bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-sm font-medium flex items-center gap-2 transition"
            >
              <Download size={14} /> JSON
            </button>
            <button
              onClick={() => handleDelete(selected.id)}
              className="px-4 py-2 rounded-xl bg-[#fff5f5] hover:bg-[#ffe5e5] text-[#ff3b30] text-sm font-medium flex items-center gap-2 transition"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-white rounded-xl p-3 border border-[#e5e5ea]/60">
            <p className="text-[10px] text-[#86868b] uppercase tracking-wider">Started</p>
            <p className="text-sm font-medium text-[#1d1d1f] mt-1">{fmt(selected.startedAt)}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-[#e5e5ea]/60">
            <p className="text-[10px] text-[#86868b] uppercase tracking-wider">Last Flush</p>
            <p className="text-sm font-medium text-[#1d1d1f] mt-1">{fmt(selected.lastFlush)}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-[#e5e5ea]/60">
            <p className="text-[10px] text-[#86868b] uppercase tracking-wider">URL</p>
            <p className="text-xs font-mono text-[#1d1d1f] mt-1 truncate" title={selected.url}>{selected.url}</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-[#e5e5ea]/60">
            <p className="text-[10px] text-[#86868b] uppercase tracking-wider">User Agent</p>
            <p className="text-[10px] font-mono text-[#1d1d1f] mt-1 truncate" title={selected.ua}>{selected.ua}</p>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868b]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter entries..."
              className="w-full bg-white border border-[#d2d2d7] rounded-xl pl-9 pr-3 py-2 text-sm text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none"
            />
          </div>
          <span className="text-xs text-[#86868b]">{filtered.length}/{all.length}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {cats.map(c => {
            const hidden = hiddenCats.has(c);
            const count = all.filter(e => e.category === c).length;
            return (
              <button
                key={c}
                onClick={() => {
                  setHiddenCats(prev => {
                    const next = new Set(prev);
                    if (next.has(c)) next.delete(c); else next.add(c);
                    return next;
                  });
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition flex items-center gap-1.5 ${hidden ? 'bg-white text-[#86868b] border-[#e5e5ea]' : 'text-white border-transparent'}`}
                style={hidden ? {} : { background: CATEGORY_COLOR[c] || '#666' }}
              >
                {hidden ? <EyeOff size={10} /> : <Eye size={10} />}
                {c} <span className="opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Entries — monospace timeline */}
        <div className="bg-[#0a0a0a] rounded-xl border border-[#1f1f1f] overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto p-3 font-mono text-[11px]">
            {filtered.length === 0 ? (
              <div className="text-center text-[#666] py-8">no entries match filters</div>
            ) : filtered.map((e, i) => (
              <div key={i} className="flex items-start gap-3 py-1 px-2 rounded hover:bg-white/5 border-b border-white/5">
                <span className="text-[#666] min-w-[70px]">+{e.rel}ms</span>
                <span className="font-bold min-w-[90px]" style={{ color: CATEGORY_COLOR[e.category] || '#fff' }}>{e.category}</span>
                <span className="text-white flex-1 break-all">
                  {e.msg}
                  {e.data !== undefined && e.data !== '' && (
                    <span className="text-[#888] ml-2">{typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---- LIST VIEW ----
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-3">
            <Activity size={22} className="text-[#0071e3]" /> Debug Logs
          </h2>
          <p className="text-sm text-[#86868b] mt-1">
            {loading ? 'Loading...' : `${docs.length} session${docs.length === 1 ? '' : 's'} captured`} ·
            kiosks flush focus/visibility/click/render-gap events to Firestore every 3s
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDocs(d => [...d])}
            className="px-4 py-2 rounded-xl bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-sm font-medium flex items-center gap-2 transition"
          >
            <RefreshCcw size={14} /> Refresh
          </button>
          {docs.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="px-4 py-2 rounded-xl bg-[#fff5f5] hover:bg-[#ffe5e5] text-[#ff3b30] text-sm font-medium flex items-center gap-2 transition"
            >
              <Trash2 size={14} /> Delete All
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#0071e3] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e5e5ea]/60 p-12 text-center">
          <Activity size={40} className="text-[#d2d2d7] mx-auto mb-3" />
          <p className="text-lg font-semibold text-[#86868b]">No debug sessions yet</p>
          <p className="text-sm text-[#86868b] mt-2">
            Open the kiosk and type <code className="px-1.5 py-0.5 rounded bg-[#f5f5f7] text-[#1d1d1f]">ghanemdebug</code> to start capturing.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(d => {
            const errors = (d.entries || []).filter(e => e.category === 'error').length;
            const blurs = (d.entries || []).filter(e => e.category === 'blur').length;
            const longGaps = (d.entries || []).filter(e => e.category === 'frame').length;
            return (
              <div
                key={d.id}
                onClick={() => setSelected(d)}
                className="bg-white rounded-2xl p-4 border border-[#e5e5ea]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] cursor-pointer transition flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-[#1d1d1f]">{d.station}</span>
                    <span className="text-[10px] font-mono text-[#86868b] truncate">{d.id}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#86868b]">
                    <span>{d.count ?? d.entries?.length ?? 0} entries</span>
                    {errors > 0 && <span className="text-[#ff3b30] font-medium">{errors} error{errors === 1 ? '' : 's'}</span>}
                    {blurs > 0 && <span className="text-[#ff8c00]">{blurs} blur{blurs === 1 ? '' : 's'}</span>}
                    {longGaps > 0 && <span className="text-[#ffd700]">{longGaps} long-gap{longGaps === 1 ? '' : 's'}</span>}
                    <span>·</span>
                    <span>{relTime(d.lastFlush)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); downloadJson(d); }}
                    className="p-2 rounded-lg bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#86868b] hover:text-[#1d1d1f] transition"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}
                    className="p-2 rounded-lg bg-[#fff5f5] hover:bg-[#ffe5e5] text-[#ff3b30] transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
