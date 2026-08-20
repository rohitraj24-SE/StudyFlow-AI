// ===== SMART REMINDERS & BROWSER ALERTS =====
// Tab-open reminders via the browser Notification API (minute-level accuracy
// for "starts in N minutes" nudges). For reminders that also need to work
// when the tab/browser is closed, see the Background Push section below,
// which layers a service worker (public/sw.js) + Web Push + VAPID on top.

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let notificationTimer = null;
let notifiedToday = new Set();

const getNotifiedStorageKey = () => `ssp_notified_${new Date().toISOString().split('T')[0]}`;

const loadNotifiedToday = () => {
  try {
    const raw = localStorage.getItem(getNotifiedStorageKey());
    notifiedToday = new Set(raw ? JSON.parse(raw) : []);
  } catch {
    notifiedToday = new Set();
  }
};

const saveNotifiedToday = () => {
  localStorage.setItem(getNotifiedStorageKey(), JSON.stringify(Array.from(notifiedToday)));
};

// ===== GENERIC BROWSER NOTIFICATION HELPER =====
// Used for: session-completed celebrations, new job application confirmations,
// and (below) upcoming-session and interview-deadline reminders.
const notifyBrowser = (title, body) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body });
  } catch (err) {
    console.error('Notification failed', err);
  }
};

const toggleNotifications = async () => {
  if (!('Notification' in window)) {
    toast('This browser does not support notifications', 'error');
    return;
  }
  if (Notification.permission === 'granted') {
    toast('Reminders are already enabled 🔔', 'info');
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    toast("Reminders enabled! We'll notify you before sessions start, when you finish one, and about job updates.", 'success');
    notifyBrowser('StudyFlow AI', 'Reminders are now on 🎉');
  } else {
    toast('Notifications permission was not granted', 'error');
  }
};

// ===== REMINDER LEAD-TIME PREFERENCE (Reminders page) =====
const updateReminderMinutes = async (minutesStr) => {
  const minutes = parseInt(minutesStr, 10);
  try {
    const updated = await authAPI.updatePreferences({ reminderMinutesBefore: minutes });
    setAuth(getToken(), updated);
    toast(`Reminder lead time set to ${minutes} minutes`, 'success');
  } catch (err) {
    toast('Failed to update reminder preference', 'error');
  }
};

const checkUpcomingSessions = async () => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  loadNotifiedToday();

  const todayAbbr = DAY_ABBR[new Date().getDay()];
  let sessions;
  try {
    sessions = await sessionsAPI.getByDay(todayAbbr);
  } catch {
    return;
  }

  const user = getUser();
  const reminderMinutes = (user && user.reminderMinutesBefore) || 10;
  const now = new Date();

  for (const s of sessions) {
    if (s.completed) continue;
    const key = `session_${s._id}`;
    if (notifiedToday.has(key)) continue;

    const [h, m] = s.startTime.split(':').map(Number);
    const startDate = new Date(now);
    startDate.setHours(h, m, 0, 0);

    const minutesUntilStart = (startDate - now) / 60000;

    if (minutesUntilStart > 0 && minutesUntilStart <= reminderMinutes) {
      notifyBrowser('📚 Upcoming study session', `${s.subject} starts in ${Math.round(minutesUntilStart)} min (${s.timeSlot})`);
      notifiedToday.add(key);
      saveNotifiedToday();
    }
  }

  // Gentle streak-at-risk nudge, once per day, after 6 PM
  const streakKey = 'streak_nudge';
  if (now.getHours() >= 18 && !notifiedToday.has(streakKey)) {
    const completedToday = sessions.some((s) => s.completed);
    if (!completedToday) {
      notifyBrowser('🔥 Keep your streak alive!', "You haven't completed a study session today yet.");
      notifiedToday.add(streakKey);
      saveNotifiedToday();
    }
  }
};

