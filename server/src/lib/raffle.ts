// Raffle Chest — a live group raffle.
// Admin configures ONE reward + entry cost + min players, then starts the raffle.
// Players in the kiosk pay the entry cost to join, their avatar appears live for
// everyone else, and when admin presses DRAW a CS:GO-style roulette over the
// entrant photos picks a single winner who is credited the reward automatically.
//
// Storage:
//  - raffles/current   — the one "live" raffle doc. Subscribed to by every kiosk.
//  - raffle-history/{} — archived copies after a raffle is drawn.
//
// Only the admin mutates `status`, `winnerUid`, `winnerIndex`, and starts/ends
// raffles. Players only ever arrayUnion themselves into `entrants`.

export type RaffleRewardType = 'coins' | 'time_minutes' | 'voucher' | 'custom';

export interface RaffleReward {
  name: string;
  nameAr?: string;
  type: RaffleRewardType;
  amount: number;   // coins, minutes, or display-only for custom
  image?: string;   // optional reward image path or data URL
}

export interface RaffleEntrant {
  uid: string;
  username: string;
  profilePhoto?: string;
  ninjaType?: string;
  joinedAt: number;
}

export type RaffleStatus = 'open' | 'drawn' | 'cancelled';

export interface Raffle {
  id: string;
  active: boolean;
  status: RaffleStatus;
  reward: RaffleReward;
  entryCost: number;
  minPlayers: number;
  entrants: RaffleEntrant[];
  winnerUid?: string;
  winnerIndex?: number;
  drawnAt?: number;
  startedAt: number;
}

export const DEFAULT_RAFFLE_REWARD: RaffleReward = {
  name: '1,000 Tokens',
  nameAr: '1,000 توكن',
  type: 'coins',
  amount: 1000,
};

export const DEFAULT_RAFFLE_DRAFT = {
  entryCost: 200,
  minPlayers: 6,
  reward: DEFAULT_RAFFLE_REWARD,
};
