// ===== DARK MODE =====
// The actual "apply theme before first paint" logic lives as an inline
// snippet in <head> (to avoid a flash of the wrong theme). This file just
// wires up the toggle buttons and keeps them in sync.

const THEME_KEY = 'ssp_theme';

const getStoredTheme = () => localStorage.getItem(THEME_KEY) || 'dark';

const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
  document.querySelectorAll('.js-theme-toggle').forEach((btn) => {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  });
};

const toggleTheme = () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
};

window.addEventListener('DOMContentLoaded', () => {
  applyTheme(getStoredTheme());
});
