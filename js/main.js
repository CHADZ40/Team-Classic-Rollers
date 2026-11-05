const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#navLinks');
if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false');
  }));
}

// Subtle, lightweight scroll reveals. Content remains visible when JS is unavailable.
document.documentElement.classList.add('js-motion');
const revealTargets = document.querySelectorAll('.section, .stat-item, .squad-card, .feature-card, .tcr-news-card, .gallery-tile');
revealTargets.forEach(el => el.classList.add('reveal'));
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
  }), { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });
  revealTargets.forEach(el => observer.observe(el));
} else revealTargets.forEach(el => el.classList.add('is-visible'));

// Count-up for numeric team highlights, respecting reduced-motion preferences.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const counters = document.querySelectorAll('[data-count]');
function countUp(el) {
  const target = Number(el.dataset.count || 0);
  if (reducedMotion || !target) { el.textContent = target + (target >= 10 ? '+' : ''); return; }
  const suffix = target >= 10 ? '+' : '';
  const start = performance.now(), duration = 850;
  function frame(now) {
    const progress = Math.min(1, (now - start) / duration);
    el.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3))) + (progress === 1 ? suffix : '');
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
if ('IntersectionObserver' in window) {
  const countObserver = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { countUp(entry.target); countObserver.unobserve(entry.target); }
  }), { threshold: .7 });
  counters.forEach(el => countObserver.observe(el));
} else counters.forEach(countUp);

// Small accessible gallery preview: clicking a gallery photo opens a clean overlay.
const galleryLinks = [...document.querySelectorAll('.gallery-tile')];
if (galleryLinks.length) {
  const lightbox = document.createElement('div'); lightbox.className = 'tcr-lightbox';
  lightbox.setAttribute('role', 'dialog'); lightbox.setAttribute('aria-modal', 'true'); lightbox.setAttribute('aria-label', 'Photo preview');
  lightbox.innerHTML = '<button type="button" class="lightbox-close" aria-label="Close photo">×</button><img alt="">';
  document.body.appendChild(lightbox);
  const close = () => { lightbox.classList.remove('open'); document.body.style.overflow = ''; };
  lightbox.querySelector('button').addEventListener('click', close);
  lightbox.addEventListener('click', e => { if (e.target === lightbox) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  galleryLinks.forEach(link => link.addEventListener('click', e => {
    e.preventDefault(); const img = link.querySelector('img'); const preview = lightbox.querySelector('img');
    preview.src = link.href; preview.alt = img?.alt || 'Team photo'; lightbox.classList.add('open'); document.body.style.overflow = 'hidden';
    lightbox.querySelector('button').focus();
  }));
}
