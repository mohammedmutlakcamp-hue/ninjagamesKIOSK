'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import {
  collection, onSnapshot, doc, getDoc, setDoc, updateDoc
} from 'firebase/firestore';
import {
  MapPin, Plus, Edit3, Trash2, Monitor, X, Save, Palette,
  DollarSign, ChevronRight, Layers, AlertCircle, GripVertical
} from 'lucide-react';

interface Zone {
  id: string;
  name: string;
  color: string;
  pricingMultiplier: number;
  description: string;
}

interface PC {
  id: string;
  name: string;
  status: string;
  zone?: string;
  currentPlayer?: string;
  [key: string]: any;
}

const DEFAULT_ZONES: Zone[] = [
  { id: 'regular', name: 'Regular', color: '#22c55e', pricingMultiplier: 1, description: 'Standard gaming stations' },
  { id: 'vip', name: 'VIP', color: '#eab308', pricingMultiplier: 1.5, description: 'Premium VIP stations with better hardware' },
  { id: 'tournament', name: 'Tournament', color: '#f97316', pricingMultiplier: 1, description: 'Dedicated tournament area' },
];

const COLOR_PRESETS = [
  '#22c55e', '#eab308', '#f97316', '#ef4444', '#3b82f6',
  '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f59e0b',
];

