// Device Booking System
// ─────────────────────────────────────────────────────────────────────────────
// A player can reserve a specific PC for a short hold window. If they don't
// sit at that PC and log in before the window expires, a penalty is applied:
//   - `deductMinutes` minutes subtracted from their remainingPlaytime
//   - `penaltyUntil` set to now + `penaltyMinutes` so they can't re-book until
//     the penalty elapses
//
// All timing is driven by `config/bookings` so admin can tune without deploy.
// Expiry enforcement runs client-side — any active kiosk/mobile client polls
// the player's active booking and, when it crosses expiresAt, applies the
// penalty via a transaction (the doc's `status` moves idempotently from
// 'active' → 'expired', so only the first writer actually deducts).

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface BookingConfig {
  holdMinutes: number;      // how long a booking is held before expiring
  penaltyMinutes: number;   // lockout before a no-show player can book again
  deductMinutes: number;    // playtime subtracted on no-show
  warnAt: number[];         // minutes-remaining thresholds to notify the player
  enabled: boolean;
}

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  holdMinutes: 30,
  penaltyMinutes: 60,
  deductMinutes: 30,
  warnAt: [10, 5],
  enabled: true,
};

export interface Booking {
  id: string;
  playerId: string;
  playerName: string;
  pcId: string;
  pcName: string;
  createdAt: number;
  expiresAt: number;
  status: 'active' | 'fulfilled' | 'expired' | 'cancelled';
  penaltyApplied?: boolean;
  fulfilledAt?: number;
  cancelledAt?: number;
}

export async function loadBookingConfig(): Promise<BookingConfig> {
  try {
    const snap = await getDoc(doc(db, 'config', 'bookings'));
    if (!snap.exists()) return DEFAULT_BOOKING_CONFIG;
    const data = snap.data() as Partial<BookingConfig>;
    return {
      holdMinutes: typeof data.holdMinutes === 'number' ? data.holdMinutes : DEFAULT_BOOKING_CONFIG.holdMinutes,
      penaltyMinutes: typeof data.penaltyMinutes === 'number' ? data.penaltyMinutes : DEFAULT_BOOKING_CONFIG.penaltyMinutes,
      deductMinutes: typeof data.deductMinutes === 'number' ? data.deductMinutes : DEFAULT_BOOKING_CONFIG.deductMinutes,
      warnAt: Array.isArray(data.warnAt) && data.warnAt.length ? data.warnAt : DEFAULT_BOOKING_CONFIG.warnAt,
      enabled: data.enabled !== false,
    };
  } catch {
    return DEFAULT_BOOKING_CONFIG;
  }
}
