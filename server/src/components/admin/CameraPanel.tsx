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
  Wifi, WifiOff, CheckCircle2, HelpCircle, ExternalLink, Shield, Router,
} from 'lucide-react';
import { HelpTip } from './HelpTip';

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
  const [showHelp, setShowHelp] = useState(false);

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
            <h2 className="text-2xl font-semibold text-[#1d1d1f] tracking-tight flex items-center gap-2">
              Cameras
              <HelpTip title={{ en: 'Camera Panel', ar: 'لوحة الكاميرات' }}
                ar={(
                  <>
                    <p className="mb-2">راقب كل كاميرات Hikvision في المحل من مكان واحد. شبكة صور مباشرة تتجدد كل {REFRESH_INTERVAL / 1000} ثانية؛ اضغط على أي صورة لعرض كامل.</p>
                    <p className="mb-1.5"><strong>كل بلاطة تظهر:</strong> اسم الكاميرا، المنطقة، نقطة حيّة، الـ IP، رقم القناة.</p>
                    <p className="mb-1.5"><strong>إضافة كاميرا:</strong> اضغط "Add Camera"، اكتب الاسم + الـIP + البورت + القناة (101 للبث الرئيسي) + اسم المستخدم وكلمة السر. بيانات الدخول لا تخرج من الخادم.</p>
                    <p className="text-[#86868b]"><strong>للوصول عن بُعد</strong> (من البيت)، اضغط "Setup Guide" لشرح Port Forwarding.</p>
                  </>
                )}>
                <p className="mb-2">Watch every Hikvision camera in the shop. Live snapshots refresh every {REFRESH_INTERVAL / 1000}s; click for fullscreen.</p>
                <p className="mb-1.5"><strong>Each tile:</strong> name, zone, live dot, IP, channel.</p>
                <p className="mb-1.5"><strong>Add:</strong> name + IP + port + channel (101=main) + user + password. Credentials never leave server.</p>
                <p className="text-[#86868b]"><strong>Remote access:</strong> see "Setup Guide" for port-forwarding.</p>
              </HelpTip>
            </h2>
            <p className="text-[#86868b] text-sm">
              {cameras.length} Hikvision camera{cameras.length === 1 ? '' : 's'} — live JPEG snapshot grid, refreshes every {REFRESH_INTERVAL / 1000}s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#d2d2d7] text-[#1d1d1f] rounded-xl font-medium text-sm hover:bg-[#f5f5f7] transition-colors"
          >
            <HelpCircle size={16} /> Setup Guide
          </button>
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

      {/* ───────────── Setup Guide modal (port forwarding tutorial) ───────────── */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowHelp(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl w-[760px] max-w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Sticky header */}
              <div className="sticky top-0 bg-white border-b border-[#e5e5ea] px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                    <Video size={18} className="text-[#ef4444]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#1d1d1f]">Hikvision Camera Setup Guide</h3>
                    <p className="text-xs text-[#86868b]">LAN access + remote access via port forwarding</p>
                  </div>
                </div>
                <button onClick={() => setShowHelp(false)}
                  className="w-9 h-9 rounded-lg hover:bg-[#f5f5f7] flex items-center justify-center">
                  <X size={18} className="text-[#86868b]" />
                </button>
              </div>

              <div className="p-6 space-y-6 text-sm text-[#1d1d1f] leading-relaxed">
                {/* STEP 0 - prerequisites */}
                <section>
                  <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0071e3] text-white flex items-center justify-center text-xs font-bold">0</span>
                    What you'll need
                  </h4>
                  <ul className="list-disc pl-9 space-y-1 text-[#424245]">
                    <li>A Hikvision camera (or NVR) already online on your shop's LAN.</li>
                    <li>The camera's <strong>admin username + password</strong> you set up in the Hik-Connect app or Hikvision web UI.</li>
                    <li>Access to your router's admin page (usually at <code className="bg-[#f5f5f7] px-1 rounded">192.168.1.1</code> or <code className="bg-[#f5f5f7] px-1 rounded">192.168.0.1</code>).</li>
                  </ul>
                </section>

                {/* STEP 1 - find the camera IP */}
                <section>
                  <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#0071e3] text-white flex items-center justify-center text-xs font-bold">1</span>
                    Find your camera's IP
                  </h4>
                  <p className="pl-9 text-[#424245] mb-2">Easiest methods, pick one:</p>
                  <ul className="list-disc pl-9 space-y-1 text-[#424245]">
                    <li>Download <strong>SADP Tool</strong> from Hikvision.com → run on a LAN PC → it lists every Hik device + its IP.</li>
                    <li>Or log into your router's admin → <em>Connected Devices / DHCP Client List</em> → look for "Hikvision" or "HIKVISION-xxx".</li>
                    <li>From the shop PC: open <code className="bg-[#f5f5f7] px-1 rounded">http://192.168.1.64</code> in a browser — many Hik cameras default to <code className="bg-[#f5f5f7] px-1 rounded">.64</code>.</li>
                  </ul>
                  <div className="mt-3 ml-9 px-3 py-2 bg-[#f5f5f7] rounded-lg text-[12px]">
                    <strong className="text-[#1d1d1f]">Example:</strong> your camera is at <code>192.168.1.64</code>, port <code>80</code>, channel <code>101</code>, user <code>admin</code>, password <code>shopcam123</code>.
                  </div>
                </section>

                {/* STEP 2 - LAN only */}
                <section>
                  <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#34c759] text-white flex items-center justify-center text-xs font-bold">2</span>
                    LAN-only — simplest setup (recommended for the shop)
                  </h4>
                  <p className="pl-9 text-[#424245]">
                    If the admin panel only needs to be accessed from <strong>inside the shop</strong> (same Wi-Fi as the cameras),
                    you <strong>don't need port forwarding at all</strong>. Add the camera with its LAN IP (e.g. <code className="bg-[#f5f5f7] px-1 rounded">192.168.1.64</code>) and you're done.
                  </p>
                  <div className="mt-2 ml-9 px-3 py-2 bg-[#e8f5e9] border border-[#34c759]/30 rounded-lg text-[12px] text-[#1b5e20]">
                    ✓ Zero exposure to the public internet. No security risk.
                  </div>
                </section>

                {/* STEP 3 - remote via port forwarding */}
                <section>
                  <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#ff9500] text-white flex items-center justify-center text-xs font-bold">3</span>
                    Remote access — port forwarding (only if you want to check cameras from outside the shop)
                  </h4>

                  <div className="pl-9 space-y-3 text-[#424245]">
                    <div>
                      <p className="font-medium text-[#1d1d1f] mb-1 flex items-center gap-1.5"><Router size={14} /> A. On your router</p>
                      <ol className="list-decimal pl-5 space-y-1">
                        <li>Open your router admin (usually <code className="bg-[#f5f5f7] px-1 rounded">http://192.168.1.1</code>). Login with the admin password printed on the router.</li>
                        <li>Find <strong>Port Forwarding</strong> — it sits under one of these menus: <em>Advanced</em>, <em>NAT</em>, <em>Virtual Server</em>, <em>Firewall</em>, or <em>Security</em>.</li>
                        <li>Create a NEW rule with these values:
                          <div className="mt-1.5 bg-[#f5f5f7] rounded-lg p-2.5 font-mono text-[11px] leading-relaxed">
                            Service Name: <span className="text-[#0071e3]">CAMERA-1</span><br />
                            External / WAN Port: <span className="text-[#ef4444]">8081</span> <span className="text-[#86868b]">(pick any unused port &gt;1024)</span><br />
                            Internal / LAN IP: <span className="text-[#0071e3]">192.168.1.64</span> <span className="text-[#86868b]">(your camera's IP)</span><br />
                            Internal / LAN Port: <span className="text-[#0071e3]">80</span> <span className="text-[#86868b]">(the camera's native HTTP port)</span><br />
                            Protocol: <span className="text-[#0071e3]">TCP</span> (or TCP/UDP)<br />
                            Enabled: <span className="text-[#34c759]">✓</span>
                          </div>
                        </li>
                        <li>Save / Apply. The router will reboot or re-apply NAT rules (a few seconds).</li>
                        <li>Do this for EACH camera you want remote: use a different external port per camera (8081, 8082, 8083, …).</li>
                      </ol>
                    </div>

                    <div>
                      <p className="font-medium text-[#1d1d1f] mb-1 flex items-center gap-1.5"><Wifi size={14} /> B. Find your public IP</p>
                      <p>From a PC on the shop Wi-Fi, open <a href="https://whatismyip.com" target="_blank" rel="noreferrer" className="text-[#0071e3] hover:underline inline-flex items-center gap-1">whatismyip.com <ExternalLink size={11} /></a>.
                        Note the IPv4 address — this is your router's public IP on the internet.</p>
                      <div className="mt-1 px-3 py-2 bg-[#fff3cd] border border-[#ffeaa7] rounded-lg text-[11px] text-[#8a6d3b]">
                        If your ISP changes this IP periodically (most do), use a <strong>Dynamic DNS</strong> service so you always have a stable hostname:
                        <ul className="list-disc pl-4 mt-1">
                          <li>Hikvision's own free <strong>hik-connect.com</strong> DDNS — enable in the camera web UI under Network → DDNS.</li>
                          <li>Or free DuckDNS / No-IP — most routers have built-in DDNS support.</li>
                        </ul>
                      </div>
                    </div>

                    <div>
                      <p className="font-medium text-[#1d1d1f] mb-1 flex items-center gap-1.5"><Video size={14} /> C. Add the camera in this panel</p>
                      <p>Click <strong>Add Camera</strong> and use:</p>
                      <div className="mt-1 bg-[#f5f5f7] rounded-lg p-2.5 font-mono text-[11px] leading-relaxed">
                        Host: <span className="text-[#0071e3]">your-public-ip</span> or <span className="text-[#0071e3]">yourshop.hik-connect.com</span><br />
                        Port: <span className="text-[#ef4444]">8081</span> <span className="text-[#86868b]">(the external port you picked)</span><br />
                        Channel: <span className="text-[#0071e3]">101</span> <span className="text-[#86868b]">(main stream)</span><br />
                        Username / Password: from step 1
                      </div>
                    </div>
                  </div>
                </section>

                {/* STEP 4 - security */}
                <section>
                  <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#ef4444] text-white flex items-center justify-center text-xs font-bold">4</span>
                    <Shield size={16} /> Security — read this before port forwarding
                  </h4>
                  <p className="pl-9 text-[#424245] mb-2">
                    Port-forwarding a camera puts it directly on the public internet. Hik cameras have a long
                    history of exploited default credentials. Harden these:
                  </p>
                  <ul className="pl-9 list-disc space-y-1 text-[#424245]">
                    <li>Change the default <code className="bg-[#f5f5f7] px-1 rounded">admin</code> password to something long and unique. Never reuse the router / Wi-Fi password.</li>
                    <li>Pick a <strong>random external port</strong> (e.g. 24611, not 80 / 8080). Scanners probe common ports first.</li>
                    <li>In the camera web UI, go to <em>System → Security</em> and <strong>disable</strong>: Telnet, SSH, ONVIF default user, UPnP.</li>
                    <li>Turn on the camera's built-in <em>Illegal Login Lock</em> (blocks IP after N wrong passwords).</li>
                    <li>Keep the camera firmware current — Hikvision ships security patches.</li>
                    <li>
                      Ideal alternative: don't port-forward at all. Install a <strong>Tailscale</strong> /
                      <strong> ZeroTier</strong> / <strong>WireGuard</strong> mesh on the server PC + your phone.
                      The admin panel reaches the LAN camera over the VPN — encrypted, authenticated, zero public exposure.
                    </li>
                  </ul>
                </section>

                {/* STEP 5 - troubleshoot */}
                <section>
                  <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#86868b] text-white flex items-center justify-center text-xs font-bold">5</span>
                    Troubleshooting
                  </h4>
                  <ul className="pl-9 list-disc space-y-1 text-[#424245]">
                    <li><strong>"Camera unreachable"</strong> in the grid → verify the IP + port work by opening <code className="bg-[#f5f5f7] px-1 rounded">http://host:port</code> in a browser on the same network as the server. You should see the Hik login page.</li>
                    <li>Snapshot loads but wrong camera → double-check <code className="bg-[#f5f5f7] px-1 rounded">channel</code>. Main stream is 101 for camera 1, 201 for camera 2 on an NVR, etc.</li>
                    <li><strong>401 Unauthorized</strong> in the server logs → username or password is wrong. Re-enter in Edit.</li>
                    <li>Works on LAN, fails over internet → router didn't save the port-forward rule, or your ISP is behind CGNAT (common for mobile-router / 4G / some fiber). Use Tailscale or a VPS reverse-proxy instead.</li>
                    <li>Blurry / slow → switch the channel to the <strong>sub-stream</strong> (102, 202) — lower resolution, less bandwidth.</li>
                  </ul>
                </section>

                <div className="pt-4 border-t border-[#e5e5ea] flex justify-end">
                  <button onClick={() => setShowHelp(false)}
                    className="px-5 py-2.5 bg-[#0071e3] text-white rounded-xl font-medium text-sm hover:bg-[#0077ED]">
                    Got it
                  </button>
                </div>
              </div>
            </motion.div>
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
