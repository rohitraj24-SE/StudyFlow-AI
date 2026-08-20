// ===== DAILY BRIEFING =====
// Powers the card at the top of the Dashboard, pulling from
// GET /api/analytics/briefing (see server/routes/analyticsRoutes.js).

const formatBriefingDate = (date = new Date()) => {
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
};

const relativeDayLabel = (dateInput) => {
  const target = new Date(dateInput);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays > 1 && diffDays <= 6) return `in ${diffDays} days`;
  return target.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const loadBriefing = async () => {
  const dateEl = document.getElementById('briefingDate');
  const listEl = document.getElementById('briefingList');
  const suggestionBox = document.getElementById('briefingAiSuggestion');
  const suggestionText = document.getElementById('briefingAiText');
  if (!listEl) return;

  if (dateEl) dateEl.textContent = formatBriefingDate();

  try {
    const b = await analyticsAPI.briefing();
    const items = [];

    items.push(
      b.totalToday === 0
        ? "You don't have any sessions planned for today yet — head to the Planner to add one."
        : `You have <strong>${b.totalToday}</strong> task${b.totalToday !== 1 ? 's' : ''} planned for today${b.pendingToday !== b.totalToday ? ` (${b.pendingToday} still pending)` : ''}.`
    );

    if (b.nextSession) {
      items.push(`Your next <strong>${escHtml(b.nextSession.subject)}</strong> session starts at <strong>${escHtml(formatTime12(b.nextSession.startTime))}</strong>.`);
    }

    if (b.nearestDeadline) {
      const when = relativeDayLabel(b.nearestDeadline.date);
      items.push(`Your <strong>${escHtml(b.nearestDeadline.company)}</strong> application has a <strong>${escHtml(b.nearestDeadline.type)}</strong> ${when === 'today' || when === 'tomorrow' ? when : `on ${when}`}.`);
    }

    if (b.streak > 0) {
      items.push(`You're on an <strong>${b.streak}-day streak</strong>${b.xpToNext ? ` and need <strong>${b.xpToNext} more XP</strong> to reach Level ${b.level + 1}` : ''}.`);
    } else {
      items.push(`Complete a session today to start a new streak. 🔥`);
    }

    listEl.innerHTML = items.map((i) => `<li>${i}</li>`).join('');

    if (b.topPriorityTask && suggestionBox && suggestionText) {
      suggestionText.innerHTML = `Complete <strong>${escHtml(b.topPriorityTask.subject)}</strong> first because it's your highest-priority unfinished goal.`;
      suggestionBox.style.display = 'flex';
    } else if (suggestionBox) {
      suggestionBox.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load daily briefing', err);
    listEl.innerHTML = '<li>Could not load your briefing right now.</li>';
  }
};
