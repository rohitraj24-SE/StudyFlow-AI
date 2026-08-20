// ===== FOCUS ACTIVITY HEATMAP =====
// Renders a Mon-Sun x 6am-11pm grid where darker cells mean more completed
// study minutes in that recurring weekly slot. Data comes from
// GET /api/analytics/overview -> `heatmap` (see server/routes/analyticsRoutes.js).

const HEATMAP_HOUR_RANGE = { start: 6, end: 23 }; // 6am - 11pm, matches the planner's active hours
const HEATMAP_DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const heatmapColor = (minutes, max) => {
  if (!max || minutes <= 0) return null; // use CSS default (empty) color
  const intensity = Math.min(1, minutes / max);
  // Teal/green scale to match the reference dashboard's focus-time palette
  if (intensity < 0.2) return 'rgba(52, 211, 153, 0.18)';
  if (intensity < 0.4) return 'rgba(52, 211, 153, 0.38)';
  if (intensity < 0.6) return 'rgba(45, 212, 191, 0.58)';
  if (intensity < 0.8) return 'rgba(20, 184, 166, 0.78)';
  return 'rgba(13, 148, 136, 1)';
};

const renderHeatmap = (containerId, heatmapData) => {
  const container = document.getElementById(containerId);
  if (!container || !heatmapData) return;

  const byDay = Object.fromEntries(heatmapData.map((d) => [d.day, d.hours]));
  const hours = [];
  for (let h = HEATMAP_HOUR_RANGE.start; h <= HEATMAP_HOUR_RANGE.end; h++) hours.push(h);

  let max = 0;
  for (const day of HEATMAP_DAY_ORDER) {
    const dayHours = byDay[day] || [];
    for (const h of hours) max = Math.max(max, dayHours[h] || 0);
  }

  const rows = HEATMAP_DAY_ORDER.map((day) => {
    const dayHours = byDay[day] || [];
    const cells = hours.map((h) => {
      const minutes = dayHours[h] || 0;
      const color = heatmapColor(minutes, max);
      const title = minutes > 0 ? `${day} ${h}:00 — ${minutes} min focused` : `${day} ${h}:00 — no activity`;
      return `<div class="heatmap-cell" style="${color ? `background:${color}` : ''}" title="${title}"></div>`;
    }).join('');
    return `<div class="heatmap-row"><span class="heatmap-row-label">${day}</span>${cells}</div>`;
  }).join('');

  const hourLabels = hours.map((h) => {
    const label = h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
    return `<span>${label}</span>`;
  }).join('');

  container.innerHTML = `
    ${rows}
    <div class="heatmap-hour-labels"><span></span>${hourLabels}</div>
    <div class="heatmap-legend">
      <span>Less</span>
      <span class="heatmap-legend-cell" style="background: rgba(52,211,153,0.18)"></span>
      <span class="heatmap-legend-cell" style="background: rgba(45,212,191,0.58)"></span>
      <span class="heatmap-legend-cell" style="background: rgba(13,148,136,1)"></span>
      <span>More</span>
    </div>
  `;
};
