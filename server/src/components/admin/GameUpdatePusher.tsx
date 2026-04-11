'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, onSnapshot, doc, updateDoc, addDoc, query, orderBy, limit, getDocs, Timestamp
} from 'firebase/firestore';
import { PC } from '@/types';
import { Download, HardDrive, Terminal, Send, Monitor, Trash2, Clock, CheckCircle, AlertCircle } from 'lucide-react';

interface CommandHistoryEntry {
  id: string;
  pcId: string;
  pcName: string;
  command: string;
  data: string | null;
  timestamp: number;
  sentBy: string;
}

const PRESET_COMMANDS = [
  {
    id: 'steam-update',
    label: 'Steam Update',
    icon: Download,
    command: 'run-steam-update',
    description: 'Triggers Steam to check for and install game updates',
    color: '#0071e3',
  },
  {
    id: 'epic-update',
    label: 'Epic Games Update',
    icon: Download,
    command: 'run-epic-update',
    description: 'Opens Epic Games Launcher to trigger auto-updates',
    color: '#af52de',
  },
  {
    id: 'disk-cleanup',
    label: 'Disk Cleanup',
    icon: Trash2,
    command: 'disk-cleanup',
    description: 'Clears temp files, browser cache, and recycle bin',
    color: '#ff3b30',
  },
];

type PCTarget = 'all' | 'online' | string;

