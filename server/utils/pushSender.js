// ===== WEB PUSH SENDER =====
// Thin wrapper around the `web-push` package. Centralized here so VAPID
// config only lives in one place, and so a single dead-subscription cleanup
// path is shared by every caller.

let webpush = null;
try {
  webpush = require('web-push');
} catch (err) {
  webpush = null;
}

const PushSubscription = require('../models/PushSubscription');

function isConfigured() {
  return Boolean(webpush && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidSet = false;
function ensureVapid() {
  if (!isConfigured()) return false;
  if (!vapidSet) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    vapidSet = true;
  }
  return true;
}

/**
 * Sends a push notification payload to every subscription belonging to a
 * user. Expired/invalid subscriptions (410 Gone / 404) are removed
 * automatically. Never throws - failures are logged and summarized.
 * @param {string} userId
 * @param {{title: string, body: string, url?: string}} payload
 */
async function sendToUser(userId, payload) {
  if (!ensureVapid()) {
    return { sent: 0, failed: 0, skipped: true, reason: 'Web Push is not configured (missing VAPID keys)' };
  }

  const subs = await PushSubscription.find({ user: userId });
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload)
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        // 404/410 = subscription is gone (browser data cleared, unsubscribed, etc.)
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        }
      }
    })
  );

  return { sent, failed, skipped: false };
}

module.exports = { isConfigured, sendToUser };
