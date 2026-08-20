// ===== BADGE CATALOG (mirrors server/utils/gamification.js) =====
const BADGE_CATALOG = [
  { id: 'first_session', label: 'First Step', emoji: '🌱', desc: 'Completed your first study session' },
  { id: 'streak_3', label: 'On a Roll', emoji: '🔥', desc: '3-day study streak' },
  { id: 'streak_7', label: 'Week Warrior', emoji: '🏆', desc: '7-day study streak' },
  { id: 'streak_30', label: 'Unstoppable', emoji: '💎', desc: '30-day study streak' },
  { id: 'sessions_10', label: 'Getting Serious', emoji: '📚', desc: 'Completed 10 study sessions' },
  { id: 'sessions_50', label: 'Scholar', emoji: '🎓', desc: 'Completed 50 study sessions' },
  { id: 'sessions_100', label: 'Master Student', emoji: '👑', desc: 'Completed 100 study sessions' },
  { id: 'marathon', label: 'Marathoner', emoji: '⏳', desc: 'Completed a session of 2+ hours' },
  { id: 'early_bird', label: 'Early Bird', emoji: '🌅', desc: 'Completed a session starting before 7 AM' },
  { id: 'night_owl', label: 'Night Owl', emoji: '🦉', desc: 'Completed a session starting after 10 PM' },
  { id: 'hours_10', label: '10 Hour Club', emoji: '⏰', desc: 'Studied 10 total hours' },
  { id: 'hours_50', label: '50 Hour Club', emoji: '🕰️', desc: 'Studied 50 total hours' },
];

let currentUserStats = null;

// ===== RENDER GAMIFICATION BAR =====
const renderGamiBar = (stats) => {
  if (!stats) return;
  currentUserStats = stats;

  const $ = (id) => document.getElementById(id);
  $('gamiLevel').textContent = `Lv ${stats.level}`;
  const pct = stats.xpNeeded ? Math.round((stats.xpIntoLevel / stats.xpNeeded) * 100) : 0;
  $('gamiXpFill').style.width = `${pct}%`;
  $('gamiXpText').textContent = `${stats.xpIntoLevel} / ${stats.xpNeeded} XP`;
  $('gamiStreak').textContent = `🔥 ${stats.streak} day streak`;
  $('gamiBadgeCount').textContent = stats.badges ? stats.badges.length : 0;
};

// ===== ACHIEVEMENTS PAGE (sidebar "Achievements") =====
const renderAchievementsTab = () => {
  const grid = document.getElementById('badgesGrid');
  if (!grid) return;
  const earned = new Set((currentUserStats && currentUserStats.badges) || []);

  grid.innerHTML = BADGE_CATALOG.map((b) => `
    <div class="badge-tile ${earned.has(b.id) ? 'earned' : 'locked'}">
      <div class="badge-emoji">${b.emoji}</div>
      <div class="badge-label">${b.label}</div>
      <div class="badge-desc">${b.desc}</div>
    </div>
  `).join('');
};

// ===== SHOW XP / BADGE TOAST AFTER COMPLETING A SESSION =====
const showGamificationToast = (gamification) => {
  if (!gamification) return;
  toast(`+${gamification.xpGained} XP earned! 🌟`, 'success');

  if (gamification.leveledUp) {
    setTimeout(() => toast(`🎉 Level up! You're now Level ${gamification.level}`, 'success'), 900);
  }

  (gamification.newBadges || []).forEach((badge, i) => {
    setTimeout(() => {
      toast(`New badge unlocked: ${badge.emoji} ${badge.label}!`, 'success');
    }, 1600 + i * 900);
  });
};
