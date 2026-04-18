#!/usr/bin/env node
/**
 * Resizes + recompresses every shop image to webp (max 600px wide, q80).
 * Drops total /public/shop/ size by ~5-7x with no visible quality loss for
 * product cards. Updates the cache JSON to use .webp filenames.
 *
 * Run after scripts/download-shop-images.js:
 *   node scripts/optimize-shop-images.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const SHOP_DIR = path.join(__dirname, '..', 'public', 'shop');
const CACHE = path.join(__dirname, '..', 'src', 'lib', 'shop', 'data', 'igeek-cache.json');
const MAX_WIDTH = 600;
const QUALITY = 80;

(async () => {
  const files = fs.readdirSync(SHOP_DIR).filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f));
  console.log(`Optimizing ${files.length} images → webp @ ${MAX_WIDTH}px, q${QUALITY}\n`);

  const renameMap = {}; // old filename → new filename
  let beforeBytes = 0, afterBytes = 0, done = 0, failed = 0;

  for (const file of files) {
    const src = path.join(SHOP_DIR, file);
    const stem = file.replace(/\.[^.]+$/, '');
    const dst = path.join(SHOP_DIR, `${stem}.webp`);
    try {
      const before = fs.statSync(src).size;
      beforeBytes += before;
      await sharp(src)
        .resize({ width: MAX_WIDTH, withoutEnlargement: true, fit: 'inside' })
        .webp({ quality: QUALITY, effort: 4 })
        .toFile(dst);
      const after = fs.statSync(dst).size;
      afterBytes += after;
      if (file !== `${stem}.webp`) fs.unlinkSync(src);
      renameMap[`/shop/${file}`] = `/shop/${stem}.webp`;
      done++;
      if (done % 25 === 0) {
        process.stdout.write(`\r  ${done}/${files.length}  before=${(beforeBytes/1024/1024).toFixed(1)}MB  after=${(afterBytes/1024/1024).toFixed(1)}MB   `);
      }
    } catch (e) {
      failed++;
      console.warn(`\n  [fail] ${file}: ${e.message}`);
    }
  }

  // Rewrite the cache JSON
  const data = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));
  let rewritten = 0;
  for (const items of Object.values(data)) {
    for (const p of items) {
      if (renameMap[p.image]) { p.image = renameMap[p.image]; rewritten++; }
    }
  }
  fs.writeFileSync(CACHE, JSON.stringify(data, null, 2));

  console.log(`\n\nDone. ${done} optimized, ${failed} failed.`);
  console.log(`Total: ${(beforeBytes/1024/1024).toFixed(1)} MB → ${(afterBytes/1024/1024).toFixed(1)} MB  (${((1 - afterBytes/beforeBytes) * 100).toFixed(0)}% smaller)`);
  console.log(`Cache JSON: ${rewritten} image paths rewritten.`);
})().catch(e => { console.error(e); process.exit(1); });
