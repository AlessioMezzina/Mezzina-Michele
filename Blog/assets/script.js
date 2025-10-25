// Utilities
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Year
$('#year').textContent = new Date().getFullYear();

// Smooth scroll for internal anchor links + active nav
$$('.nav a').forEach(a => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href');
    if (href && href.startsWith('#')) {
      e.preventDefault();
      const el = $(href);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
const sections = ['#about','#experience','#skills','#documents','#contatti'].map(id => ({ id, el: $(id) }));
window.addEventListener('scroll', () => {
  const y = window.scrollY + 100;
  let current = null;
  for (const s of sections) { if (s.el && s.el.offsetTop <= y) current = s.id; }
  $$('.nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === current));
});

// Reveal on scroll
const revealEls = $$('.reveal');
const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => { if (entry.isIntersecting) entry.target.classList.add('is-visible'); });
}, { threshold: 0.15 });
revealEls.forEach(el => io.observe(el));

// Background blobs subtle parallax
const blobs = $$('.blob');
window.addEventListener('mousemove', (e) => {
  const { innerWidth: w, innerHeight: h } = window;
  const x = (e.clientX / w - 0.5) * 10;
  const y = (e.clientY / h - 0.5) * 10;
  blobs.forEach((o, i) => { const k = (i + 1) * 0.5; o.style.transform = `translate(${x * k}px, ${y * k}px)`; });
});

// Theme toggle
const root = document.documentElement;
const toggle = $('#theme-toggle');
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') { root.classList.add('light'); }
toggle.addEventListener('click', () => {
  root.classList.toggle('light');
  localStorage.setItem('theme', root.classList.contains('light') ? 'light' : 'dark');
});

// PDF list with thumbnails
const pdfContainer = $('#pdf-list');
let files = [];
try { files = JSON.parse(pdfContainer.getAttribute('data-files')) || []; } catch { files = []; }
const items = files.map(f => ({ file: f, url: `documents/${encodeURIComponent(f)}` }));

// Manual titles overrides (as richiesto)
const MANUAL_TITLES = {
  '1.pdf': 'Il cemento in Italia — Una storia lunga 150 anni',
  '2.pdf': 'Riduzione del Cr VI con triossido di antimonio Sb2O3 e Solfato Ferroso FeSO4',
  "3.pdf": "Formazione e tecniche per il controllo dell'anidride solforosa e di altri composti solforati nei sistemi di forni per cemento"
};

function fileFallbackTitle(name) { return name; }

function renderPdfItem({ url, file }, title, thumbCanvas) {
  const el = document.createElement('article');
  el.className = 'pdf-item surface';
  const manual = MANUAL_TITLES[file];
  const label = manual || title || fileFallbackTitle(file);
  const thumb = document.createElement('div');
  thumb.className = 'thumb';

  function createPdfIconFallback() {
    const icon = document.createElement('div');
    icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--muted);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
    return icon;
  }

  const h = document.createElement('div');
  h.className = 'pdf-title';
  h.textContent = label;
  const actions = document.createElement('div');
  actions.className = 'pdf-actions';
  const aOpen = document.createElement('a');
  aOpen.className = 'btn'; aOpen.href = url; aOpen.target = '_blank'; aOpen.rel = 'noreferrer'; aOpen.textContent = 'Apri PDF';
  actions.append(aOpen);
  thumb.addEventListener('click', () => openPdfModal(url));
  if (thumbCanvas) {
    thumb.appendChild(thumbCanvas);
  } else {
    // Fallback: show a generic PDF icon if canvas generation fails
    thumb.style.background = 'var(--surface)';
    thumb.appendChild(createPdfIconFallback());
  }
  el.append(thumb, h, actions);
  pdfContainer.appendChild(el);
}

function dprLimit() { return Math.min(Math.max(window.devicePixelRatio || 1, 1), 2); }

