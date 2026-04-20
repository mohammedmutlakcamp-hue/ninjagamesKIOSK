'use client';

// ═══════════════════════════════════════════════════════════════════
//  <ImageUploadField /> — drop-in replacement for raw image URL inputs.
//
//  Features:
//   - Upload from PC (file picker) OR paste a URL
//   - Downscales to maxWidth × maxHeight (default 512×512)
//   - Compresses JPEG to ~0.85 quality
//   - Returns a base64 data URL via `onChange(url)` — fits in a Firestore
//     doc (under 1 MB) for 512px menu thumbs / avatars / flavor icons.
//   - Live preview + "Remove" button if a value is set
//   - Drag-and-drop supported
//
//  For video files OR large assets, users can still paste a URL pointing
//  at a file in /public/ — this component doesn't intercept that.
// ═══════════════════════════════════════════════════════════════════

import { useCallback, useRef, useState } from 'react';
import { Upload, X, Link2, Image as ImageIcon, Loader2 } from 'lucide-react';

// Simpler helper — a single "Upload" button admin drops next to any
// existing image-URL input. Picks a file, compresses it, calls onUpload
// with the resulting base64 data URL.
export function UploadButton({
  onUpload,
  maxWidth = 512,
  maxHeight = 512,
  quality = 0.85,
  accept = 'image/*',
  label = 'Upload',
  size = 'md',
}: {
  onUpload: (dataUrl: string) => void;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  accept?: string;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await compress(file, maxWidth, maxHeight, quality);
      onUpload(dataUrl);
    } catch (err) {
      console.error('[upload]', err);
      alert('Image upload failed — see console.');
    } finally {
      setBusy(false);
    }
  }, [onUpload, maxWidth, maxHeight, quality]);

  const cls = size === 'sm'
    ? 'px-2.5 py-1.5 text-[11px] rounded-lg'
    : 'px-3 py-2 text-xs rounded-xl';

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className={`${cls} bg-[#0071e3]/10 border border-[#0071e3]/25 text-[#0071e3] font-medium hover:bg-[#0071e3]/15 flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0`}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
        {busy ? 'Uploading…' : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0] || undefined)}
      />
    </>
  );
}

interface Props {
  value: string;                          // current URL or data URL
  onChange: (v: string) => void;
  placeholder?: string;                   // URL placeholder
  maxWidth?: number;                      // default 512
  maxHeight?: number;                     // default 512
  quality?: number;                       // 0..1, default 0.85
  accept?: string;                        // default 'image/*'
  aspect?: 'square' | 'auto';             // preview shape
  label?: string;                         // field label
  hint?: string;                          // extra helper text under the field
}

// Resize + compress using an offscreen canvas. Returns a base64 JPEG.
async function compress(file: File, maxW: number, maxH: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('file read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('image decode failed'));
      img.onload = () => {
        const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas unavailable')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        } catch (err) { reject(err); }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function ImageUploadField({
  value, onChange, placeholder = 'Paste image URL or upload from PC',
  maxWidth = 512, maxHeight = 512, quality = 0.85,
  accept = 'image/*', aspect = 'square', label, hint,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErr('Not an image file.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const dataUrl = await compress(file, maxWidth, maxHeight, quality);
      onChange(dataUrl);
    } catch (e: any) {
      setErr(e?.message || 'upload failed');
    } finally {
      setBusy(false);
    }
  }, [onChange, maxWidth, maxHeight, quality]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const sizeKb = value?.startsWith('data:image')
    ? Math.round((value.length * 3 / 4) / 1024) // rough base64 → bytes
    : null;

  const previewBox = aspect === 'square' ? 'w-20 h-20' : 'w-28 h-20';

  return (
    <div>
      {label && <label className="text-xs font-medium text-[#86868b] mb-1.5 block">{label}</label>}

      <div className="flex items-stretch gap-2">
        {/* Preview */}
        <div className={`${previewBox} flex-shrink-0 rounded-lg overflow-hidden border border-[#e5e5ea] bg-[#f5f5f7] flex items-center justify-center`}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }} />
          ) : (
            <ImageIcon size={22} className="text-[#86868b] opacity-40" />
          )}
        </div>

        {/* URL input + upload */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Link2 size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#86868b] pointer-events-none" />
              <input
                type="text"
                value={value && !value.startsWith('data:') ? value : ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-[#f5f5f7] border border-[#d2d2d7] rounded-lg pl-7 pr-2 py-2 text-xs text-[#1d1d1f] focus:border-[#0071e3] outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors flex-shrink-0
                ${dragging ? 'bg-[#0071e3] text-white' : 'bg-[#f5f5f7] text-[#1d1d1f] border border-[#d2d2d7] hover:bg-white'}`}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {busy ? 'Uploading' : 'Upload'}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="px-2 py-2 rounded-lg text-[#ff3b30] bg-[#ff3b30]/10 border border-[#ff3b30]/20 hover:bg-[#ff3b30]/20"
                title="Remove image"
              >
                <X size={13} />
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
          <div className="text-[10px] text-[#86868b] flex items-center gap-2 flex-wrap">
            <span>Paste a URL or upload from your PC (max {maxWidth}×{maxHeight}, compressed to JPEG).</span>
            {sizeKb !== null && <span className="text-[#0071e3]">Stored: {sizeKb} KB inline</span>}
            {hint && <span className="text-[#86868b]/70">{hint}</span>}
          </div>
          {err && <div className="text-[11px] text-[#ff3b30]">{err}</div>}
        </div>
      </div>
    </div>
  );
}
