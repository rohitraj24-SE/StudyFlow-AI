// ===== DAILY MOTIVATION QUOTE =====
// Deterministic: picks the same quote all day, a new one tomorrow, based on
// the day-of-year. No backend/storage needed - works automatically forever
// once deployed.
const MOTIVATION_QUOTES = [
  "Study smarter, not harder — but show up every single day.",
  "Small daily sessions beat one heroic all-nighter.",
  "Your future self is watching you decide right now.",
  "Discipline is choosing between what you want now and what you want most.",
  "Progress, not perfection. Open the book anyway.",
  "The expert in anything was once a beginner who didn't quit.",
  "Consistency turns average effort into extraordinary results.",
  "You don't have to be great to start, but you have to start to be great.",
  "Every session you complete is a rep for your future.",
  "Focus on being productive instead of busy.",
  "A little progress each day adds up to big results.",
  "Don't watch the clock; do what it does — keep going.",
  "The pain of discipline weighs ounces; the pain of regret weighs tons.",
  "Motivation gets you started. Habit keeps you going.",
  "Your only limit is the one you set in your own mind.",
  "Success is the sum of small efforts repeated day in and day out.",
  "Dream big, study hard, stay humble.",
  "It always seems impossible until it's done.",
  "Push yourself, because no one else is going to do it for you.",
  "Great things never came from comfort zones.",
  "The best time to start was yesterday. The next best time is now.",
  "One page at a time — that's how books, and futures, get written.",
  "You are capable of more than you know.",
  "Hard work beats talent when talent doesn't work hard.",
  "Don't wait for motivation. Build discipline and motivation will follow.",
  "Every expert was once a disaster at their first attempt.",
  "Study like you're competing against everyone in the world.",
  "Learning never exhausts the mind, it only feeds it.",
  "The future belongs to those who prepare for it today.",
  "Believe you can, and you're halfway there.",
];

const getDayOfYear = (date = new Date()) => {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const getQuoteOfTheDay = () => {
  const idx = getDayOfYear() % MOTIVATION_QUOTES.length;
  return MOTIVATION_QUOTES[idx];
};

const renderDailyQuote = () => {
  const quote = getQuoteOfTheDay();
  document.querySelectorAll('.js-daily-quote').forEach((el) => {
    el.textContent = `"${quote}"`;
  });
};

window.addEventListener('DOMContentLoaded', renderDailyQuote);