async function renderPageToCanvas(page, cssScale = 0.6) {
  const dpr = dprLimit();
  const viewport = page.getViewport({ scale: cssScale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  const renderContext = { canvasContext: ctx, viewport };
  if (dpr !== 1) renderContext.transform = [dpr, 0, 0, dpr, 0, 0];
  await page.render(renderContext).promise;
  return canvas;
}

async function generateThumb(lib, url) {
  try {
    const doc = await lib.getDocument({ url }).promise;
    const page = await doc.getPage(1);
    const canvas = await renderPageToCanvas(page, 0.6);
    await doc.cleanup();
    return canvas;
  } catch (e) { return null; }
}

async function populatePdfList() {
  const lib = window.pdfjsLib;
  if (!lib) { items.forEach(item => renderPdfItem(item)); return; }
  try {
    lib.GlobalWorkerOptions.workerSrc = lib.GlobalWorkerOptions.workerSrc
      || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.3.136/build/pdf.worker.min.mjs';
  } catch {}
  for (const it of items) {
    let title = null, thumb = null;
    try {
      const doc = await lib.getDocument({ url: it.url }).promise;
      try {
        const meta = await doc.getMetadata();
        let t = null;
        if (meta && meta.info && meta.info.Title) t = meta.info.Title;
        else if (meta && meta.metadata && typeof meta.metadata.get === 'function') t = meta.metadata.get('dc:title');
        title = t || null;
      } catch {}
      // thumbnail
      try {
        const page = await doc.getPage(1);
        thumb = await renderPageToCanvas(page, 0.56);
      } catch {}
      await doc.cleanup();
    } catch (e) { /* ignore, fallback */ }
    renderPdfItem(it, typeof title === 'string' ? title : null, thumb);
  }
}
populatePdfList();

// If PDF.js is not present, try to load it dynamically (works around CDN MIME issues)
async function ensurePdfJsAvailable() {
  if (window.pdfjsLib) return window.pdfjsLib;
  const urls = [
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.3.136/build/pdf.min.mjs',
    'https://unpkg.com/pdfjs-dist@4.3.136/build/pdf.min.mjs'
  ];
  for (const u of urls) {
    try {
      const mod = await import(u);
      window.pdfjsLib = mod;
      try { mod.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.3.136/build/pdf.worker.min.mjs'; } catch {}
      return mod;
    } catch (e) { /* try next */ }
  }
  return null;
}

async function upgradePdfThumbnails() {
  const lib = await ensurePdfJsAvailable();
  if (!lib) return; // stay with fallback icons
  const thumbs = $$('#pdf-list .pdf-item .thumb');
  for (let i = 0; i < Math.min(thumbs.length, items.length); i++) {
    const host = thumbs[i];
    if (host.querySelector('canvas')) continue; // already upgraded
    let canvas = null;
    try {
      const doc = await lib.getDocument({ url: items[i].url }).promise;
      const page = await doc.getPage(1);
      canvas = await renderPageToCanvas(page, 0.56);
      await doc.cleanup();
    } catch {}
    if (canvas) {
      host.innerHTML = '';
      host.appendChild(canvas);
    }
  }
}

// Attempt dynamic load and upgrade after initial render
if (!window.pdfjsLib) { upgradePdfThumbnails(); }

// Modal (safe even if DOM not fully parsed yet)
function getModalEls() {
  return { modal: $('#pdf-modal'), renderHost: $('#pdf-render'), frame: $('#pdf-frame') };
}
async function openPdfModal(src) {
  const { modal, renderHost, frame } = getModalEls();
  if (!modal || !renderHost || !frame) {
    // Fallback: open in new tab if modal not yet present
    try { window.open(src, '_blank', 'noopener'); } catch { location.href = src; }
    return;
  }
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  renderHost.style.display = 'none';
  frame.src = `${src}#page=1&zoom=page-fit`;
}
function closePdfModal() {
  const { modal, renderHost, frame } = getModalEls();
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  if (frame) frame.src = '';
  if (renderHost) { renderHost.style.display = 'none'; renderHost.innerHTML = ''; }
}
// Delegated close handlers (works regardless of DOM timing)
document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t) return;
  if (t.hasAttribute && t.hasAttribute('data-close')) { closePdfModal(); return; }
  if (t.closest && t.closest('.modal-close')) { e.preventDefault(); closePdfModal(); }
});

