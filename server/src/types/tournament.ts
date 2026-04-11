// ==================== MINI GAMES ====================
export type MiniGameId = 'ninja-royale' | 'drift-kings' | 'slash-survival' | 'aim-trainer' | 'ninja-runner';

// ==================== TOURNAMENTS ====================
export type TournamentStatus = 'upcoming' | 'registration' | 'active' | 'completed' | 'cancelled';
export type TournamentFormat = '1v1' | '2v2' | 'ffa' | 'bracket';

export interface Tournament {
  id: string;
  name: string;
  game: string;
  description: string;
  format: TournamentFormat;
  
  entryFee: number;
  maxPlayers: number;
  minPlayers: number;
  
  prizePool: number;
  prizeDistribution: PrizeSlot[];
  adminProfit: number;
  
  registrationStart: number;
  registrationEnd: number;
  startTime: number;
  endTime: number | null;
  
  status: TournamentStatus;
  participants: TournamentParticipant[];
  brackets: TournamentBracket[];
  results: TournamentResult[];
  
  rules: string;
  termsAndConditions: string;
  
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface PrizeSlot {
  position: number;
  percentage: number;
  coins: number;
}

export interface TournamentParticipant {
  playerId: string;
  playerName: string;
  registeredAt: number;
  paid: boolean;
  seed: number | null;
  eliminated: boolean;
  // Club registration metadata (optional — only set when registered as part of a club).
  registrationMode?: 'single' | 'club';
  clubId?: string;
  clubName?: string;
  clubTag?: string;
  // Who actually paid the entry fee (for club registrations, this is the acting member,
  // but the fee comes out of the club treasury, not their personal coins).
  registeredBy?: string;
  // Where prize payouts for this participant should go. Defaults to 'player' (the winner's own coins).
  // When set to 'club', the prize is deposited into the club treasury via `clubId`.
  rewardsTo?: 'player' | 'club';
}

export interface TournamentBracket {
  round: number;
  matchIndex: number;
  player1: string | null;
  player2: string | null;
  winner: string | null;
  score1: number;
  score2: number;
  status: 'pending' | 'active' | 'completed';
}

export interface TournamentResult {
  playerId: string;
  playerName: string;
  position: number;
  prizeClaimed: number;
}

