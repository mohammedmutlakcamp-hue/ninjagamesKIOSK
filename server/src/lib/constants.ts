import { Chest, ChestReward, CoinPackage, NinjaSkin, NinjaTier, NinjaTierPerks, TimePackage } from '@/types';

// ==================== COINS & PRICING ====================
// 1 hour = 150 coins = 1.5 JOD → 1 JOD = 100 coins
export const COINS_PER_HOUR = 150;
export const COINS_PER_MINUTE = COINS_PER_HOUR / 60; // 2.5
export const JOD_TO_COINS = 100; // 1 JOD = 100 coins
export const LOW_BALANCE_WARNING = 38; // ~15 min warning
export const GRACE_PERIOD_SECONDS = 30;
export const RESERVATION_MAX_MINUTES = 30;
export const RESERVATION_COIN_RATE = COINS_PER_MINUTE;
export const MIN_DEPOSIT_JOD = 2;

// 7-tier coin packages. Base rate 100 coins per 1 JOD; higher tiers add bonus coins.
// Baseline rate: 100 tokens per 1 JOD. Bonus scales modestly with package
// size and caps at +5% on the 50-JOD Master tier — matches the shop's
// target margin (no over-generous top-ups on any pack).
// Master tier (5250 / 50 JOD / +5%) is the bonus cap — anything bigger granted
// by an admin is pinned to the Master JOD/coin rate via lib/pricing.ts.
export const COIN_PACKAGES: CoinPackage[] = [
  { id: 'pack_starter',  name: 'Starter',  coins: 100,  price: 1,    label: '100 Coins',  bonusPercentage: 0 },
  { id: 'pack_plus',     name: 'Plus',     coins: 230,  price: 2.25, label: '230 Coins',  bonusPercentage: 2 },
  { id: 'pack_pro',      name: 'Pro',      coins: 515,  price: 5,    label: '515 Coins',  bonusPercentage: 3, popular: true },
  { id: 'pack_elite',    name: 'Elite',    coins: 1035, price: 10,   label: '1035 Coins', bonusPercentage: 3.5 },
  { id: 'pack_legend',   name: 'Legend',   coins: 2080, price: 20,   label: '2080 Coins', bonusPercentage: 4 },
  { id: 'pack_ultimate', name: 'Ultimate', coins: 3135, price: 30,   label: '3135 Coins', bonusPercentage: 4.5 },
  { id: 'pack_master',   name: 'Master',   coins: 5250, price: 50,   label: '5250 Coins', bonusPercentage: 5 },
];

// ==================== TIME PACKAGES ====================
// 5-tier time packages paid for in coins. Longer packages = better rate (JOD/hour).
export const TIME_PACKAGES: TimePackage[] = [
  { id: 'time_bronze',   name: 'Bronze',   hours: 1,  coins: 100,  label: '1 Hour' },
  { id: 'time_silver',   name: 'Silver',   hours: 3,  coins: 250,  label: '3 Hours' },
  { id: 'time_gold',     name: 'Gold',     hours: 7,  coins: 500,  label: '7 Hours' },
  { id: 'time_platinum', name: 'Platinum', hours: 12, coins: 780,  label: '12 Hours' },
  { id: 'time_diamond',  name: 'Diamond',  hours: 20, coins: 1160, label: '20 Hours' },
];

// Operational cost per hour (used for P&L and profit calculations)
export const COST_PER_HOUR_JOD = 0.40;

// ==================== NINJA TYPES ====================
export const NINJA_TYPES = [
  { id: 'neon', name: 'Neon Ninja', color: '#39FF14', description: 'Electric energy flows through your veins' },
  { id: 'shadow', name: 'Shadow Ninja', color: '#1a1a2e', description: 'One with the darkness' },
  { id: 'fire', name: 'Fire Ninja', color: '#FF4500', description: 'Born from the flames' },
  { id: 'ice', name: 'Ice Ninja', color: '#00BFFF', description: 'Cold as the arctic wind' },
  { id: 'cyber', name: 'Cyber Ninja', color: '#9B59B6', description: 'Enhanced with technology' },
  { id: 'golden', name: 'Golden Ninja', color: '#FFD700', description: 'Legendary warrior of light' },
  { id: 'phantom', name: 'Phantom Ninja', color: '#8B00FF', description: 'Between worlds, beyond reach' },
] as const;

// ==================== TIER BORDER COLORS ====================
export const TIER_BORDER_COLORS: Record<NinjaTier, string> = {
  free: '#FFFFFF',
  rare: '#1E88E5',
  epic: '#A855F7',
  legendary: '#FF6F00',
  mythic: '#FFD700',
};

// ==================== TIER PERKS ====================
export const TIER_PERKS: Record<NinjaTier, NinjaTierPerks> = {
  free: {
    chestDiscount: 0, coinBonus: 0, xpBoost: 0, coinTransferFee: 10,
    dailyLoginBonus: 0, freeWeeklyChest: null, nameGlowColor: null, badge: null,
    exclusiveEmojis: 0, voiceMessages: false, chatEffects: false, maxFriends: 20,
    profileBorder: 'none', customBanner: false, customBio: false, animatedFrame: false,
    bonusPlaytimeMinutes: 0, tournamentDiscount: 0,
  },
  rare: {
    chestDiscount: 0, coinBonus: 1, xpBoost: 2, coinTransferFee: 8,
    dailyLoginBonus: 5, freeWeeklyChest: null, nameGlowColor: '#1E88E5', badge: 'RARE',
    exclusiveEmojis: 3, voiceMessages: false, chatEffects: false, maxFriends: 30,
    profileBorder: 'static', customBanner: false, customBio: false, animatedFrame: false,
    bonusPlaytimeMinutes: 0, tournamentDiscount: 0,
  },
  epic: {
    chestDiscount: 0, coinBonus: 3, xpBoost: 5, coinTransferFee: 5,
    dailyLoginBonus: 15, freeWeeklyChest: 'common', nameGlowColor: '#A855F7', badge: 'EPIC',
    exclusiveEmojis: 8, voiceMessages: false, chatEffects: false, maxFriends: 50,
    profileBorder: 'pulse', customBanner: false, customBio: true, animatedFrame: false,
    bonusPlaytimeMinutes: 2, tournamentDiscount: 10,
  },
  legendary: {
    chestDiscount: 0, coinBonus: 7, xpBoost: 10, coinTransferFee: 2,
    dailyLoginBonus: 30, freeWeeklyChest: 'uncommon', nameGlowColor: '#FF6F00', badge: 'LEGENDARY',
    exclusiveEmojis: 15, voiceMessages: true, chatEffects: true, maxFriends: 100,
    profileBorder: 'animated', customBanner: true, customBio: true, animatedFrame: false,
    bonusPlaytimeMinutes: 5, tournamentDiscount: 25,
  },
  mythic: {
    chestDiscount: 0, coinBonus: 12, xpBoost: 15, coinTransferFee: 0,
    dailyLoginBonus: 50, freeWeeklyChest: 'rare', nameGlowColor: '#FFD700', badge: 'MYTHIC',
    exclusiveEmojis: 99, voiceMessages: true, chatEffects: true, maxFriends: 200,
    profileBorder: 'particles', customBanner: true, customBio: true, animatedFrame: true,
    bonusPlaytimeMinutes: 10, tournamentDiscount: 100,
  },
};

