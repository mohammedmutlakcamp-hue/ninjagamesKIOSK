'use client';

// Hikvision camera grid for the admin panel — PWA-friendly, mobile-responsive.
//
// Pulls the camera list from Firestore `cameras/*`. Each tile shows a JPEG
// snapshot proxied through /api/camera-snapshot?id={id} (so Hikvision basic
// auth credentials never leak to the browser). Snapshots refresh on a 2s
// interval; click any tile for a bigger fullscreen view with 1s refresh.
//
// Admin CRUD:
//   - Add Camera: name, host (IP/hostname), port, channel, user, password, https flag
//   - Edit / Delete via the pencil icon on each tile
//
// NOTE: cameras live on the LAN so this panel only works when the admin PC
// has network access to the camera IPs (i.e. same LAN, or VPN, or the server
// hosting the API). When Vercel-hosted, cameras must be publicly routable or
// port-forwarded for the proxy to reach them. For on-premises kiosk-server
// deployments (LAN server on :3000), everything works out of the box.

import { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, orderBy, query } from 'firebase/firestore';
import {
  Video, Plus, Trash2, Pencil, X, Save, Loader2, AlertTriangle, RefreshCw, Maximize2,
  Wifi, WifiOff, CheckCircle2,
} from 'lucide-react';

interface Camera {
  id: string;
  name: string;
  host: string;          // IP or hostname
  port: number;          // default 80 (http) / 443 (https)
  channel: number;       // Hikvision channel — usually 101, 201, etc. (main: 101, sub: 102)
  user: string;
  password: string;
  https?: boolean;
  enabled?: boolean;
  order?: number;
}

const SNAPSHOT_URL = (id: string) => `/api/camera-snapshot?id=${encodeURIComponent(id)}&t=${Date.now()}`;
const REFRESH_INTERVAL = 2000;
const FULLSCREEN_REFRESH = 1000;

const inputClass = 'w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg px-3 py-2 text-[#1d1d1f] placeholder:text-[#86868b] outline-none focus:border-[#0071e3] transition-colors text-sm';