// ===== JOB / INTERVIEW DEADLINE ALERTS =====
// Once per day, flags any job application with an interview within the next
// 2 days - connects the Job Tracker to the same reminder system as sessions.
const checkJobDeadlines = async () => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const key = `job_deadlines_${new Date().toISOString().split('T')[0]}`;
  if (notifiedToday.has(key)) return;

  try {
    const jobs = await jobsAPI.getAll();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const upcoming = jobs.filter((j) => {
      if (!j.interviewDate || j.status === 'Rejected') return false;
      const diffDays = Math.round((new Date(j.interviewDate).setHours(0, 0, 0, 0) - now) / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 2;
    });

    upcoming.forEach((j) => {
      const diffDays = Math.round((new Date(j.interviewDate).setHours(0, 0, 0, 0) - now) / (1000 * 60 * 60 * 24));
      const when = diffDays === 0 ? 'today' : diffDays === 1 ? 'tomorrow' : `in ${diffDays} days`;
      notifyBrowser('🗓️ Interview coming up', `${j.company} (${j.role}) — interview ${when}`);
    });

    notifiedToday.add(key);
    saveNotifiedToday();
  } catch {
    // silent - non-critical background check
  }
};

// ===== SMART REMAINING-TIME REMINDER (Phase 8) =====
// "You still have 2 hours left from today's study target" - ties the
// notification system to the timer's real remaining-time calculation
// (GET /study-sessions/remaining, already the source of truth for the
// Dashboard's "Today's Learning" ring). Respects the user's configured
// interval (default 2h) and never fires outside 6am-11pm to avoid spam.
const REMAINING_REMINDER_STORAGE_KEY = 'ssp_last_remaining_nudge';

const getLastRemainingNudgeAt = () => {
  const raw = localStorage.getItem(REMAINING_REMINDER_STORAGE_KEY);
  return raw ? new Date(raw) : null;
};

const checkRemainingTargetReminder = async () => {
  const user = getUser();
  if (!user) return;

  const now = new Date();
  const hour = now.getHours();
  if (hour < 6 || hour >= 23) return; // no nudges overnight

  const intervalMinutes = user.remainingReminderIntervalMinutes || 120;
  const lastNudge = getLastRemainingNudgeAt();
  if (lastNudge && (now - lastNudge) / 60000 < intervalMinutes) return;

  try {
    const balance = await timerAPI.remaining();
    if (!balance.targetSeconds || balance.remainingSeconds <= 0) return; // no target today, or already done

    const remainingLabel = typeof fmtHM === 'function' ? fmtHM(balance.remainingSeconds) : `${Math.round(balance.remainingSeconds / 60)}m`;
    const message = `You still have ${remainingLabel} left from today's study target.`;

    if (Notification.permission === 'granted') {
      notifyBrowser('⏳ Study time remaining', message);
    }
    showRemainingReminderBanner(message);

    localStorage.setItem(REMAINING_REMINDER_STORAGE_KEY, now.toISOString());
  } catch (err) {
    // non-critical background check
  }
};

// ===== IN-APP ACTIONABLE BANNER =====
// The plain Notification API doesn't reliably support action buttons for a
// foreground tab (that needs a service worker), so the "Study Now" /
// "Plan Remaining" actions live in this in-app banner instead - shown
// alongside the (buttonless) browser notification above.
const showRemainingReminderBanner = (message) => {
  const banner = document.getElementById('remainingReminderBanner');
  const text = document.getElementById('remainingReminderText');
  if (!banner || !text) return;
  text.textContent = message;
  banner.style.display = 'flex';
};

const dismissRemainingReminderBanner = () => {
  const banner = document.getElementById('remainingReminderBanner');
  if (banner) banner.style.display = 'none';
};

const remainingReminderAction = (action) => {
  dismissRemainingReminderBanner();
  switchTab(action === 'study' ? 'timerTab' : 'plannerTab');
};

