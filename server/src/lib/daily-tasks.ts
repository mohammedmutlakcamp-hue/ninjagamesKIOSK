// Daily task progress tracking helper
// Import and call trackDailyTask() from any component to update progress

import { db } from '@/lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type TaskAction =
  | 'send_coins'     // sent coins to a friend
  | 'open_chest'     // opened a chest
  | 'order_food'     // ordered food/drinks
  | 'play_time'      // minutes played (pass amount in minutes)
  | 'add_friend'     // added a friend
  | 'launch_game'    // launched a game
  | 'play_minigame'  // played a mini game
  | 'get_headshot'   // got headshots in aim trainer
  | 'earn_coins'     // earned coins from mini games
  | 'check_socials'; // opened social-bonus verification popup

// Task IDs must match DAILY_TASKS in DailyTasksTab.tsx
const ACTION_TO_TASKS: Record<TaskAction, string[]> = {
  send_coins:    ['send_coins'],
  open_chest:    ['open_chest'],
  order_food:    ['order_food'],
  play_time:     ['play_30_min'],
  add_friend:    ['add_friend'],
  launch_game:   ['launch_game'],
  play_minigame: ['play_minigame'],
  get_headshot:  ['get_headshot'],
  earn_coins:    ['earn_coins'],
  check_socials: ['check_socials'],
};

// Mirrors DAILY_TASKS in DailyTasksTab.tsx — keep IDs in sync. Used to
// auto-initialize a player's daily-tasks doc on the very first tracked
// action of the day, so tasks fire BEFORE the player opens the Tasks tab.
const DEFAULT_TASK_IDS = [
  'daily_login', 'play_30_min', 'open_chest', 'send_coins',
  'order_food', 'play_minigame', 'get_headshot', 'earn_coins',
  'add_friend', 'launch_game', 'check_socials',
];

/**
 * Update daily task progress for a player.
 * Call this whenever a tracked action happens.
 *
 * Auto-creates the daily-tasks doc on first use of the day — no need to
 * wait for the player to open the Tasks tab first.
 */
export async function trackDailyTask(playerId: string, action: TaskAction, amount = 1) {
  if (!playerId) return;
  const todayKey = getTodayKey();
  const docRef = doc(db, 'daily-tasks', `${playerId}_${todayKey}`);
  const taskIds = ACTION_TO_TASKS[action] || [];
  if (taskIds.length === 0) return;

  // Transaction so concurrent writes (e.g. bulk chest opens that fire
  // multiple trackDailyTask calls in parallel) don't clobber each other.
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      let tasks: Record<string, { progress: number; claimed: boolean }>;
      let isNew = false;

      if (snap.exists()) {
        tasks = { ...(snap.data().tasks || {}) };
      } else {
        tasks = {};
        DEFAULT_TASK_IDS.forEach(id => {
          tasks[id] = { progress: id === 'daily_login' ? 1 : 0, claimed: false };
        });
        isNew = true;
      }

      let changed = false;
      for (const taskId of taskIds) {
        const task = tasks[taskId];
        if (!task || task.claimed) continue;
        tasks[taskId] = { ...task, progress: (task.progress || 0) + amount };
        changed = true;
      }

      if (!changed && !isNew) return;

      if (isNew) {
        tx.set(docRef, {
          tasks,
          date: todayKey,
          playerId,
          fullBonusClaimed: false,
        });
      } else {
        tx.set(docRef, { tasks }, { merge: true });
      }
    });
  } catch (err) {
    console.error('Failed to track daily task:', err);
  }
}
