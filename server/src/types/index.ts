// ==================== PLAYER ====================
export interface Player {
  uid: string;
  username: string;
  phone: string;
  pin: string; // 6-digit hashed
  coins: number;
  totalCoinsSpent: number;
  totalPlaytime: number; // minutes
  character: PlayerCharacter;
  inventory: InventoryItem[];
  titles: string[];
  activeTitle: string;
  stats: PlayerStats;
  linkedAccounts?: LinkedAccounts;
  lastStatSync?: number;
  createdAt: number;
  lastLogin: number;
  banned: boolean;
  vip?: VIPSubscription;
  equippedNinja?: string;
  ownedNinjas?: string[];
  level?: number;
  dailyLoginStreak?: number;
  lastDailyLogin?: number;
  ninjaType?: string;
  referralCode?: string;
  referredBy?: string;
  // New fields
  bio?: string;
  socialLinks?: SocialLinks;
  privacySettings?: PrivacySettings;
  totalGiftsReceived?: number;
  gamePlaytime?: Record<string, number>; // gameId -> minutes
  profileColor?: string; // paid profile color
  profileSkin?: string; // paid profile skin id
  country?: string; // country flag id
}

export interface SocialLinks {
  instagram?: string;
  discord?: string;
  tiktok?: string;
  snapchat?: string;
  youtube?: string;
}

export interface PrivacySettings {
  inventoryVisibility: 'public' | 'friends' | 'private';
  profileVisibility: 'public' | 'friends' | 'private';
}

export interface LinkedAccounts {
  steam?: { steamId: string; username: string };
  riot?: { gameName: string; tagLine: string };       // Valorant + LoL
  epic?: { username: string };                         // Fortnite
}

export interface PlayerCharacter {
  skinColor: string;
  outfitId: string;
  maskId: string;
  accessoryId: string;
  equippedSkins: string[];
}

export interface PlayerStats {
  totalKills: number;
  totalDeaths: number;
  totalHeadshots: number;
  totalWins: number;
  gamesPlayed: number;
  chestsOpened: number;
  foodOrdered: number;
  longestStreak: number;
  favoriteGame: string;
  gameStats: Record<string, GameStats>;
}

export interface GameStats {
  hoursPlayed: number;
  kills: number;
  deaths: number;
  headshots: number;
  wins: number;
  lastPlayed: number;
}

// ==================== PC / KIOSK ====================
export type PCStatus = 'free' | 'occupied' | 'reserved' | 'locked' | 'offline' | 'maintenance';

export interface PC {
  id: string;
  name: string; // "PC-01", "PC-02", etc.
  hostname: string;
  status: PCStatus;
  currentPlayer: string | null; // player uid
  currentPlayerName: string | null;
  sessionStart: number | null;
  coinsRemaining: number | null;
  minutesRemaining: number | null;
  reservedBy: string | null;
  reservedAt: number | null;
  reservationExpires: number | null;
  specs: string;
  ipAddress: string;
  lastHeartbeat: number;
  games: InstalledGame[];
  lockdownActive: boolean;
  macAddress: string;
}

export interface InstalledGame {
  id: string;
  name: string;
  exePath: string;
  coverImage: string;
  genre: string;
  players: string;
  rating: number;
  supportsStats: boolean;
  statsApi: 'steam' | 'valorant' | 'fortnite' | 'pubg' | 'apex' | 'r6' | 'manual' | 'none';
}

// ==================== GAMES CATALOG ====================
export interface GameCatalog {
  id: string;
  name: string;
  coverImage: string;
  bannerImage?: string;
  /** Optional looping video shown in the hero banner instead of bannerImage. Path under /public, e.g. '/games/gta-banner.mp4'. */
  bannerVideo?: string;
  genre: string;
  players: string;
  rating: number;
  description: string;
  supportsStats: boolean;
  statsApi: string;
  defaultExePath: string;
}

// ==================== COINS ====================
export interface CoinPackage {
  id: string;
  coins: number;
  price: number; // in local currency
  label: string;
  popular?: boolean;
}

export interface CoinTransaction {
  id: string;
  playerId: string;
  type: 'purchase' | 'spend' | 'reward' | 'refund' | 'admin';
  amount: number;
  description: string;
  timestamp: number;
  adminId?: string;
}

// ==================== CHESTS ====================
export type ChestTier = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical' | 'immortal';

export interface Chest {
  id: string;
  tier: ChestTier;
  name: string;
  cost: number; // coins
  color: string;
  glowColor: string;
  rewards: ChestReward[];
}

export interface ChestReward {
  id: string;
  type: 'skin' | 'coins' | 'voucher' | 'title' | 'xp_boost';
  name: string;
  description: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical' | 'immortal';
  value?: number; // coins amount or discount %
  skinId?: string;
  icon: string;
  image?: string; // path to reward image
  dropRate: number; // 0-1
}