export function GameUpdatePusher() {
  const [pcs, setPcs] = useState<PC[]>([]);
  const [target, setTarget] = useState<PCTarget>('all');
  const [customCommand, setCustomCommand] = useState('');
  const [history, setHistory] = useState<CommandHistoryEntry[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState<string | null>(null);

  // Listen to PCs
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'pcs'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as PC));
      data.sort((a, b) => a.name.localeCompare(b.name));
      setPcs(data);
    });
    return () => unsub();
  }, []);

  // Load command history
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const q = query(collection(db, 'command-history'), orderBy('timestamp', 'desc'), limit(20));
        const snap = await getDocs(q);
        setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() } as CommandHistoryEntry)));
      } catch {
        // Collection may not exist yet
      }
    };
    loadHistory();
  }, [lastSent]);

  const isOnline = (pc: PC) => {
    return pc.lastHeartbeat && (Date.now() - pc.lastHeartbeat) < 60000;
  };

  const getTargetPCs = (): PC[] => {
    if (target === 'all') return pcs;
    if (target === 'online') return pcs.filter(isOnline);
    return pcs.filter(p => p.id === target);
  };

  const sendCommand = async (command: string, data?: string) => {
    const targets = getTargetPCs();
    if (targets.length === 0) return;

    const commandId = command;
    setSending(commandId);

    try {
      for (const pc of targets) {
        const cmdString = data ? `${command}:${data}` : command;
        await updateDoc(doc(db, 'pcs', pc.id), {
          pendingCommand: { command, data: data || null, timestamp: Date.now(), executed: false },
          command: cmdString,
        });

        // Log to history
        await addDoc(collection(db, 'command-history'), {
          pcId: pc.id,
          pcName: pc.name,
          command: cmdString,
          data: data || null,
          timestamp: Date.now(),
          sentBy: 'admin',
        });
      }

      setLastSent(commandId + Date.now());

      // Flash success
      setTimeout(() => setSending(null), 1200);
    } catch (err) {
      console.error('Failed to send command:', err);
      setSending(null);
    }
  };

  const sendCustom = () => {
    if (!customCommand.trim()) return;
    sendCommand(customCommand.trim());
    setCustomCommand('');
  };

  const onlinePCs = pcs.filter(isOnline);
  const targetPCs = getTargetPCs();
  const targetLabel = target === 'all' ? `All PCs (${pcs.length})` :
    target === 'online' ? `Online PCs (${onlinePCs.length})` :
    pcs.find(p => p.id === target)?.name || 'Unknown PC';

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return time;
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${time}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
            <Monitor className="text-[#0071e3]" size={22} />
            Game Update Pusher
          </h2>
          <p className="text-sm text-[#86868b] mt-1">
            Push updates and maintenance commands to player PCs remotely
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#86868b]">
          <span className="w-2 h-2 rounded-full bg-[#34c759] animate-pulse" />
          {onlinePCs.length} PC{onlinePCs.length !== 1 ? 's' : ''} online
        </div>
      </div>

      {/* PC Target Selector */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
      >
        <label className="text-sm font-medium text-[#86868b] mb-2 block">Target PCs</label>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] text-sm focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors appearance-none cursor-pointer"
        >
          <option value="all">All PCs ({pcs.length})</option>
          <option value="online">Online PCs Only ({onlinePCs.length})</option>
          <optgroup label="Specific PC">
            {pcs.map(pc => (
              <option key={pc.id} value={pc.id}>
                {pc.name} {isOnline(pc) ? '(online)' : '(offline)'}
              </option>
            ))}
          </optgroup>
        </select>
        <p className="text-xs text-[#86868b] mt-2">
          Command will be sent to: <span className="text-[#0071e3]">{targetLabel}</span>
          {' '}({targetPCs.length} PC{targetPCs.length !== 1 ? 's' : ''})
        </p>
      </motion.div>

      {/* Preset Commands */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PRESET_COMMANDS.map((preset, i) => {
          const Icon = preset.icon;
          const isSending = sending === preset.command;
          return (
            <motion.button
              key={preset.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              onClick={() => sendCommand(preset.command)}
              disabled={!!sending || targetPCs.length === 0}
              className="bg-white rounded-2xl p-5 text-left group hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${preset.color}10` }}
                >
                  <Icon size={20} style={{ color: preset.color }} />
                </div>
                <span className="font-medium text-[#1d1d1f] text-sm">{preset.label}</span>
              </div>
              <p className="text-xs text-[#86868b] mb-4">{preset.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#86868b] uppercase tracking-wider">
                  {preset.command}
                </span>
                {isSending ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex items-center gap-1 text-[#34c759]"
                  >
                    <CheckCircle size={14} />
                    <span className="text-xs">Sent!</span>
                  </motion.div>
                ) : (
                  <Send size={14} className="text-[#d2d2d7] group-hover:text-[#0071e3] transition-colors" />
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Custom Command */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
      >
        <div className="flex items-center gap-2 mb-3">
          <Terminal size={16} className="text-[#0071e3]" />
          <span className="text-sm font-medium text-[#1d1d1f]">Custom Command</span>
        </div>
        <p className="text-xs text-[#86868b] mb-3">
          Send any raw command string to the selected PC(s). The C# client will process it.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendCustom()}
            placeholder="e.g. run-steam-update, disk-cleanup, custom-script:arg"
            className="flex-1 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-2.5 text-[#1d1d1f] text-sm placeholder:text-[#86868b] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-colors"
          />
          <button
            onClick={sendCustom}
            disabled={!customCommand.trim() || !!sending || targetPCs.length === 0}
            className="px-5 py-2.5 bg-[#0071e3] text-white font-medium text-sm rounded-xl hover:bg-[#0077ED] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Send size={14} />
            Send
          </button>
        </div>
      </motion.div>

      {/* Command History */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-2xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[#e5e5ea]/60"
      >
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-[#0071e3]" />
          <span className="text-sm font-medium text-[#1d1d1f]">Command History</span>
          <span className="text-xs text-[#86868b] ml-auto">Last 20 commands</span>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-8">
            <HardDrive size={32} className="text-[#d2d2d7] mx-auto mb-2" />
            <p className="text-sm text-[#86868b]">No commands sent yet</p>
          </div>
        ) : (
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {history.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[#f5f5f7] transition-colors group"
              >
                <div className="w-7 h-7 rounded-lg bg-[#f5f5f7] flex items-center justify-center shrink-0">
                  <Monitor size={13} className="text-[#86868b]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#1d1d1f]">{entry.pcName}</span>
                    <span className="text-[10px] text-[#86868b] bg-[#f5f5f7] px-1.5 py-0.5 rounded">
                      {entry.command}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] text-[#86868b] shrink-0">
                  {formatTime(entry.timestamp)}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