// Nav hamburger
function setupHamburgerMenu() {
  const nav = $('#site-nav');
  const navToggle = $('#nav-toggle');
  if (!nav || !navToggle) return;

  function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }

  function applyVisibility(open) {
    // Ensure visibility on mobile even if CSS conflicts
    if (isMobile()) {
      nav.style.display = open ? 'grid' : '';
    } else {
      nav.style.display = '';
    }
  }

  function setOpen(open) {
    if (open) nav.classList.add('is-open'); else nav.classList.remove('is-open');
    const nowOpen = nav.classList.contains('is-open');
    navToggle.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
    applyVisibility(nowOpen);
  }

  function toggleMenu() {
    const willOpen = !nav.classList.contains('is-open');
    setOpen(willOpen);
  }

  // Open/close on button click
  navToggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  });

  // Close when clicking a link inside the menu
  nav.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.tagName === 'A') setOpen(false);
  });

  // Close when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (!isMobile()) return;
    const target = e.target;
    if (!nav.contains(target) && target !== navToggle && !navToggle.contains(target)) {
      if (nav.classList.contains('is-open')) setOpen(false);
    }
  });

  // When resizing, reset inline display and close if moving to desktop
  window.addEventListener('resize', () => {
    if (!isMobile()) {
      // On desktop, keep nav visible in its default layout
      setOpen(false);
      nav.style.display = '';
    } else {
      // Keep inline style in sync on mobile
      applyVisibility(nav.classList.contains('is-open'));
    }
  });
}
setupHamburgerMenu();

// Carousel controls
const track = $('#pdf-list');
const vp = $('#car-vp');
const btnPrev = $('#car-prev');
const btnNext = $('#car-next');
function scrollByPage(dir) {
  if (!track) return;
  const base = (vp && vp.clientWidth) ? vp.clientWidth : track.clientWidth || 300;
  const amount = base * 0.9;
  track.scrollBy({ left: dir * amount, behavior: 'smooth' });
}
if (btnPrev) btnPrev.addEventListener('click', () => scrollByPage(-1));
if (btnNext) btnNext.addEventListener('click', () => scrollByPage(1));

// Hydrate content from profile.pdf if present
async function hydrateFromProfile() {
  const lib = window.pdfjsLib;
  if (!lib) return;
  // try to find profile pdf name from items first (case-insensitive)
  const profileItem = items.find(it => /profile\.pdf$/i.test(it.file));
  const url = profileItem ? profileItem.url : 'documents/Profile.pdf';
  try {
    const doc = await lib.getDocument(url).promise;
    let text = '';
    const pages = Math.min(doc.numPages, 3);
    for (let i = 1; i <= pages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const pageText = tc.items.map(it => it.str).join(' ');
      text += (pageText + '\n');
    }
    await doc.cleanup();
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > 1200) text = text.slice(0, 1200) + '…';
    const bio = $('#bio-text');
    if (bio && text) bio.textContent = text;

    // naive roles extraction: lines with years or role-like tokens
    const rolesTarget = $('#experience-roles');
    if (rolesTarget) {
      const parts = text.split(/(?=\b(19|20)\d{2}\b|Esperienza|Experience|Role|Ruolo|Manager|Director|Lead)/i).slice(0, 6);
      const ul = document.createElement('ul');
      ul.style.paddingLeft = '18px';
      parts.forEach(p => { const s = p.trim(); if (s.length > 0) { const li = document.createElement('li'); li.textContent = s.slice(0, 180); ul.appendChild(li); } });
      if (ul.children.length) { rolesTarget.innerHTML = ''; rolesTarget.appendChild(ul); }
    }
    // skills extraction attempt
    const skillsMatch = text.match(/(Competenze|Skills)[:\s]+(.{0,250})/i);
    if (skillsMatch) {
      const skills = skillsMatch[2].split(/[•,;\n]/).map(s => s.trim()).filter(Boolean).slice(0, 12);
      const skillsBox = document.createElement('div');
      skillsBox.style.display = 'flex'; skillsBox.style.flexWrap = 'wrap'; skillsBox.style.gap = '8px';
      skills.forEach(s => { const chip = document.createElement('span'); chip.textContent = s; chip.style.padding = '6px 10px'; chip.style.border = '1px solid var(--stroke)'; chip.style.borderRadius = '999px'; chip.style.background = 'var(--surface)'; skillsBox.appendChild(chip); });
      const skillsTarget = document.querySelector('#skills .grid-3');
      if (skillsTarget) {
        const card = document.createElement('article');
        card.className = 'card surface';
        const h = document.createElement('h4'); h.textContent = 'Competenze principali';
        card.append(h, skillsBox);
        skillsTarget.appendChild(card);
      }
    }
  } catch (e) {
    // missing or blocked; ignore
  }
}
hydrateFromProfile();
