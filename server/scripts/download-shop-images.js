#!/usr/bin/env node
/**
 * Downloads every product image from the iGeek cache to public/shop/, then
 * rewrites the cache JSON to point at the local path. After this, the shop
 * works with zero external dependencies — Vercel serves the images directly.
 *
 * Run:
 *   node scripts/download-shop-images.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const CACHE = path.join(__dirname, '..', 'src', 'lib', 'shop', 'data', 'igeek-cache.json');
const OUT_DIR = path.join(__dirname, '..', 'public', 'shop');
const MAX_PARALLEL = 8;
const SHOPIFY_WIDTH = 600; // Shopify supports ?width=N for resize

const get = (url) => new Promise((resolve, reject) => {
  const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      get(res.headers.location).then(resolve, reject);
      return;
    }
    if (res.statusCode !== 200) {
      reject(new Error(`HTTP ${res.statusCode}`));
      return;
    }
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }));
  });
  req.on('error', reject);
  req.setTimeout(30000, () => req.destroy(new Error('timeout')));
});

const extOf = (contentType, urlPath) => {
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg';
  if (contentType.includes('gif')) return 'gif';
  // fallback: parse URL
  const m = urlPath.match(/\.(webp|png|jpe?g|gif)(\?|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
};

const buildResizedUrl = (raw) => {
  // Shopify CDN: append &width=N. Preserve existing ?v= cache buster.
  if (!raw.includes('cdn.shopify.com')) return raw;
  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}width=${SHOPIFY_WIDTH}`;
};

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const data = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));
  const queue = [];
  for (const [cat, items] of Object.entries(data)) {
    for (const p of items) {
      if (!p.image || p.image.startsWith('/shop/')) continue;
      queue.push(p);
    }
  }
  console.log(`Downloading ${queue.length} images to ${OUT_DIR}\n`);

  let done = 0, failed = 0, skipped = 0;
  const totalBytes = { value: 0 };

  const worker = async () => {
    while (queue.length) {
      const p = queue.shift();
      if (!p) break;
      try {
        const url = buildResizedUrl(p.image);
        const { buffer, contentType } = await get(url);
        const ext = extOf(contentType, p.image);
        const filename = `${p.id}.${ext}`;
        fs.writeFileSync(path.join(OUT_DIR, filename), buffer);
        p.image = `/shop/${filename}`;
        totalBytes.value += buffer.length;
        done++;
        if (done % 25 === 0) {
          process.stdout.write(`\r  ${done}/${done + queue.length + failed} downloaded (${(totalBytes.value / 1024 / 1024).toFixed(1)} MB)   `);
        }
      } catch (e) {
        failed++;
        console.warn(`\n  [fail] ${p.id}: ${e.message}`);
      }
    }
  };

  await Promise.all(Array.from({ length: MAX_PARALLEL }, worker));

  fs.writeFileSync(CACHE, JSON.stringify(data, null, 2));
  console.log(`\n\nDone. ${done} downloaded, ${failed} failed, ${skipped} skipped, ${(totalBytes.value / 1024 / 1024).toFixed(1)} MB total.`);
  console.log(`Cache JSON updated to use /shop/ paths.`);
})().catch(e => { console.error(e); process.exit(1); });