// ==================== NINJA SKINS (46) ====================
export const NINJA_SKINS: NinjaSkin[] = [
  // --- FREE STARTERS (8) ---
  { id: 'neon', name: 'Neon Ninja', tier: 'free', color: '#39FF14', description: 'Electric energy flows through your veins', vibe: 'electric', category: 'starter', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/neon-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'shadow', name: 'Shadow Ninja', tier: 'free', color: '#1a1a2e', description: 'One with the darkness', vibe: 'stealthy', category: 'starter', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/shadow-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'fire', name: 'Fire Ninja', tier: 'free', color: '#FF4500', description: 'Born from the flames', vibe: 'fierce', category: 'starter', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/fire-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'ice', name: 'Ice Ninja', tier: 'free', color: '#00BFFF', description: 'Cold as the arctic wind', vibe: 'cool', category: 'starter', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/ice-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'cyber', name: 'Cyber Ninja', tier: 'free', color: '#9B59B6', description: 'Enhanced with technology', vibe: 'tech', category: 'starter', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/cyber-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'golden', name: 'Golden Ninja', tier: 'free', color: '#FFD700', description: 'Legendary warrior of light', vibe: 'glorious', category: 'starter', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/golden-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'phantom', name: 'Phantom Ninja', tier: 'free', color: '#8B00FF', description: 'Between worlds, beyond reach', vibe: 'spectral', category: 'starter', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/phantom-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'prince-of-persia', name: 'Prince of Persia', tier: 'free', color: '#D4A574', description: 'Sands of time, blade of legend', vibe: 'royal', category: 'starter', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/prince-of-persia-ninja-profile-photo.png', perks: TIER_PERKS.free },

  // --- FREE COUNTRY (17) ---
  { id: 'jordan', name: 'Jordan', tier: 'free', color: '#007A3D', description: 'Warrior of the Hashemite Kingdom', vibe: 'proud', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/jordan-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'saudi', name: 'Saudi Arabia', tier: 'free', color: '#006C35', description: 'Guardian of the Arabian Peninsula', vibe: 'noble', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/saudi-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'egypt', name: 'Egypt', tier: 'free', color: '#CE1126', description: 'Pharaoh of the Nile, ancient power', vibe: 'ancient', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/egypt-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'palestine', name: 'Palestine', tier: 'free', color: '#007A3D', description: 'Freedom fighter, never broken', vibe: 'resilient', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/palestine-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'uae', name: 'UAE', tier: 'free', color: '#00732F', description: 'Falcon of the Emirates, swift and precise', vibe: 'swift', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/uae-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'iraq', name: 'Iraq', tier: 'free', color: '#CE1126', description: 'Warrior of Mesopotamia, cradle of civilization', vibe: 'fierce', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/iraq-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'lebanon', name: 'Lebanon', tier: 'free', color: '#CC0000', description: 'Cedar of the Mountain, strong and tall', vibe: 'strong', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/lebanon-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'morocco', name: 'Morocco', tier: 'free', color: '#C1272D', description: 'Lion of the Maghreb, king of the west', vibe: 'bold', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/morocco-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'syria', name: 'Syria', tier: 'free', color: '#CE1126', description: 'Guardian of ancient lands and timeless glory', vibe: 'timeless', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/syria-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'kuwait', name: 'Kuwait', tier: 'free', color: '#007A3D', description: 'Desert warrior of the Gulf, pearl of Arabia', vibe: 'determined', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/kuwait-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'qatar', name: 'Qatar', tier: 'free', color: '#8D1B3D', description: 'Champion of the Peninsula, rising power', vibe: 'ambitious', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/qatar-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'tunisia', name: 'Tunisia', tier: 'free', color: '#E70013', description: 'Carthaginian warrior, legacy of legends', vibe: 'historic', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/tunisia-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'algeria', name: 'Algeria', tier: 'free', color: '#006233', description: 'Mountain warrior of North Africa, unbreakable', vibe: 'unbreakable', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/algeria-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'libya', name: 'Libya', tier: 'free', color: '#239E46', description: 'Desert storm warrior of North Africa', vibe: 'wild', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/libya-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'bahrain', name: 'Bahrain', tier: 'free', color: '#CE1126', description: 'Pearl diver warrior of the Gulf', vibe: 'deep', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/bahrain-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'oman', name: 'Oman', tier: 'free', color: '#DB161B', description: 'Warrior of the Frankincense Trail, ancient paths', vibe: 'ancient', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/oman-ninja-profile-photo.png', perks: TIER_PERKS.free },
  { id: 'yemen', name: 'Yemen', tier: 'free', color: '#CE1126', description: 'Warrior of the Happy Land, spirit unbroken', vibe: 'legendary', category: 'country', price: 0, borderColor: TIER_BORDER_COLORS.free, profileImage: '/ninjas/profiles/yemen-ninja-profile-photo.png', perks: TIER_PERKS.free },

  // --- RARE (6) — 500 coins ---
  { id: 'storm', name: 'Storm Ninja', tier: 'rare', color: '#4FC3F7', description: 'Rider of lightning, master of storms', vibe: 'electric', category: 'rare', price: 500, borderColor: TIER_BORDER_COLORS.rare, profileImage: '/ninjas/profiles/storm-ninja-profile-photo.png', perks: TIER_PERKS.rare },
  { id: 'venom', name: 'Venom Ninja', tier: 'rare', color: '#76FF03', description: 'Strike fast, strike lethal — the venom never misses', vibe: 'lethal', category: 'rare', price: 500, borderColor: TIER_BORDER_COLORS.rare, profileImage: '/ninjas/profiles/venom-ninja-profile-photo.png', perks: TIER_PERKS.rare },
  { id: 'blood-moon', name: 'Blood Moon Ninja', tier: 'rare', color: '#D50000', description: 'When the moon bleeds, the hunt begins', vibe: 'dark', category: 'rare', price: 500, borderColor: TIER_BORDER_COLORS.rare, profileImage: '/ninjas/profiles/blood-moon-ninja-profile-photo.png', perks: TIER_PERKS.rare },
  { id: 'crystal', name: 'Crystal Ninja', tier: 'rare', color: '#E0F7FA', description: 'Pure as crystal, sharp as glass', vibe: 'pure', category: 'rare', price: 500, borderColor: TIER_BORDER_COLORS.rare, profileImage: '/ninjas/profiles/crystal-ninja-profile-photo.png', perks: TIER_PERKS.rare },
  { id: 'stealth', name: 'Stealth Ninja', tier: 'rare', color: '#37474F', description: "You only see me when it's too late", vibe: 'invisible', category: 'rare', price: 500, borderColor: TIER_BORDER_COLORS.rare, profileImage: '/ninjas/profiles/stealth-ninja-profile-photo.png', perks: TIER_PERKS.rare },
  { id: 'sakura', name: 'Sakura Ninja', tier: 'rare', color: '#F48FB1', description: 'Deadly as petals in the wind', vibe: 'graceful', category: 'rare', price: 500, borderColor: TIER_BORDER_COLORS.rare, profileImage: '/ninjas/profiles/sakura-ninja-profile-photo.png', perks: TIER_PERKS.rare },

  // --- EPIC (6) — 2000 coins, unlock level 8 ---
  { id: 'void', name: 'Void Ninja', tier: 'epic', color: '#000000', description: 'Born from the void between dimensions', vibe: 'cosmic', category: 'epic', price: 2000, unlockLevel: 8, borderColor: TIER_BORDER_COLORS.epic, profileImage: '/ninjas/profiles/void-ninja-profile-photo.png', perks: TIER_PERKS.epic },
  { id: 'dragon', name: 'Dragon Ninja', tier: 'epic', color: '#FF6D00', description: 'Fire-breathing warrior of ancient legend', vibe: 'fierce', category: 'epic', price: 2000, unlockLevel: 8, borderColor: TIER_BORDER_COLORS.epic, profileImage: '/ninjas/profiles/dragon-ninja-profile-photo.png', perks: TIER_PERKS.epic },
  { id: 'samurai', name: 'Samurai Ninja', tier: 'epic', color: '#B71C1C', description: 'Honor, blade, and unwavering discipline', vibe: 'honorable', category: 'epic', price: 2000, unlockLevel: 8, borderColor: TIER_BORDER_COLORS.epic, profileImage: '/ninjas/profiles/samurai-ninja-profile-photo.png', perks: TIER_PERKS.epic },
  { id: 'jinn', name: 'Jinn Ninja', tier: 'epic', color: '#00BFA5', description: 'Spirit of ancient sorcery and forbidden power', vibe: 'mystical', category: 'epic', price: 2000, unlockLevel: 8, borderColor: TIER_BORDER_COLORS.epic, profileImage: '/ninjas/profiles/jinn-ninja-profile-photo.png', perks: TIER_PERKS.epic },
  { id: 'hashshashin', name: 'Hashshashin Ninja', tier: 'epic', color: '#4E342E', description: 'Assassin of the old order, one blade, one target', vibe: 'assassin', category: 'epic', price: 2000, unlockLevel: 8, borderColor: TIER_BORDER_COLORS.epic, profileImage: '/ninjas/profiles/hashshashin-ninja-profile-photo.png', perks: TIER_PERKS.epic },
  { id: 'titan', name: 'Titan Ninja', tier: 'epic', color: '#78909C', description: 'Mountain-born, unbreakable as stone', vibe: 'unstoppable', category: 'epic', price: 2000, unlockLevel: 8, borderColor: TIER_BORDER_COLORS.epic, profileImage: '/ninjas/profiles/titan-ninja-profile-photo.png', perks: TIER_PERKS.epic },

  // --- LEGENDARY (6) — 5000 coins, unlock level 12 ---
  { id: 'eclipse', name: 'Eclipse Ninja', tier: 'legendary', color: '#FFD700', description: 'Half light, half darkness — balance of all power', vibe: 'balanced', category: 'legendary', price: 5000, unlockLevel: 12, borderColor: TIER_BORDER_COLORS.legendary, profileImage: '/ninjas/profiles/eclipse-ninja-profile-photo.png', perks: TIER_PERKS.legendary },
  { id: 'diamond', name: 'Diamond Ninja', tier: 'legendary', color: '#B3E5FC', description: 'Hardest substance, purest form, unstoppable force', vibe: 'pristine', category: 'legendary', price: 5000, unlockLevel: 12, borderColor: TIER_BORDER_COLORS.legendary, profileImage: '/ninjas/profiles/diamond-ninja-profile-photo.png', perks: TIER_PERKS.legendary },
  { id: 'inferno-king', name: 'Inferno King', tier: 'legendary', color: '#FF1744', description: 'Ruler of the eternal flame, king of destruction', vibe: 'dominating', category: 'legendary', price: 5000, unlockLevel: 12, borderColor: TIER_BORDER_COLORS.legendary, profileImage: '/ninjas/profiles/inferno-king-ninja-profile-photo.png', perks: TIER_PERKS.legendary },
  { id: 'arctic-emperor', name: 'Arctic Emperor', tier: 'legendary', color: '#E1F5FE', description: 'Emperor of the frozen north, cold command', vibe: 'commanding', category: 'legendary', price: 5000, unlockLevel: 12, borderColor: TIER_BORDER_COLORS.legendary, profileImage: '/ninjas/profiles/arctic-emperor-ninja-profile-photo.png', perks: TIER_PERKS.legendary },
  { id: 'shadow-lord', name: 'Shadow Lord', tier: 'legendary', color: '#1A0033', description: 'Lord of shadows, master of the unseen realm', vibe: 'dark', category: 'legendary', price: 5000, unlockLevel: 12, borderColor: TIER_BORDER_COLORS.legendary, profileImage: '/ninjas/profiles/shadow-lord-ninja-profile-photo.png', perks: TIER_PERKS.legendary },
  { id: 'shogun-emperor', name: 'Shogun Emperor', tier: 'legendary', color: '#FF1493', description: 'Supreme ruler of the battlefield, none stand above', vibe: 'supreme', category: 'legendary', price: 5000, unlockLevel: 12, borderColor: TIER_BORDER_COLORS.legendary, profileImage: '/ninjas/profiles/shogun-emperor-ninja-profile-photo.png', perks: TIER_PERKS.legendary },

  // --- MYTHIC (3) — not buyable, unlock level 13 ---
  { id: 'god-ninja', name: 'God Ninja', tier: 'mythic', color: '#FFD700', description: 'Beyond mortal limits, the pinnacle of all ninja kind', vibe: 'divine', category: 'mythic', price: 0, unlockLevel: 13, borderColor: TIER_BORDER_COLORS.mythic, profileImage: '/ninjas/profiles/god-ninja-ninja-profile-photo.png', perks: TIER_PERKS.mythic },
  { id: 'anubis', name: 'Anubis Ninja', tier: 'mythic', color: '#FFD700', description: 'Guardian of the dead, judge of souls, eternal power', vibe: 'eternal', category: 'mythic', price: 0, unlockLevel: 13, borderColor: TIER_BORDER_COLORS.mythic, profileImage: '/ninjas/profiles/anubis-ninja-profile-photo.png', perks: TIER_PERKS.mythic },
  { id: 'gilgamesh', name: 'Gilgamesh Ninja', tier: 'mythic', color: '#8D6E63', description: 'The first hero, seeker of immortality, king of Uruk', vibe: 'immortal', category: 'mythic', price: 0, unlockLevel: 13, borderColor: TIER_BORDER_COLORS.mythic, profileImage: '/ninjas/profiles/gilgamesh-ninja-profile-photo.png', perks: TIER_PERKS.mythic },
];

// ==================== CHESTS ====================
// Each chest has a UNIQUE reward pool with calculated expected values.
// House edge: Common ~48%, Rare ~43%, Legendary ~38%, Mythical ~33%
// Higher tier = better value for players = encourages bigger spends.

// --- COMMON CHEST REWARDS (cost 25, EV ~13) ---
const COMMON_REWARDS: ChestReward[] = [
  { id: 'c_coins_5',  type: 'coins', name: '5 Tokens',   description: 'A tiny bonus',  rarity: 'common',   value: 5,   icon: 'coins', image: '/img/reward-coins-10.png', dropRate: 0.35 },
  { id: 'c_coins_10', type: 'coins', name: '10 Tokens',  description: 'A small bonus',  rarity: 'common',   value: 10,  icon: 'coins', image: '/img/reward-coins-10.png', dropRate: 0.25 },
  { id: 'c_coins_15', type: 'coins', name: '15 Tokens',  description: 'Decent find!',   rarity: 'uncommon', value: 15,  icon: 'coins', image: '/img/reward-coins-25.png', dropRate: 0.18 },
  { id: 'c_drink',    type: 'voucher', name: 'Free Drink', description: 'One free drink', rarity: 'uncommon', value: 30,  icon: 'cup', image: '/img/reward-voucher-drink.png', dropRate: 0.10 },
  { id: 'c_coins_25', type: 'coins', name: '25 Tokens',  description: 'Nice haul!',     rarity: 'rare',     value: 25,  icon: 'coins', image: '/img/reward-coins-25.png', dropRate: 0.07 },
  { id: 'c_snack',    type: 'voucher', name: 'Free Snack', description: 'Snack on us',   rarity: 'rare',     value: 25,  icon: 'cookie', image: '/img/reward-voucher-snack.png', dropRate: 0.03 },
  { id: 'c_coins_50', type: 'coins', name: '50 Tokens',  description: 'Lucky!',         rarity: 'rare',     value: 50,  icon: 'coins', image: '/img/reward-coins-50.png', dropRate: 0.02 },
];

// --- RARE CHEST REWARDS (cost 75, EV ~43) ---
const RARE_REWARDS: ChestReward[] = [
  { id: 'r_coins_15',  type: 'coins',   name: '15 Tokens',     description: 'Small find',          rarity: 'common',    value: 15,  icon: 'coins', image: '/img/reward-coins-10.png', dropRate: 0.25 },
  { id: 'r_coins_25',  type: 'coins',   name: '25 Tokens',     description: 'Decent!',             rarity: 'common',    value: 25,  icon: 'coins', image: '/img/reward-coins-25.png', dropRate: 0.22 },
  { id: 'r_coins_50',  type: 'coins',   name: '50 Tokens',     description: 'Solid bonus!',        rarity: 'uncommon',  value: 50,  icon: 'coins', image: '/img/reward-coins-50.png', dropRate: 0.18 },
  { id: 'r_drink',     type: 'voucher', name: 'Free Drink',    description: 'One free drink',      rarity: 'uncommon',  value: 30,  icon: 'cup',  image: '/img/reward-voucher-drink.png', dropRate: 0.10 },
  { id: 'r_coins_75',  type: 'coins',   name: '75 Tokens',     description: 'Nice jackpot!',       rarity: 'rare',      value: 75,  icon: 'coins', image: '/img/reward-coins-50.png', dropRate: 0.08 },
  { id: 'r_snack',     type: 'voucher', name: 'Free Snack',    description: 'Snack on us',         rarity: 'rare',      value: 25,  icon: 'cookie', image: '/img/reward-voucher-snack.png', dropRate: 0.05 },
  { id: 'r_time_30m',  type: 'voucher', name: '30 Min Free',   description: '30 min of play time', rarity: 'rare',      value: 100, icon: 'clock', image: '/img/reward-time-30m.png', dropRate: 0.04 },
  { id: 'r_skin_storm',  type: 'skin', name: 'Storm Ninja',  description: 'Master of storms',    rarity: 'rare',      skinId: 'storm',  icon: 'skin', image: '/ninjas/profiles/storm-ninja-profile-photo.png',  dropRate: 0.03 },
  { id: 'r_skin_sakura', type: 'skin', name: 'Sakura Ninja', description: 'Deadly grace',        rarity: 'rare',      skinId: 'sakura', icon: 'skin', image: '/ninjas/profiles/sakura-ninja-profile-photo.png', dropRate: 0.03 },
  { id: 'r_coins_150', type: 'coins',   name: '150 Tokens',    description: 'BIG FIND!',           rarity: 'legendary', value: 150, icon: 'coins', image: '/img/reward-coins-150.png', dropRate: 0.02 },
];

// --- LEGENDARY CHEST REWARDS (cost 200, EV ~143 = 28% house margin) ---
// Rebalanced April 2026 after Monte Carlo showed old rates had -88% EV.
// Skin drop rates cut from 4% to 1% (void/dragon), 2% to 0.3% (eclipse).
const LEGENDARY_REWARDS: ChestReward[] = [
  { id: 'l_coins_25',    type: 'coins',   name: '25 Tokens',         description: 'Small start',          rarity: 'common',    value: 25,  icon: 'coins',  image: '/img/reward-coins-25.png',  dropRate: 0.28 },
  { id: 'l_coins_50',    type: 'coins',   name: '50 Tokens',         description: 'Decent!',              rarity: 'uncommon',  value: 50,  icon: 'coins',  image: '/img/reward-coins-50.png',  dropRate: 0.22 },
  { id: 'l_coins_100',   type: 'coins',   name: '100 Tokens',        description: 'Solid haul!',          rarity: 'uncommon',  value: 100, icon: 'coins',  image: '/img/reward-coins-150.png', dropRate: 0.15 },
  { id: 'l_drink',       type: 'voucher', name: 'Free Drink',        description: 'On the house',         rarity: 'uncommon',  value: 30,  icon: 'cup',    image: '/img/reward-voucher-drink.png', dropRate: 0.10 },
  { id: 'l_coins_150',   type: 'coins',   name: '150 Tokens',        description: 'Great find!',          rarity: 'rare',      value: 150, icon: 'coins',  image: '/img/reward-coins-150.png', dropRate: 0.10 },
  { id: 'l_food',        type: 'voucher', name: 'Free Food',         description: 'Full meal on us',      rarity: 'rare',      value: 50,  icon: 'utensils', image: '/img/reward-voucher-food.png', dropRate: 0.05 },
  { id: 'l_time_1h',     type: 'voucher', name: '1 Hour Free',       description: 'Full hour of play',    rarity: 'rare',      value: 200, icon: 'clock',  image: '/img/reward-time-1h.png', dropRate: 0.04 },
  { id: 'l_coins_250',   type: 'coins',   name: '250 Tokens',        description: 'JACKPOT!',             rarity: 'legendary', value: 250, icon: 'coins',  image: '/img/reward-coins-150.png', dropRate: 0.03 },
  { id: 'l_tournament',  type: 'voucher', name: 'Tournament Pass',   description: 'Free tournament entry', rarity: 'legendary', value: 500, icon: 'trophy', image: '/img/reward-tournament-pass.png', dropRate: 0.02 },
  { id: 'l_skin_void',   type: 'skin',    name: 'Void Ninja',        description: 'Born from the void',   rarity: 'legendary', skinId: 'void',   icon: 'skin', image: '/ninjas/profiles/void-ninja-profile-photo.png',   dropRate: 0.010 },
  { id: 'l_skin_dragon', type: 'skin',    name: 'Dragon Ninja',      description: 'Ancient fire warrior',  rarity: 'legendary', skinId: 'dragon', icon: 'skin', image: '/ninjas/profiles/dragon-ninja-profile-photo.png', dropRate: 0.010 },
  { id: 'l_coins_500',   type: 'coins',   name: '500 Tokens',        description: 'MEGA JACKPOT!',        rarity: 'mythical',  value: 500, icon: 'coins',  image: '/img/reward-coins-500.png', dropRate: 0.015 },
  { id: 'l_skin_eclipse', type: 'skin',   name: 'Eclipse Ninja',     description: 'Balance of all power', rarity: 'mythical',  skinId: 'eclipse', icon: 'skin', image: '/ninjas/profiles/eclipse-ninja-profile-photo.png', dropRate: 0.003 },
  { id: 'l_coins_1000',  type: 'coins',   name: '1000 Tokens',       description: 'LEGENDARY JACKPOT!',   rarity: 'immortal',  value: 1000, icon: 'coins', image: '/img/reward-coins-500.png', dropRate: 0.002 },
];

// --- MYTHICAL CHEST REWARDS (cost 400, EV ~268) ---
const MYTHICAL_REWARDS: ChestReward[] = [
  { id: 'm_coins_50',     type: 'coins',   name: '50 Tokens',        description: 'Small start',          rarity: 'common',    value: 50,   icon: 'coins',  image: '/img/reward-coins-50.png',  dropRate: 0.14 },
  { id: 'm_coins_100',    type: 'coins',   name: '100 Tokens',       description: 'Decent!',              rarity: 'uncommon',  value: 100,  icon: 'coins',  image: '/img/reward-coins-150.png', dropRate: 0.17 },
  { id: 'm_coins_150',    type: 'coins',   name: '150 Tokens',       description: 'Nice!',                rarity: 'uncommon',  value: 150,  icon: 'coins',  image: '/img/reward-coins-150.png', dropRate: 0.14 },
  { id: 'm_food',         type: 'voucher', name: 'Free Food',        description: 'Full meal on us',      rarity: 'rare',      value: 50,   icon: 'utensils', image: '/img/reward-voucher-food.png', dropRate: 0.06 },
  { id: 'm_coins_250',    type: 'coins',   name: '250 Tokens',       description: 'Solid!',               rarity: 'rare',      value: 250,  icon: 'coins',  image: '/img/reward-coins-150.png', dropRate: 0.11 },
  { id: 'm_time_1h',      type: 'voucher', name: '1 Hour Free',      description: 'Full hour of play',    rarity: 'rare',      value: 200,  icon: 'clock',  image: '/img/reward-time-1h.png', dropRate: 0.06 },
  { id: 'm_tournament',   type: 'voucher', name: 'Tournament Pass',  description: 'Free entry',           rarity: 'legendary', value: 500,  icon: 'trophy', image: '/img/reward-tournament-pass.png', dropRate: 0.04 },
  { id: 'm_coins_500',    type: 'coins',   name: '500 Tokens',       description: 'JACKPOT!',             rarity: 'legendary', value: 500,  icon: 'coins',  image: '/img/reward-coins-500.png', dropRate: 0.06 },
  { id: 'm_skin_void',    type: 'skin',    name: 'Void Ninja',       description: 'Born from the void',   rarity: 'legendary', skinId: 'void',   icon: 'skin', image: '/ninjas/profiles/void-ninja-profile-photo.png',   dropRate: 0.04 },
  { id: 'm_skin_dragon',  type: 'skin',    name: 'Dragon Ninja',     description: 'Fire warrior',         rarity: 'legendary', skinId: 'dragon', icon: 'skin', image: '/ninjas/profiles/dragon-ninja-profile-photo.png', dropRate: 0.04 },
  { id: 'm_coins_1000',   type: 'coins',   name: '1000 Tokens',      description: 'MEGA JACKPOT!',        rarity: 'mythical',  value: 1000, icon: 'coins',  image: '/img/reward-coins-500.png', dropRate: 0.04 },
  { id: 'm_skin_eclipse', type: 'skin',    name: 'Eclipse Ninja',    description: 'Balance of power',     rarity: 'mythical',  skinId: 'eclipse', icon: 'skin', image: '/ninjas/profiles/eclipse-ninja-profile-photo.png', dropRate: 0.035 },
  { id: 'm_skin_diamond', type: 'skin',    name: 'Diamond Ninja',    description: 'Purest form',          rarity: 'mythical',  skinId: 'diamond', icon: 'skin', image: '/ninjas/profiles/diamond-ninja-profile-photo.png', dropRate: 0.03 },
  { id: 'm_skin_god',     type: 'skin',    name: 'God Ninja',        description: 'THE ULTIMATE',         rarity: 'immortal',  skinId: 'god-ninja', icon: 'skin', image: '/ninjas/profiles/god-ninja-ninja-profile-photo.png', dropRate: 0.005 },
  { id: 'm_coins_2000',   type: 'coins',   name: '2000 Tokens',      description: 'IMMORTAL JACKPOT!!!',  rarity: 'immortal',  value: 2000, icon: 'coins',  image: '/img/reward-coins-500.png', dropRate: 0.01 },
];

// Combine for admin reference
export const CHEST_REWARDS: ChestReward[] = [...COMMON_REWARDS, ...RARE_REWARDS, ...LEGENDARY_REWARDS, ...MYTHICAL_REWARDS];

export const CHESTS: Chest[] = [
  {
    id: 'common',
    tier: 'common',
    name: 'Common Chest',
    nameAr: 'صندوق عادي',
    cost: 25,
    color: '#43d9be',
    glowColor: 'rgba(67, 217, 190, 0.5)',
    rewards: COMMON_REWARDS,
  },
  {
    id: 'rare',
    tier: 'rare',
    name: 'Rare Chest',
    nameAr: 'صندوق نادر',
    cost: 75,
    color: '#FFD700',
    glowColor: 'rgba(255, 215, 0, 0.5)',
    rewards: RARE_REWARDS,
  },
  {
    id: 'legendary',
    tier: 'legendary',
    name: 'Legendary Chest',
    nameAr: 'صندوق أسطوري',
    cost: 200,
    color: '#9B59B6',
    glowColor: 'rgba(155, 89, 182, 0.5)',
    rewards: LEGENDARY_REWARDS,
  },
  {
    id: 'mythical',
    tier: 'mythical',
    name: 'Mythical Chest',
    nameAr: 'صندوق خرافي',
    cost: 400,
    color: '#39FF14',
    glowColor: 'rgba(57, 255, 20, 0.5)',
    rewards: MYTHICAL_REWARDS,
  },
];

// ==================== CHARACTER ====================
export const DEFAULT_CHARACTER = {
  skinColor: '#8D6E63',
  outfitId: 'outfit_default',
  maskId: 'mask_default',
  accessoryId: 'none',
  equippedSkins: [],
  ninjaType: 'neon',
};

export const SKIN_COLORS = [
  '#FDBCB4', '#F1C27D', '#E0AC69', '#C68642', '#8D6E63', '#5D4037', '#3E2723',
];

export const OUTFIT_OPTIONS = [
  { id: 'outfit_default', name: 'Default Ninja', rarity: 'common', color: '#333' },
  { id: 'outfit_black', name: 'Shadow Black', rarity: 'common', color: '#1a1a1a' },
  { id: 'outfit_grey', name: 'Storm Grey', rarity: 'common', color: '#666' },
  { id: 'outfit_green', name: 'Forest Green', rarity: 'common', color: '#2d5016' },
  { id: 'outfit_neon', name: 'Neon Strike', rarity: 'rare', color: '#39FF14' },
  { id: 'outfit_fire', name: 'Inferno', rarity: 'rare', color: '#FF4500' },
  { id: 'outfit_cyber', name: 'Cyber Ninja', rarity: 'epic', color: '#00BFFF' },
  { id: 'outfit_samurai', name: 'Golden Samurai', rarity: 'epic', color: '#FFD700' },
  { id: 'outfit_phantom', name: 'Phantom Lord', rarity: 'legendary', color: '#8B00FF' },
  { id: 'outfit_shogun', name: 'Shogun Emperor', rarity: 'legendary', color: '#FF1493' },
];

export const MASK_OPTIONS = [
  { id: 'mask_default', name: 'Standard Mask', rarity: 'common' },
  { id: 'mask_oni', name: 'Oni Demon', rarity: 'rare' },
  { id: 'mask_dragon', name: 'Dragon', rarity: 'epic' },
];

// ==================== RARITY COLORS ====================
export const RARITY_COLORS = {
  common: { bg: '#4a4a4a', text: '#fff', glow: 'rgba(255,255,255,0.2)' },
  uncommon: { bg: '#43A047', text: '#fff', glow: 'rgba(67,160,71,0.4)' },
  rare: { bg: '#1E88E5', text: '#fff', glow: 'rgba(30,136,229,0.4)' },
  epic: { bg: '#8E24AA', text: '#fff', glow: 'rgba(142,36,170,0.4)' },
  legendary: { bg: '#FF6F00', text: '#fff', glow: 'rgba(255,111,0,0.5)' },
  mythical: { bg: '#E91E63', text: '#fff', glow: 'rgba(233,30,99,0.5)' },
  immortal: { bg: '#FFD700', text: '#000', glow: 'rgba(255,215,0,0.6)' },
  mythic: { bg: '#FFD700', text: '#000', glow: 'rgba(255,215,0,0.6)' }, // alias for skin tiers
};

// ==================== KILL SWITCH ====================
export const KILL_SWITCH_PHRASE = 'ghanemexit';

// ==================== VIP ====================
export const VIP_CONFIG = {
  trialDays: 7,
  priceCoins: 5000, // coin price to buy VIP from store
  durationDays: 30, // VIP lasts 30 days when activated
  cafeDiscountPercent: 10,      // 10% off cafe / hubbly orders for VIP
  dailyTaskBonusCoins: 1,       // +1 coin for each daily task
  dailyInviteFreeMinutes: 30,   // 30 min free play gift
  dailyInviteBonusCoins: 50,    // 50 coins to receiver (transfer-only)
  dailyLoginBonusCoins: 10,     // VIP daily login bonus — auto-awarded once/day
  bookingDurationMinutes: 45,   // VIP booking hold window (regular = 30)
  exclusiveSkins: ['vip-gold', 'vip-diamond', 'vip-platinum'],
};

// ==================== REFERRAL ====================
export const REFERRAL_CONFIG = {
  newUserBonus: 100, // coins for new user
  referrerBonus: 100, // coins for referrer
};

// ==================== USERNAME CHANGE ====================
export const USERNAME_CHANGE_COST = 350; // coins

// ==================== COUNTRY FLAGS ====================
export interface CountryFlag {
  id: string;
  name: string;
  nameAr: string;
  flag: string;       // Emoji (legacy — Windows can't render these)
  code: string;       // ISO 3166-1 alpha-2 (lowercase) — matches /img/flags/{code}.svg
  dialCode: string;   // International phone dial code (with +)
}

export const COUNTRY_FLAGS: CountryFlag[] = [
  { id: 'jordan',    name: 'Jordan',       nameAr: 'الأردن',    flag: '🇯🇴', code: 'jo', dialCode: '+962' },
  { id: 'saudi',     name: 'Saudi Arabia', nameAr: 'السعودية',  flag: '🇸🇦', code: 'sa', dialCode: '+966' },
  { id: 'egypt',     name: 'Egypt',        nameAr: 'مصر',       flag: '🇪🇬', code: 'eg', dialCode: '+20'  },
  { id: 'palestine', name: 'Palestine',    nameAr: 'فلسطين',    flag: '🇵🇸', code: 'ps', dialCode: '+970' },
  { id: 'uae',       name: 'UAE',          nameAr: 'الإمارات',  flag: '🇦🇪', code: 'ae', dialCode: '+971' },
  { id: 'iraq',      name: 'Iraq',         nameAr: 'العراق',    flag: '🇮🇶', code: 'iq', dialCode: '+964' },
  { id: 'lebanon',   name: 'Lebanon',      nameAr: 'لبنان',     flag: '🇱🇧', code: 'lb', dialCode: '+961' },
  { id: 'morocco',   name: 'Morocco',      nameAr: 'المغرب',    flag: '🇲🇦', code: 'ma', dialCode: '+212' },
  { id: 'syria',     name: 'Syria',        nameAr: 'سوريا',     flag: '🇸🇾', code: 'sy', dialCode: '+963' },
  { id: 'kuwait',    name: 'Kuwait',       nameAr: 'الكويت',    flag: '🇰🇼', code: 'kw', dialCode: '+965' },
  { id: 'qatar',     name: 'Qatar',        nameAr: 'قطر',       flag: '🇶🇦', code: 'qa', dialCode: '+974' },
  { id: 'tunisia',   name: 'Tunisia',      nameAr: 'تونس',      flag: '🇹🇳', code: 'tn', dialCode: '+216' },
  { id: 'algeria',   name: 'Algeria',      nameAr: 'الجزائر',   flag: '🇩🇿', code: 'dz', dialCode: '+213' },
  { id: 'libya',     name: 'Libya',        nameAr: 'ليبيا',     flag: '🇱🇾', code: 'ly', dialCode: '+218' },
  { id: 'bahrain',   name: 'Bahrain',      nameAr: 'البحرين',   flag: '🇧🇭', code: 'bh', dialCode: '+973' },
  { id: 'oman',      name: 'Oman',         nameAr: 'عمان',      flag: '🇴🇲', code: 'om', dialCode: '+968' },
  { id: 'yemen',     name: 'Yemen',        nameAr: 'اليمن',     flag: '🇾🇪', code: 'ye', dialCode: '+967' },
];

// ==================== PROFILE SKINS (paid) ====================
export const PROFILE_SKINS = [
  { id: 'default', name: 'Default', color: 'transparent', price: 0 },
  { id: 'crimson', name: 'Crimson', color: '#DC2626', price: 200 },
  { id: 'ocean', name: 'Ocean', color: '#0891B2', price: 200 },
  { id: 'purple-haze', name: 'Purple Haze', color: '#7C3AED', price: 200 },
  { id: 'emerald', name: 'Emerald', color: '#059669', price: 300 },
  { id: 'sunset', name: 'Sunset', color: '#EA580C', price: 300 },
  { id: 'neon-pink', name: 'Neon Pink', color: '#EC4899', price: 400 },
  { id: 'gold-rush', name: 'Gold Rush', color: '#D97706', price: 500 },
  { id: 'ice-blue', name: 'Ice Blue', color: '#06B6D4', price: 500 },
  { id: 'vip-gold', name: 'VIP Gold', color: '#FFD700', price: 0, vipOnly: true },
  { id: 'vip-diamond', name: 'VIP Diamond', color: '#B9F2FF', price: 0, vipOnly: true },
  { id: 'vip-platinum', name: 'VIP Platinum', color: '#E5E4E2', price: 0, vipOnly: true },
];

// ==================== FOOD MENU (JOD prices) ====================
export const MENU_ITEMS = [
  // DRINKS
  { id: 'cola-sm', name: 'Cola Small', nameAr: 'كولا صغير', category: 'drinks' as const, priceJOD: 0.35, image: '/img/menu/cola.jpg' },
  { id: 'cola-lg', name: 'Cola Large', nameAr: 'كولا كبير', category: 'drinks' as const, priceJOD: 0.50, image: '/img/menu/cola.jpg' },
  { id: 'iced-coffee', name: 'Iced Coffee', nameAr: 'قهوة مثلجة', category: 'drinks' as const, priceJOD: 0.75, image: '/img/menu/iced-coffee.jpg' },
  { id: 'energy-drink', name: 'Energy Drink', nameAr: 'مشروب طاقة', category: 'drinks' as const, priceJOD: 0.85, image: '/img/menu/energy-drink.jpg' },
  { id: 'energy-xl', name: 'Energy Drink XL', nameAr: 'مشروب طاقة XL', category: 'drinks' as const, priceJOD: 0.60, image: '/img/menu/energy-drink.jpg' },
  { id: 'energy-bm', name: 'Energy Drink B.M', nameAr: 'مشروب طاقة B.M', category: 'drinks' as const, priceJOD: 0.35, image: '/img/menu/energy-drink.jpg' },
  { id: 'zaki-juice', name: 'Zaki Juice', nameAr: 'عصير زكي', category: 'drinks' as const, priceJOD: 0.15, image: '/img/menu/juice.jpg' },
  { id: 'hot-chocolate', name: 'Hot Chocolate', nameAr: 'شوكولاتة ساخنة', category: 'drinks' as const, priceJOD: 0.60, image: '/img/menu/hot-chocolate.jpg' },
  { id: 'karak-tea', name: 'Karak Tea', nameAr: 'شاي كرك', category: 'drinks' as const, priceJOD: 0.65, image: '/img/menu/karak-tea.jpg' },
  { id: 'tea', name: 'Tea', nameAr: 'شاي', category: 'drinks' as const, priceJOD: 0.35, image: '/img/menu/tea.jpg' },
  { id: 'coffee', name: 'Coffee', nameAr: 'قهوة', category: 'drinks' as const, priceJOD: 0.65, image: '/img/menu/coffee.jpg' },
  { id: 'water-sm', name: 'Water Small', nameAr: 'ماء صغير', category: 'drinks' as const, priceJOD: 0.35, image: '/img/menu/water.jpg' },
  { id: 'water-lg', name: 'Water Large', nameAr: 'ماء كبير', category: 'drinks' as const, priceJOD: 0.50, image: '/img/menu/water.jpg' },
  { id: 'lemon-mint', name: 'Lemon & Mint', nameAr: 'ليمون ونعنع', category: 'drinks' as const, priceJOD: 1.00, image: '/img/menu/lemon-mint.jpg' },
  { id: 'cocktail', name: 'Cocktail', nameAr: 'كوكتيل', category: 'drinks' as const, priceJOD: 1.00, image: '/img/menu/cocktail.jpg' },
  // SNACKS
  { id: 'molto', name: 'Molto', nameAr: 'مولتو', category: 'snacks' as const, priceJOD: 0.60, image: '/img/menu/molto.jpg' },
  { id: 'chips', name: 'Chips', nameAr: 'شيبس', category: 'snacks' as const, priceJOD: 0.35, image: '/img/menu/chips.jpg' },
  { id: 'chocolate-bar', name: 'Chocolate Bar', nameAr: 'شوكولاتة', category: 'snacks' as const, priceJOD: 0.15, image: '/img/menu/chocolate.jpg' },
  { id: 'biscuits', name: 'Biscuits', nameAr: 'بسكويت', category: 'snacks' as const, priceJOD: 0.15, image: '/img/menu/biscuits.jpg' },
  { id: 'fries-sm', name: 'Fries Small', nameAr: 'بطاطا صغير', category: 'snacks' as const, priceJOD: 0.75, image: '/img/menu/fries.jpg' },
  { id: 'fries-lg', name: 'Fries Large', nameAr: 'بطاطا كبير', category: 'snacks' as const, priceJOD: 1.00, image: '/img/menu/fries.jpg' },
  // FOOD (Sandwiches)
  { id: 'ninja-ninja', name: 'Ninja Ninja Sandwich', nameAr: 'نينجا نينجا', category: 'food' as const, priceJOD: 1.75, image: '/img/menu/sandwich.jpg' },
  { id: 'salohy', name: 'Salohy Sandwich', nameAr: 'صلوحي', category: 'food' as const, priceJOD: 1.75, image: '/img/menu/sandwich.jpg' },
  { id: 'zanzon', name: 'Zanzon Sandwich', nameAr: 'زنزون', category: 'food' as const, priceJOD: 1.75, image: '/img/menu/sandwich.jpg' },
  { id: 'amory', name: 'Amory Sandwich', nameAr: 'عموري', category: 'food' as const, priceJOD: 1.75, image: '/img/menu/sandwich.jpg' },
  { id: 'abo-mahmad', name: 'Abo-Mahmad Sandwich', nameAr: 'ابو محمد', category: 'food' as const, priceJOD: 1.75, image: '/img/menu/sandwich.jpg' },
  { id: 'chicken-burger', name: 'Chicken Burger', nameAr: 'برجر دجاج', category: 'food' as const, priceJOD: 1.20, image: '/img/menu/burger.jpg' },
  { id: 'beef-burger', name: 'Beef Burger', nameAr: 'برجر لحم', category: 'food' as const, priceJOD: 1.20, image: '/img/menu/burger.jpg' },
  { id: 'hot-dog', name: 'Hot Dog', nameAr: 'هوت دوغ', category: 'food' as const, priceJOD: 1.20, image: '/img/menu/hotdog.jpg' },
  { id: 'kabab', name: 'Kabab Sandwich', nameAr: 'كباب', category: 'food' as const, priceJOD: 1.00, image: '/img/menu/kabab.jpg' },
];

// ==================== SLOGAN ====================
export const SLOGAN = 'Play More, Pay Less';
