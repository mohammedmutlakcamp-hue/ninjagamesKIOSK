// OneSignal init — runs as plain JS, outside React/Next.js
window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(function(OneSignal) {
  OneSignal.init({
    appId: "236a3577-a482-4cb5-a810-8daccc0272ff",
    safari_web_id: "web.onesignal.auto.3cfe9839-ceab-4809-9212-172318dbfb2e",
    notifyButton: { enable: false },
  });
});
