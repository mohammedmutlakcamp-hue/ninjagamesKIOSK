#!/usr/bin/env node
/**
 * Scrapes real PC parts data from iGeek Jordan (igeekjo.com), Shopify-based.
 *
 * Public endpoint: https://igeekjo.com/collections/<handle>/products.json?page=N
 * No auth, no key. Returns title, vendor, price (JOD), images, sku, body_html.
 *
 * Output: src/lib/shop/data/igeek-cache.json
 *
 * Re-run any time iGeek updates pricing/stock:
 *   node scripts/scrape-igeek.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, '..', 'src', 'lib', 'shop', 'data', 'igeek-cache.json');
const PER_CATEGORY_LIMIT = 30; // keep catalog manageable

// Map our category slugs -> iGeek collection handles (in priority order)
const CATEGORY_MAP = {
  gpu:         ['graphic-cards-1'],
  cpu:         ['processors-1'],
  motherboard: ['motherboards-1'],
  ram:         ['ram-1'],
  storage:     ['internal-storage', 'storage-1'],
  psu:         ['power-supply'],
  case:        ['case'],
  cooling:     ['pc-cooling'],
  monitor:     ['gaming-monitors', 'monitors'],
  keyboard:    ['keyboards'],
  mouse:       ['mouse-1'],
  headset:     ['headsets'],
  controller:  ['playstation-5-controller', 'xbox-controller', 'pc-controllers'],
  prebuilt:    ['pre-built-pcs'],
  laptop:      ['gaming-laptops'],
  audio:       ['microphone-1'],
};

// Vendor names on iGeek are inconsistent: "Brand: Razer", "iGeek Megastore",
// or just "Razer". Normalize. If vendor is generic, try to pull brand from title.
const KNOWN_BRANDS = ['ASUS','MSI','Gigabyte','ASRock','NVIDIA','AMD','Intel','Sapphire','PowerColor','XFX','Zotac','PNY','Corsair','Kingston','Crucial','Samsung','WD','Seagate','SanDisk','Sony','Microsoft','Logitech','Razer','SteelSeries','HyperX','Cooler Master','NZXT','Lian Li','Fractal Design','Be Quiet!','Thermaltake','EVGA','Seasonic','Phanteks','Hyte','Acer','Dell','Alienware','HP','Lenovo','Apple','Nintendo','Nacon','Scuf','Turtle Beach','Astro','Beyerdynamic','Audeze','Sennheiser','EPOS','Edifier','JBL','Bose','Yamaha','KRK','Shure','Elgato','Fantech','Redragon','Glorious','Keychron','Wooting','GameMax','Darkflash','Arctic','Noctua','Thermalright','DeepCool','Sades','Ragnok','Axle','G.Skill'];
const cleanVendor = (vendor, title) => {
  let v = String(vendor || '').replace(/^Brand[:\s]+/i, '').trim();
  if (!v || /^(igeek|unknown)/i.test(v)) {
    const t = String(title || '');
    for (const b of KNOWN_BRANDS) {
      const re = new RegExp(`\\b${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(t)) return b;
    }
    return 'Generic';
  }
  return v;
};
// Strip mojibake: U+FFFD (replacement char), trademark/registered marks that
// arrive corrupted from iGeek's source feed.
const cleanText = (s) => String(s || '')
  .replace(/[\uFFFD\u2122\u00AE\u00A9]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const get = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error(`bad JSON from ${url}: ${e.message}`)); }
    });
  }).on('error', reject);
});

// Shopify body_html → very rough specs extractor.
// Looks for "<strong>Key:</strong> Value" or "<strong>Key</strong>: Value" patterns.
const extractSpecs = (html) => {
  if (!html) return {};
  const text = html.replace(/<\/?[^>]+(>|$)/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  const specs = {};
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^([A-Za-z][A-Za-z0-9 \/()+\-]{1,30})\s*[::]\s*(.{1,80})$/);
    if (m) {
      const key = m[1].trim().toLowerCase().replace(/\s+/g, '_');
      const val = m[2].trim();
      if (key.length < 30 && val.length < 80 && !specs[key]) specs[key] = val;
      if (Object.keys(specs).length >= 8) break;
    }
  }
  return specs;
};

const cleanDesc = (html) => {
  if (!html) return '';
  return html
    .replace(/<\/?[^>]+(>|$)/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
};

const transform = (raw, category, idx) => {
  const variant = (raw.variants || [])[0] || {};
  const image = (raw.images || [])[0]?.src || '';
  const price = parseFloat(variant.price || '0');
  const msrp = variant.compare_at_price ? parseFloat(variant.compare_at_price) : null;
  if (!price || !image) return null;
  return {
    id: `ig-${category}-${idx}-${raw.id}`,
    category,
    brand: cleanVendor(raw.vendor, raw.title),
    name: cleanText(raw.title),
    model: cleanText(variant.sku || raw.handle.toUpperCase().slice(0, 30)),
    priceJod: Math.round(price * 100) / 100,
    msrpJod: msrp && msrp > price ? Math.round(msrp * 100) / 100 : null,
    inStock: variant.available !== false,
    image,
    specs: extractSpecs(raw.body_html),
    description: cleanText(cleanDesc(raw.body_html) || `${raw.vendor || ''} ${raw.title}`),
    tags: (Array.isArray(raw.tags) ? raw.tags : String(raw.tags || '').split(',')).map(t => String(t).trim()).filter(Boolean).slice(0, 6),
  };
};

const fetchCollection = async (handle, category) => {
  const collected = [];
  for (let page = 1; page <= 3 && collected.length < PER_CATEGORY_LIMIT; page++) {
    const url = `https://igeekjo.com/collections/${handle}/products.json?limit=250&page=${page}`;
    try {
      const data = await get(url);
      const products = data.products || [];
      if (products.length === 0) break;
      for (const p of products) {
        const t = transform(p, category, collected.length);
        if (t && !collected.find(x => x.name === t.name)) collected.push(t);
        if (collected.length >= PER_CATEGORY_LIMIT) break;
      }
      if (products.length < 250) break;
    } catch (e) { console.warn(`  fail ${handle} p${page}: ${e.message}`); break; }
  }
  return collected;
};

(async () => {
  const result = {};
  let total = 0;
  for (const [category, handles] of Object.entries(CATEGORY_MAP)) {
    const list = [];
    for (const handle of handles) {
      const more = await fetchCollection(handle, category);
      for (const m of more) {
        if (list.length < PER_CATEGORY_LIMIT && !list.find(x => x.name === m.name)) list.push(m);
      }
      if (list.length >= PER_CATEGORY_LIMIT) break;
    }
    result[category] = list;
    total += list.length;
    console.log(`  ${category.padEnd(12)} ${list.length} products  (from ${handles.join('+')})`);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`\nWrote ${total} products to ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });
