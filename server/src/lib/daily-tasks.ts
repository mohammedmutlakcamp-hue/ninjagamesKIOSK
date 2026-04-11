// Daily task progress tracking helper
// Import and call trackDailyTask() from any component to update progress

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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
  | 'earn_coins';    // earned coins from mini games

// Task IDs must match DAILY_TASKS in DailyTasksTab.tsx
const ACTION_TO_TASKS: Record<TaskAction, string[]> = {
  send_coins:    ['send_coins'],
  open_chest:    ['open_chest'],
  order_food:    ['order_food'],
  play_time:     ['play_30_min'],
  add_friend:    ['add_friend'],
  launch_game:   ['play_game'],
  play_minigame: ['play_game'],
  get_headshot:  [],
  earn_coins:    [],
};

/**
 * Update daily task progress for a player.
 * Call this whenever a tracked action happens.
 */
export async function trackDailyTask(playerId: string, action: TaskAction, amount = 1) {
  const todayKey = getTodayKey();
  const docRef = doc(db, 'daily-tasks', `${playerId}_${todayKey}`);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) return; // tasks not initialized yet

    const data = snap.data();
    const tasks = data.tasks || {};
    let changed = false;

    const taskIds = ACTION_TO_TASKS[action] || [];
    const updatedTasks = { ...tasks };

    for (const taskId of taskIds) {
      const task = updatedTasks[taskId];
      if (!task || task.claimed) continue;

      updatedTasks[taskId] = {
        ...task,
        progress: task.progress + amount,
      };
      changed = true;
    }

    if (changed) {
      await setDoc(docRef, { tasks: updatedTasks }, { merge: true });
    }
  } catch (err) {
    console.error('Failed to track daily task:', err);
  }
}
