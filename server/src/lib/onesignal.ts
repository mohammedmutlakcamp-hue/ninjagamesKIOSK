// App ID is public (used client-side) — hardcoded as fallback since NEXT_PUBLIC_ vars
// must be present at build time. REST key from env var or fallback.
const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '236a3577-a482-4cb5-a810-8daccc0272ff';
const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_KEY || process.env.ONESIGNAL_REST_API_KEY || '';

// Initialize OneSignal on client side — auto-prompts for notification permission
export async function initOneSignal(playerUid: string, username: string) {
  if (typeof window === 'undefined') return;
  if (!ONESIGNAL_APP_ID) {
    console.warn('OneSignal App ID not configured');
    return;
  }

  // Wait for OneSignal SDK to load
  await new Promise<void>((resolve) => {
    if ((window as any).OneSignal) { resolve(); return; }
    const check = setInterval(() => {
      if ((window as any).OneSignal) { clearInterval(check); resolve(); }
    }, 100);
    // Timeout after 10s
    setTimeout(() => { clearInterval(check); resolve(); }, 10000);
  });

  const OneSignal = (window as any).OneSignal;
  if (!OneSignal) return;

  try {
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      serviceWorkerParam: { scope: '/' },
      serviceWorkerPath: '/OneSignalSDKWorker.js',
      notifyButton: { enable: false },
      allowLocalhostAsSecureOrigin: true,
      promptOptions: {
        slidedown: {
          prompts: [{
            type: 'push',
            autoPrompt: true,
            text: {
              actionMessage: 'Get notified when friends come online, receive tokens, and more!',
              acceptButton: 'Allow',
              cancelButton: 'Later',
            },
          }],
        },
      },
    });

    // Set external user ID for targeted notifications
    await OneSignal.login(playerUid);

    // Add tags for filtering
    await OneSignal.User.addTags({
      username: username,
      uid: playerUid,
    });

    // Auto-request permission (shows native prompt on iOS 16.4+)
    const permission = await OneSignal.Notifications.permission;
    if (!permission) {
      await OneSignal.Notifications.requestPermission();
    }
  } catch (err) {
    console.error('OneSignal init error:', err);
  }
}

// Send notification via REST API (server-side or from admin)
export async function sendNotification(params: {
  title: string;
  message: string;
  targetUids?: string[]; // specific player UIDs, or empty for all
  data?: Record<string, string>;
  url?: string;
}) {
  const body: any = {
    app_id: ONESIGNAL_APP_ID,
    headings: { en: params.title },
    contents: { en: params.message },
    url: params.url || 'https://www.ninjagamesjo.com/app',
    data: params.data || {},
    chrome_web_icon: 'https://www.ninjagamesjo.com/img/icon-192.png',
  };

  if (params.targetUids && params.targetUids.length > 0) {
    body.include_aliases = { external_id: params.targetUids };
    body.target_channel = 'push';
  } else {
    body.included_segments = ['All'];
  }

  // OneSignal v2 keys (os_v2_*) use "Key", older keys use "Basic"
  const authPrefix = ONESIGNAL_REST_KEY.startsWith('os_v2_') ? 'Key' : 'Basic';

  const res = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `${authPrefix} ${ONESIGNAL_REST_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const result = await res.json();
  if (!res.ok) {
    console.error('OneSignal API error:', JSON.stringify(result));
  }
  return result;
}

// ─── Notification helpers ────────────────────────────────────

export async function notifyFriendOnline(friendUids: string[], username: string) {
  if (friendUids.length === 0) return;
  return sendNotification({
    title: 'Friend Online! 🟢',
    message: `${username} just came online at Ninja Games`,
    targetUids: friendUids,
    data: { type: 'friend_online', username },
  });
}

export async function notifyCoinsReceived(targetUid: string, senderName: string, amount: number) {
  return sendNotification({
    title: 'Tokens Received! 🪙',
    message: `${senderName} sent you ${amount} tokens`,
    targetUids: [targetUid],
    data: { type: 'coins_received', sender: senderName, amount: String(amount) },
  });
}

export async function notifyChestReceived(targetUid: string, senderName: string, chestName: string) {
  return sendNotification({
    title: 'Gift Received! 🎁',
    message: `${senderName} sent you a ${chestName}`,
    targetUids: [targetUid],
    data: { type: 'chest_received', sender: senderName, chest: chestName },
  });
}

export async function notifyFriendPlaying(friendUids: string[], username: string, gameName: string) {
  if (friendUids.length === 0) return;
  return sendNotification({
    title: 'Friend Playing! 🎮',
    message: `${username} is playing ${gameName}`,
    targetUids: friendUids,
    data: { type: 'friend_playing', username, game: gameName },
  });
}

export async function notifyDailyTasksReset() {
  return sendNotification({
    title: 'Daily Tasks Reset! ⚡',
    message: 'New daily tasks are available. Come claim your rewards!',
    data: { type: 'daily_tasks_reset' },
  });
}

export async function notifyCustom(title: string, message: string, targetUids?: string[]) {
  return sendNotification({ title, message, targetUids });
}
