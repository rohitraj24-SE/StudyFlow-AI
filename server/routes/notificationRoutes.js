const express = require('express');
const router = express.Router();
const PushSubscription = require('../models/PushSubscription');
const { protect } = require('../middleware/authMiddleware');
const pushSender = require('../utils/pushSender');

// @route   GET /api/notifications/vapid-public-key
// @desc    Public endpoint (no auth) - the frontend needs the VAPID public
//          key to create a push subscription. The PRIVATE key never leaves
//          the server; only this public key is exposed.
router.get('/vapid-public-key', (req, res) => {
  if (!pushSender.isConfigured()) {
    return res.json({ configured: false, publicKey: null });
  }
  res.json({ configured: true, publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.use(protect);

// @route   POST /api/notifications/subscribe
// @desc    Saves (or refreshes) a push subscription for the current user's
//          device/browser. Upserted by endpoint so re-subscribing the same
//          browser doesn't create duplicate rows.
router.post('/subscribe', async (req, res) => {
  try {
    const { subscription, userAgent } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ message: 'A valid push subscription object is required' });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        user: req.user._id,
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        userAgent: userAgent || req.headers['user-agent'] || '',
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ message: 'Push subscription saved' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   DELETE /api/notifications/unsubscribe
// @desc    Removes a push subscription (called when the user disables
//          notifications, or the browser reports the subscription changed).
router.delete('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: 'endpoint is required' });
    await PushSubscription.deleteOne({ endpoint, user: req.user._id });
    res.json({ message: 'Unsubscribed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/notifications/test
// @desc    Sends a one-off test push to every device the current user has
//          subscribed, so they can confirm background notifications work.
router.post('/test', async (req, res) => {
  try {
    const result = await pushSender.sendToUser(req.user._id, {
      title: 'StudyFlow AI 📚',
      body: 'Background push notifications are working! You will now get reminders even when this tab is closed.',
      url: '/',
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