export interface InventoryItem {
  id: string;
  type: ChestReward['type'];
  name: string;
  rarity: string;
  value?: number;
  obtainedAt: number;
  skinId?: string;
  used: boolean;
}

// ==================== NINJA SKINS ====================
export type NinjaTier = 'free' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface NinjaTierPerks {
  chestDiscount: number;        // %
  coinBonus: number;            // %
  xpBoost: number;              // %
  coinTransferFee: number;      // %
  dailyLoginBonus: number;      // coins
  freeWeeklyChest: ChestTier | null;
  nameGlowColor: string | null;
  badge: string | null;
  exclusiveEmojis: number;
  voiceMessages: boolean;
  chatEffects: boolean;
  maxFriends: number;
  profileBorder: 'none' | 'static' | 'pulse' | 'animated' | 'particles';
  customBanner: boolean;
  customBio: boolean;
  animatedFrame: boolean;
  bonusPlaytimeMinutes: number; // per hour
  tournamentDiscount: number;   // %
}

export interface NinjaSkin {
  id: string;
  name: string;
  tier: NinjaTier;
  color: string;                // hex
  description: string;
  vibe?: string;
  category: 'starter' | 'country' | 'rare' | 'epic' | 'legendary' | 'mythic';
  price: number;                // 0 for free, 500 rare, 2000 epic, 5000 legendary, 0 mythic
  unlockLevel?: number;         // 8 for epic, 12 for legendary, 13 for mythic
  borderColor: string;
  profileImage: string;
  fullBodyImage?: string;
  welcomeVideo?: string;
  perks: NinjaTierPerks;
}

// ==================== VIP ====================
export interface VIPSubscription {
  active: boolean;
  expiresAt: number;
  startedAt: number;
  trialUsed: boolean;
  tier: 'basic';
  lastDailyInvite?: number; // timestamp of last daily invite sent
  dailyInviteUsed?: boolean; // has today's invite been used
}

export interface ProfileComment {
  id: string;
  fromId: string;
  fromName: string;
  fromNinjaType?: string;
  text: string;
  createdAt: number;
}

// ==================== STORE ====================
export interface StoreItem {
  id: string;
  type: 'skin' | 'chest' | 'time' | 'coinpack';
  name: string;
  description: string;
  price: number;                // coins for skins/chests/time, JOD for coinpacks
  currency: 'coins' | 'jod';
  image?: string;
  tier?: NinjaTier;
  available: boolean;
  featured?: boolean;
  discount?: number;
}

export interface TimePackage {
  id: string;
  hours: number;
  coins: number;
  label: string;
}

// ==================== FOOD & DRINKS ====================
export interface MenuItem {
  id: string;
  name: string;
  nameAr?: string;
  category: 'drinks' | 'snacks' | 'food';
  price: number; // coins
  priceJOD?: number; // price in JOD
  image: string;
  description: string;
  available: boolean;
  preparationTime: number; // minutes
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export interface FoodOrder {
  id: string;
  playerId: string;
  playerName: string;
  pcId: string;
  items: OrderItem[];
  totalCoins: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  price: number;
}

// ==================== SESSIONS ====================
export interface PlaySession {
  id: string;
  playerId: string;
  playerName: string;
  pcId: string;
  startTime: number;
  endTime: number | null;
  coinsUsed: number;
  gamesPlayed: string[];
  matchResults: MatchResult[];
}

export interface MatchResult {
  gameId: string;
  gameName: string;
  kills: number;
  deaths: number;
  headshots: number;
  won: boolean;
  timestamp: number;
}

// ==================== RESERVATION ====================
export interface Reservation {
  id: string;
  playerId: string;
  playerName: string;
  pcId: string;
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'fulfilled' | 'expired' | 'cancelled';
  coinsCharged: number;
}

// ==================== LEADERBOARD ====================
export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  character: PlayerCharacter;
  title: string;
  value: number;
}

export type LeaderboardType = 'playtime' | 'coins_spent' | 'chests_opened';
export type LeaderboardPeriod = 'weekly' | 'monthly' | 'alltime';

// ==================== ADMIN ====================
export interface Admin {
  uid: string;
  email: string;
  name: string;
  role: 'owner' | 'manager' | 'staff';
  createdAt: number;
}

export interface DailyRevenue {
  date: string;
  coinsSold: number;
  coinsRevenue: number;
  foodRevenue: number;
  totalRevenue: number;
  activePlayers: number;
  totalHoursPlayed: number;
}

// ==================== KIOSK COMMANDS ====================
export type KioskCommand = 'lock' | 'unlock' | 'restart' | 'shutdown' | 'message' | 'wake' | 'lockdown' | 'fullaccess' | 'send-wol' | 'force-logout' | 'freeze' | 'show-message';

export interface KioskCommandMsg {
  id: string;
  pcId: string;
  command: KioskCommand;
  data?: string;
  timestamp: number;
  executed: boolean;
}