export function PCZones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [pcs, setPcs] = useState<PC[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [assignMode, setAssignMode] = useState<string | null>(null); // zone id being assigned to
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('#22c55e');
  const [formMultiplier, setFormMultiplier] = useState('1');
  const [formDescription, setFormDescription] = useState('');

  // Load zones from config/zones doc
  useEffect(() => {
    const unsubZones = onSnapshot(doc(db, 'config', 'zones'), (snap) => {
      if (snap.exists()) {
        setZones(snap.data().zones || []);
      } else {
        // Seed defaults
        setDoc(doc(db, 'config', 'zones'), { zones: DEFAULT_ZONES });
        setZones(DEFAULT_ZONES);
      }
    });

    const unsubPCs = onSnapshot(collection(db, 'pcs'), (snap) => {
      const pcList = snap.docs.map(d => ({ id: d.id, ...d.data() } as PC));
      setPcs(pcList.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    });

    return () => { unsubZones(); unsubPCs(); };
  }, []);

  const saveZones = async (newZones: Zone[]) => {
    await setDoc(doc(db, 'config', 'zones'), { zones: newZones });
  };

  const openCreateForm = () => {
    setEditingZone(null);
    setFormName('');
    setFormColor('#22c55e');
    setFormMultiplier('1');
    setFormDescription('');
    setShowForm(true);
  };

  const openEditForm = (zone: Zone) => {
    setEditingZone(zone);
    setFormName(zone.name);
    setFormColor(zone.color);
    setFormMultiplier(String(zone.pricingMultiplier));
    setFormDescription(zone.description);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    const mult = parseFloat(formMultiplier) || 1;

    if (editingZone) {
      const updated = zones.map(z =>
        z.id === editingZone.id
          ? { ...z, name: formName.trim(), color: formColor, pricingMultiplier: mult, description: formDescription.trim() }
          : z
      );
      await saveZones(updated);
    } else {
      const id = formName.trim().toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36);
      const newZone: Zone = {
        id,
        name: formName.trim(),
        color: formColor,
        pricingMultiplier: mult,
        description: formDescription.trim(),
      };
      await saveZones([...zones, newZone]);
    }
    setShowForm(false);
  };

  const handleDelete = async (zoneId: string) => {
    // Remove zone from list
    await saveZones(zones.filter(z => z.id !== zoneId));
    // Unassign PCs from this zone
    const affectedPCs = pcs.filter(p => p.zone === zoneId);
    for (const pc of affectedPCs) {
      await updateDoc(doc(db, 'pcs', pc.id), { zone: '' });
    }
    setDeleteConfirm(null);
  };

  const togglePCZone = async (pcId: string, zoneId: string) => {
    const pc = pcs.find(p => p.id === pcId);
    if (!pc) return;
    const newZone = pc.zone === zoneId ? '' : zoneId;
    await updateDoc(doc(db, 'pcs', pcId), { zone: newZone });
  };

  const getPCsInZone = (zoneId: string) => pcs.filter(p => p.zone === zoneId);
  const unassignedPCs = pcs.filter(p => !p.zone || !zones.find(z => z.id === p.zone));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'occupied': return 'bg-[#ff3b30]';
      case 'online': return 'bg-[#34c759]';
      default: return 'bg-[#86868b]';
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-1 flex items-center gap-3">
            <Layers size={28} className="text-[#0071e3]" />
            PC Zones
          </h2>
          <p className="text-[#86868b] text-sm">Group PCs into zones with different pricing tiers</p>
        </div>
        <div className="flex gap-3">
          {assignMode && (
            <motion.button
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              onClick={() => setAssignMode(null)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[#ff3b30] border border-[#d2d2d7] hover:bg-[#fff5f5] text-sm transition-all"
            >
              <X size={16} /> Exit Assign Mode
            </motion.button>
          )}
          <button
            onClick={openCreateForm}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0071e3] text-white font-medium text-sm hover:bg-[#0077ED] transition-all"
          >
            <Plus size={16} /> Create Zone
          </button>
        </div>
      </div>

      {/* Assign mode banner */}
      <AnimatePresence>
        {assignMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div
              className="rounded-xl p-4 border text-sm flex items-center gap-3"
              style={{
                backgroundColor: `${zones.find(z => z.id === assignMode)?.color}10`,
                borderColor: `${zones.find(z => z.id === assignMode)?.color}30`,
                color: zones.find(z => z.id === assignMode)?.color,
              }}
            >
              <GripVertical size={18} />
              Click PCs below to assign/unassign them to <span className="font-semibold">{zones.find(z => z.id === assignMode)?.name}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Zones Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-8">
        {zones.map((zone, i) => {
          const zonePCs = getPCsInZone(zone.id);
          const isAssigning = assignMode === zone.id;

          return (
            <motion.div
              key={zone.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-2xl border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
            >
              {/* Zone header */}
              <div className="px-5 py-4 flex items-center justify-between border-b border-[#e5e5ea]/40">
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: zone.color }}
                  />
                  <div>
                    <h3 className="text-lg font-semibold text-[#1d1d1f]">{zone.name}</h3>
                    <p className="text-xs text-[#86868b]">{zone.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Pricing badge */}
                  <span
                    className="px-3 py-1 rounded-full text-xs font-medium border"
                    style={{
                      color: zone.color,
                      borderColor: `${zone.color}30`,
                      backgroundColor: `${zone.color}10`,
                    }}
                  >
                    <DollarSign size={12} className="inline -mt-0.5 mr-0.5" />
                    {zone.pricingMultiplier}x
                  </span>
                  {/* PC count */}
                  <span className="px-3 py-1 rounded-full bg-[#f5f5f7] border border-[#e5e5ea]/60 text-xs text-[#86868b]">
                    <Monitor size={12} className="inline -mt-0.5 mr-1" />
                    {zonePCs.length} PCs
                  </span>
                  {/* Actions */}
                  <button
                    onClick={() => setAssignMode(isAssigning ? null : zone.id)}
                    className={`p-1.5 rounded-lg transition-all ${isAssigning ? 'bg-[#0071e3]/10 text-[#0071e3]' : 'hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'}`}
                    title="Assign PCs"
                  >
                    <MapPin size={16} />
                  </button>
                  <button
                    onClick={() => openEditForm(zone)}
                    className="p-1.5 rounded-lg hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] transition-all"
                    title="Edit zone"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(zone.id)}
                    className="p-1.5 rounded-lg hover:bg-[#fff5f5] text-[#86868b] hover:text-[#ff3b30] transition-all"
                    title="Delete zone"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Zone PCs */}
              <div className="px-5 py-3">
                {zonePCs.length === 0 ? (
                  <p className="text-[#86868b] text-xs py-2 text-center">No PCs assigned to this zone</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {zonePCs.map(pc => (
                      <div
                        key={pc.id}
                        onClick={() => assignMode === zone.id ? togglePCZone(pc.id, zone.id) : undefined}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                          assignMode === zone.id ? 'cursor-pointer hover:border-[#ff3b30]/50 hover:bg-[#fff5f5]' : ''
                        }`}
                        style={{
                          borderColor: `${zone.color}25`,
                          backgroundColor: `${zone.color}08`,
                          color: zone.color,
                        }}
                      >
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(pc.status)}`} />
                        {pc.name || pc.id}
                        {assignMode === zone.id && <X size={12} className="text-[#ff3b30] ml-1" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Unassigned PCs */}
      <div className="bg-white rounded-2xl border border-[#e5e5ea]/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e5e5ea]/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle size={18} className="text-[#86868b]" />
            <h3 className="text-lg font-semibold text-[#1d1d1f]">Unassigned PCs</h3>
            <span className="px-2 py-0.5 rounded-full bg-[#f5f5f7] border border-[#e5e5ea]/60 text-xs text-[#86868b]">
              {unassignedPCs.length}
            </span>
          </div>
        </div>
        <div className="px-5 py-4">
          {unassignedPCs.length === 0 ? (
            <p className="text-[#86868b] text-sm text-center py-4">All PCs are assigned to zones</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {unassignedPCs.map(pc => (
                <div
                  key={pc.id}
                  onClick={() => assignMode ? togglePCZone(pc.id, assignMode) : undefined}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-[#e5e5ea]/60 bg-[#f5f5f7] text-sm text-[#86868b] transition-all ${
                    assignMode ? 'cursor-pointer hover:border-[#0071e3]/50 hover:bg-[#0071e3]/5 hover:text-[#0071e3]' : ''
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(pc.status)}`} />
                  <Monitor size={14} />
                  {pc.name || pc.id}
                  {assignMode && (
                    <ChevronRight size={14} className="text-[#0071e3]" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Zone Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 w-[480px] max-w-[90vw]"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-[#1d1d1f]">
                  {editingZone ? 'Edit Zone' : 'Create Zone'}
                </h3>
                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f] transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-5">
                {/* Name */}
                <div>
                  <label className="text-sm text-[#86868b] mb-1.5 block">Zone Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. VIP Area"
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-3 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="text-sm text-[#86868b] mb-1.5 block flex items-center gap-2">
                    <Palette size={14} className="text-[#0071e3]" /> Color
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {COLOR_PRESETS.map(c => (
                      <button
                        key={c}
                        onClick={() => setFormColor(c)}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          formColor === c ? 'border-[#1d1d1f] scale-110' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input
                      type="color"
                      value={formColor}
                      onChange={e => setFormColor(e.target.value)}
                      className="w-8 h-8 rounded-full cursor-pointer border-0 bg-transparent"
                    />
                  </div>
                </div>

                {/* Pricing Multiplier */}
                <div>
                  <label className="text-sm text-[#86868b] mb-1.5 block flex items-center gap-2">
                    <DollarSign size={14} className="text-[#0071e3]" /> Pricing Multiplier
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="5"
                      value={formMultiplier}
                      onChange={e => setFormMultiplier(e.target.value)}
                      className="w-28 bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-3 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all"
                    />
                    <div className="flex gap-2">
                      {[0.5, 1, 1.5, 2].map(v => (
                        <button
                          key={v}
                          onClick={() => setFormMultiplier(String(v))}
                          className={`px-3 py-1.5 rounded-xl border text-xs transition-all ${
                            parseFloat(formMultiplier) === v
                              ? 'border-[#0071e3]/50 bg-[#0071e3]/10 text-[#0071e3]'
                              : 'border-[#d2d2d7] bg-white text-[#86868b] hover:text-[#1d1d1f]'
                          }`}
                        >
                          {v}x
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-[#86868b] mt-1.5">
                    {parseFloat(formMultiplier) === 1 ? 'Normal pricing' :
                     parseFloat(formMultiplier) > 1 ? `${((parseFloat(formMultiplier) - 1) * 100).toFixed(0)}% more expensive` :
                     `${((1 - parseFloat(formMultiplier)) * 100).toFixed(0)}% cheaper`}
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className="text-sm text-[#86868b] mb-1.5 block">Description</label>
                  <textarea
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder="Short description of this zone..."
                    rows={2}
                    className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-xl px-4 py-3 text-[#1d1d1f] focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/20 outline-none transition-all resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-xl border border-[#d2d2d7] text-[#1d1d1f] text-sm hover:bg-[#f5f5f7] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!formName.trim()}
                  className="flex-1 py-3 rounded-xl bg-[#0071e3] text-white font-medium text-sm hover:bg-[#0077ED] transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Save size={16} />
                  {editingZone ? 'Update Zone' : 'Create Zone'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] p-6 w-[400px] max-w-[90vw]"
            >
              <div className="text-center mb-5">
                <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#fff5f5] flex items-center justify-center border border-[#ff3b30]/20">
                  <Trash2 size={24} className="text-[#ff3b30]" />
                </div>
                <h3 className="text-xl font-semibold text-[#1d1d1f] mb-1">Delete Zone</h3>
                <p className="text-[#86868b] text-sm">
                  This will unassign {getPCsInZone(deleteConfirm).length} PC(s) from this zone.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-3 rounded-xl border border-[#d2d2d7] text-[#1d1d1f] text-sm hover:bg-[#f5f5f7] transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 py-3 rounded-xl bg-[#ff3b30] text-white font-medium text-sm hover:bg-[#ff3b30]/90 transition-all"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