// ===== REMAINING-REMINDER INTERVAL PREFERENCE (Reminders page) =====
const updateRemainingReminderInterval = async (minutesStr) => {
  const minutes = parseInt(minutesStr, 10);
  try {
    const updated = await authAPI.updatePreferences({ remainingReminderIntervalMinutes: minutes });
    setAuth(getToken(), updated);
    toast(`We'll check in on your remaining study time every ${minutes >= 60 ? Math.round(minutes / 60) + 'h' : minutes + 'm'}`, 'success');
  } catch (err) {
    toast('Failed to update reminder preference', 'error');
  }
};

const startNotificationWatcher = () => {
  loadNotifiedToday();
  if (notificationTimer) clearInterval(notificationTimer);
  checkUpcomingSessions();
  checkJobDeadlines();
  checkRemainingTargetReminder();
  notificationTimer = setInterval(() => {
    checkUpcomingSessions();
    checkJobDeadlines();
    checkRemainingTargetReminder();
  }, 60 * 1000); // check every minute
};

const stopNotificationWatcher = () => {
  if (notificationTimer) clearInterval(notificationTimer);
  notificationTimer = null;
};

// ===== BACKGROUND PUSH NOTIFICATIONS (service worker + Web Push) =====
// Upgrades the tab-open-only reminders above with real push notifications
// that can arrive even when the StudyFlow tab (or browser window) is
// closed, via a service worker (public/sw.js) + the Push API + VAPID.
// Falls back gracefully everywhere: unsupported browser, no VAPID key
// configured on the server, or permission denied all just show a toast
// instead of throwing.

const _urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('Service worker registration failed', err);
    return null;
  }
};

const isPushSubscribed = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return Boolean(sub);
};

const enablePushNotifications = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toast('This browser does not support background push notifications', 'error');
    return;
  }

  try {
    const { configured, publicKey } = await pushAPI.vapidPublicKey();
    if (!configured) {
      toast('Background push is not configured on this deployment yet (missing VAPID keys) — tab-open reminders still work below.', 'info');
      return;
    }

    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast('Notification permission was not granted', 'error');
        return;
      }
    }

    const reg = await registerServiceWorker();
    if (!reg) {
      toast('Could not register the service worker', 'error');
      return;
    }
    await navigator.serviceWorker.ready;

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(publicKey),
      });
    }

    await pushAPI.subscribe(subscription.toJSON(), navigator.userAgent);
    toast('Background push notifications enabled! You will get reminders even when this tab is closed. 🔔', 'success');
    renderPushToggleState(true);
  } catch (err) {
    console.error('Failed to enable push notifications', err);
    toast('Could not enable background notifications', 'error');
  }
};

const disablePushNotifications = async () => {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const subscription = reg ? await reg.pushManager.getSubscription() : null;
    if (subscription) {
      await pushAPI.unsubscribe(subscription.endpoint).catch(() => {});
      await subscription.unsubscribe();
    }
    toast('Background push notifications disabled', 'info');
    renderPushToggleState(false);
  } catch (err) {
    toast('Failed to disable background notifications', 'error');
  }
};

const sendTestPush = async () => {
  try {
    const result = await pushAPI.test();
    if (result.skipped) {
      toast(result.reason || 'Push is not configured', 'info');
    } else if (result.sent > 0) {
      toast(`Test push sent to ${result.sent} device(s) — check your system notifications`, 'success');
    } else {
      toast('No active push subscriptions found for this account yet', 'info');
    }
  } catch (err) {
    toast('Failed to send test push', 'error');
  }
};

const renderPushToggleState = (subscribed) => {
  const btn = document.getElementById('pushToggleBtn');
  if (!btn) return;
  btn.textContent = subscribed ? '🔕 Disable Background Push' : '🔔 Enable Background Push Notifications';
  btn.onclick = subscribed ? disablePushNotifications : enablePushNotifications;
};

const initPushToggleUi = async () => {
  const subscribed = await isPushSubscribed();
  renderPushToggleState(subscribed);
};
