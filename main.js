// Utility helpers for the static site
(function() {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  const navLinks = Array.from(document.querySelectorAll('.nav-link'));
  const path = window.location.pathname.replace(/\/$/, '') || '/';

  navLinks.forEach((link) => {
    if (link.getAttribute('aria-current') === 'page') return;
    const href = link.getAttribute('href') || '';
    if (href.startsWith('#') || href.includes('#')) return;
    const cleaned = href.replace(/\/$/, '');
    if (cleaned && cleaned === path) {
      link.setAttribute('aria-current', 'page');
    }
  });
})();
