// ===== STUDYFLOW AI SERVICE WORKER =====
// Enables background push notifications (session reminders, streak nudges,
// interview deadline warnings) that fire even when the app tab is closed,
// as long as the browser is running and the OS allows push delivery.
//
// This file must be served from the site root (/sw.js) so its scope covers
// the whole app - see public/notifications.js for registration.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Fired when the backend (server/utils/pushSender.js) sends a push message
// via the Push API. The payload is JSON: { title, body, url }.
self.addEventListener('push', (event) => {
  let data = { title: 'StudyFlow AI 📚', body: 'You have a new update.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (err) {
    // Non-JSON payload - fall back to defaults above.
  }

  const options = {
    body: data.body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: data.url || '/' },
    tag: data.tag || 'studyflow-notification',
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Clicking a notification focuses an existing StudyFlow tab if one is open,
// otherwise opens a new one at the target URL.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