export function CameraPanel() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [editing, setEditing] = useState<Camera | null>(null);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPasswordField, setShowPasswordField] = useState(false);

  // Listen for camera list
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'cameras'), orderBy('order')),
      (snap) => {
        setCameras(snap.docs.map((d, i) => ({ id: d.id, ...d.data(), order: (d.data() as any).order ?? i } as Camera)));
      },
      (err) => console.error('camera list listener', err),
    );
    return () => unsub();
  }, []);

  const fullscreenCam = useMemo(() => cameras.find((c) => c.id === fullscreenId) || null, [cameras, fullscreenId]);

  // Save camera
  const save = async () => {
    if (!editing || !editing.name.trim() || !editing.host.trim()) return;
    setSaving(true);
    try {
      const id = editing.id || editing.name.trim().toLowerCase().replace(/\s+/g, '-');
      await setDoc(doc(db, 'cameras', id), {
        name: editing.name.trim(),
        host: editing.host.trim(),
        port: Number(editing.port) || 80,
        channel: Number(editing.channel) || 101,
        user: editing.user.trim() || 'admin',
        password: editing.password,       // stored raw; Firestore rules should tighten for prod
        https: !!editing.https,
        enabled: editing.enabled !== false,
        order: typeof editing.order === 'number' ? editing.order : cameras.length,
      }, { merge: true });
      setEditing(null);
    } catch (err) {
      console.error('save camera failed', err);
      alert('Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Remove this camera from the panel? (The camera itself stays online.)')) return;
    await deleteDoc(doc(db, 'cameras', id));
  };

  return (
    <div className="p-6 relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <Video size={22} className="text-[#ef4444]" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight">Cameras</h2>
            <p className="text-[#86868b] text-sm">
              {cameras.length} Hikvision camera{cameras.length === 1 ? '' : 's'} — live JPEG snapshot grid, refreshes every {REFRESH_INTERVAL / 1000}s
            </p>
          </div>
        </div>
        <button
          onClick={() => setEditing({
            id: '', name: '', host: '', port: 80, channel: 101,
            user: 'admin', password: '', https: false, enabled: true, order: cameras.length,
          })}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#ef4444] text-white rounded-xl font-medium text-sm hover:bg-[#dc2626] transition-colors"
        >
          <Plus size={16} /> Add Camera
        </button>
      </div>

      {/* Empty state */}
      {cameras.length === 0 && (
        <div className="text-center py-16 bg-[#f5f5f7] rounded-2xl border border-dashed border-[#d2d2d7]">
          <Video size={40} className="mx-auto mb-3 text-[#86868b] opacity-40" />
          <p className="text-[#1d1d1f] font-medium">No cameras configured</p>
          <p className="text-[#86868b] text-sm mt-1 max-w-md mx-auto">
            Click <strong>Add Camera</strong> above. You'll need the IP, port, channel (usually 101), and the
            admin username + password you set up in the Hikvision web UI.
          </p>
        </div>
      )}

      {/* Camera grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {cameras.map((cam) => (
          <CameraTile
            key={cam.id}
            camera={cam}
            onFullscreen={() => setFullscreenId(cam.id)}
            onEdit={() => setEditing(cam)}
            onDelete={() => remove(cam.id)}
          />
        ))}
      </div>

      {/* ───────────── Fullscreen viewer ───────────── */}
      <AnimatePresence>
        {fullscreenCam && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[998] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.9)' }}
            onClick={() => setFullscreenId(null)}
          >
            <div className="relative w-full h-full max-w-[1920px] max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-white">
                  <Video size={20} className="text-red-400" />
                  <span className="font-semibold text-lg">{fullscreenCam.name}</span>
                  <span className="text-[11px] text-white/50">{fullscreenCam.host}:{fullscreenCam.port} · ch {fullscreenCam.channel}</span>
                </div>
                <button onClick={() => setFullscreenId(null)}
                  className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-white/10">
                <LiveSnapshot cameraId={fullscreenCam.id} interval={FULLSCREEN_REFRESH} fill />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ───────────── Edit camera modal ───────────── */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
            onClick={() => !saving && setEditing(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl p-6 w-[600px] max-w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-semibold text-[#1d1d1f]">
                  {editing.id ? 'Edit Camera' : 'Add Camera'}
                </h3>
                <button onClick={() => setEditing(null)}
                  className="w-8 h-8 rounded-lg hover:bg-[#f5f5f7] flex items-center justify-center">
                  <X size={18} className="text-[#86868b]" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Name</label>
                  <input type="text" value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="e.g. Entrance" className={inputClass} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Host / IP</label>
                    <input type="text" value={editing.host}
                      onChange={(e) => setEditing({ ...editing, host: e.target.value })}
                      placeholder="192.168.1.64" className={inputClass} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Port</label>
                    <input type="number" value={editing.port}
                      onChange={(e) => setEditing({ ...editing, port: Number(e.target.value) })}
                      className={inputClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Channel</label>
                    <input type="number" value={editing.channel}
                      onChange={(e) => setEditing({ ...editing, channel: Number(e.target.value) })}
                      className={inputClass} />
                    <p className="text-[10px] text-[#86868b] mt-1">Main stream: 101 / 201 · Sub-stream: 102 / 202</p>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-[#1d1d1f] py-2">
                      <input type="checkbox" checked={!!editing.https}
                        onChange={(e) => setEditing({ ...editing, https: e.target.checked })} />
                      Use HTTPS
                    </label>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Username</label>
                    <input type="text" value={editing.user}
                      onChange={(e) => setEditing({ ...editing, user: e.target.value })}
                      placeholder="admin" className={inputClass} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[#86868b] mb-1.5 block">Password</label>
                    <div className="relative">
                      <input type={showPasswordField ? 'text' : 'password'} value={editing.password}
                        onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                        placeholder="camera password" className={inputClass} />
                      <button type="button" onClick={() => setShowPasswordField(!showPasswordField)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#86868b] hover:text-[#1d1d1f]">
                        {showPasswordField ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-[#1d1d1f]">
                  <input type="checkbox" checked={editing.enabled !== false}
                    onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} />
                  Enabled (show on grid)
                </label>

                <div className="bg-[#fff3cd] border border-[#ffeaa7] rounded-xl p-3 text-[11px] text-[#8a6d3b] flex items-start gap-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <p>
                    The snapshot proxy runs server-side at <code className="bg-white px-1 rounded">/api/camera-snapshot</code>.
                    Cameras must be reachable from the server (LAN-side for the kiosk server, or
                    public IP / port-forward for Vercel). Credentials never leave the server.
                  </p>
                </div>

                <div className="flex gap-3 pt-4 border-t border-[#e5e5ea]">
                  <button onClick={save} disabled={saving || !editing.name.trim() || !editing.host.trim()}
                    className="flex-1 py-3 bg-[#ef4444] text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[#dc2626] disabled:opacity-50">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    Save
                  </button>
                  {editing.id && (
                    <button onClick={() => { remove(editing.id); setEditing(null); }}
                      className="px-5 py-3 bg-[#ff3b30]/10 text-[#ff3b30] rounded-xl hover:bg-[#ff3b30]/20">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───────────── One tile in the grid ─────────────
function CameraTile({
  camera,
  onFullscreen,
  onEdit,
  onDelete,
}: {
  camera: Camera;
  onFullscreen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl overflow-hidden border border-[#e5e5ea] bg-black group"
    >
      {/* Header strip */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-1.5 text-white text-sm font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
          {camera.name}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} title="Edit"
            className="w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center text-white">
            <Pencil size={13} />
          </button>
          <button onClick={onDelete} title="Delete"
            className="w-7 h-7 rounded-lg bg-black/60 hover:bg-red-600/80 flex items-center justify-center text-white">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Snapshot */}
      <button onClick={onFullscreen} className="block w-full aspect-video relative"
        disabled={camera.enabled === false}>
        {camera.enabled === false ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#1d1d1f] text-[#86868b] text-xs">
            <WifiOff size={16} className="mr-2" /> Disabled
          </div>
        ) : (
          <LiveSnapshot cameraId={camera.id} interval={REFRESH_INTERVAL} />
        )}
        {/* Fullscreen icon */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-lg w-8 h-8 flex items-center justify-center">
          <Maximize2 size={14} className="text-white" />
        </div>
      </button>

      {/* Footer info */}
      <div className="px-3 py-2 bg-[#1d1d1f] text-[10px] text-[#86868b] flex items-center justify-between">
        <span>{camera.host}:{camera.port} · ch {camera.channel}</span>
        <span className="flex items-center gap-1">
          <Wifi size={10} /> live
        </span>
      </div>
    </motion.div>
  );
}

// ───────────── Auto-refreshing snapshot image ─────────────
function LiveSnapshot({
  cameraId,
  interval,
  fill = false,
}: {
  cameraId: string;
  interval: number;
  fill?: boolean;
}) {
  const [src, setSrc] = useState(SNAPSHOT_URL(cameraId));
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setSrc(SNAPSHOT_URL(cameraId));
    setErrored(false);
    const tick = () => setSrc(SNAPSHOT_URL(cameraId));
    timerRef.current = setInterval(tick, interval);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [cameraId, interval]);

  return (
    <>
      {!loaded && !errored && (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-white/40">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}
      {errored && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1d1d1f] text-[#86868b] text-xs gap-2 px-4 text-center">
          <AlertTriangle size={18} className="text-[#ff9500]" />
          Camera unreachable
          <button onClick={(e) => { e.stopPropagation(); setErrored(false); setLoaded(false); setSrc(SNAPSHOT_URL(cameraId)); }}
            className="text-[11px] text-[#0071e3] flex items-center gap-1">
            <RefreshCw size={10} /> Retry
          </button>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        onLoad={() => { setLoaded(true); setErrored(false); }}
        onError={() => setErrored(true)}
        className={fill ? 'w-full h-full object-contain' : 'w-full h-full object-cover'}
      />
    </>
  );
}
