// Fire-and-forget push notification to admin via OneSignal
export function notifyAdmin(type: string, title: string, message: string) {
  fetch('/api/notify-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, title, message }),
  }).catch(() => {});
}
