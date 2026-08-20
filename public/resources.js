// ===== DOMAIN RESOURCE GENERATOR =====
// Purely client-side: builds well-formed search URLs into a few well-known
// learning platforms. No scraping, no API keys, no backend calls - just
// query construction, so it works instantly and never breaks from an
// external API changing.

const buildResourceLinks = (domain, topic) => {
  const query = `${topic} ${domain}`.trim();
  const encoded = encodeURIComponent(query);
  const topicEncoded = encodeURIComponent(topic);

  return [
    {
      label: 'YouTube',
      icon: '▶️',
      desc: `Video tutorials on "${topic}"`,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' tutorial')}`,
    },
    {
      label: 'Khan Academy',
      icon: '🎓',
      desc: `Free lessons & practice on "${topic}"`,
      url: `https://www.khanacademy.org/search?page_search_query=${topicEncoded}`,
    },
    {
      label: 'Documentation / Reference',
      icon: '📖',
      desc: `Official docs & reference material for "${topic}"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query + ' official documentation')}`,
    },
    {
      label: 'Wikipedia',
      icon: '📘',
      desc: `Background & foundational overview of "${topic}"`,
      url: `https://en.wikipedia.org/w/index.php?search=${topicEncoded}`,
    },
    {
      label: 'Practice Problems',
      icon: '✏️',
      desc: `Exercises and practice sets for "${topic}"`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query + ' practice problems worksheet')}`,
    },
  ];
};

const generateResources = () => {
  const domain = document.getElementById('resourceDomain').value.trim();
  const topic = document.getElementById('resourceTopic').value.trim();
  const results = document.getElementById('resourcesResults');

  if (!domain || !topic) {
    toast('Please fill in both the domain and the topic', 'error');
    return;
  }

  const links = buildResourceLinks(domain, topic);

  results.innerHTML = `
    <div class="resource-results-header">Resources for <strong>${escHtml(topic)}</strong> (${escHtml(domain)})</div>
    <div class="resource-links-grid">
      ${links.map((l) => `
        <a class="resource-link-card" href="${l.url}" target="_blank" rel="noopener noreferrer">
          <div class="resource-link-icon">${l.icon}</div>
          <div class="resource-link-body">
            <div class="resource-link-label">${escHtml(l.label)}</div>
            <div class="resource-link-desc">${escHtml(l.desc)}</div>
          </div>
          <div class="resource-link-arrow">↗</div>
        </a>
      `).join('')}
    </div>
  `;

  toast('Resources generated! 🔗', 'success');
};
