import { createGalleryStore } from './gallery-storage.js';
import { VERSION } from './version.js';

const $ = sel => document.querySelector(sel);
const statusEl = $('#status');
$('#version').textContent = `v${VERSION}`;

let store;
let photos = [];

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of [].concat(children)) node.append(c);
  return node;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function fatalError(err) {
  console.error(err);
  statusEl.textContent = 'Erro ao carregar — veja o console';
  statusEl.className = 'status error';
}

// ---------- Grade de fotos ----------
function render(list) {
  photos = list;
  $('#gallery-count').textContent = `${list.length} / ${store.limit} fotos`;
  $('#file-input').disabled = list.length >= store.limit;
  $('#upload-form').querySelector('button[type=submit]').disabled = list.length >= store.limit;

  $('#photo-grid').replaceChildren(...list.map(p => el('button', {
    type: 'button',
    className: 'photo-card',
    onclick: () => openLightbox(p),
  }, [
    el('img', { src: p.url, alt: p.caption || '', loading: 'lazy' }),
    p.caption ? el('span', { className: 'photo-caption', textContent: p.caption }) : null,
  ].filter(Boolean))));
}

// ---------- Envio ----------
$('#upload-form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = $('#file-input');
  const files = [...input.files];
  if (!files.length) return;
  const caption = $('#caption-input').value.trim();
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    for (let i = 0; i < files.length; i++) {
      if (files.length > 1) toast(`Enviando ${i + 1}/${files.length}…`);
      await store.add(files[i], caption);
    }
    toast(files.length > 1 ? 'Fotos enviadas!' : 'Foto enviada!');
    e.target.reset();
  } catch (err) {
    console.error(err);
    const msg = /limite de \d+ fotos/.test(err.message || '')
      ? 'Limite de fotos atingido — fala com o Chico pra ver como expandir.'
      : 'Não consegui enviar essa foto (formato ou tamanho não suportado).';
    toast(msg);
  } finally {
    // A re-renderização (local imediata, ou via Realtime no modo online) já
    // desabilita de novo se o limite tiver sido atingido.
    btn.disabled = false;
  }
});

// ---------- Lightbox ----------
const lightbox = $('#lightbox');
let current = null;

function openLightbox(photo) {
  current = photo;
  $('#lightbox-img').src = photo.url;
  $('#lightbox-caption').textContent = photo.caption || '';
  $('#lightbox-caption').hidden = !photo.caption;
  const delBtn = $('#lightbox-delete');
  delBtn.textContent = 'Excluir';
  delete delBtn.dataset.confirm;
  lightbox.hidden = false;
}
function closeLightbox() {
  lightbox.hidden = true;
  current = null;
}
function showAdjacent(dir) {
  const idx = photos.findIndex(p => p.id === current.id);
  if (idx === -1) return;
  openLightbox(photos[(idx + dir + photos.length) % photos.length]);
}
$('#lightbox-close').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') showAdjacent(-1);
  else if (e.key === 'ArrowRight') showAdjacent(1);
});

$('#lightbox-delete').addEventListener('click', async () => {
  const delBtn = $('#lightbox-delete');
  if (!delBtn.dataset.confirm) {
    delBtn.dataset.confirm = '1';
    delBtn.textContent = 'Confirmar exclusão';
    return;
  }
  try {
    await store.remove(current);
    closeLightbox();
    toast('Foto excluída');
  } catch (err) {
    console.error(err);
    toast('Não consegui excluir — veja o console');
  }
});

// ---------- Inicialização ----------
(async () => {
  try {
    store = await createGalleryStore();
    statusEl.textContent = store.mode === 'online' ? '● online' : '● modo local (sem Supabase)';
    statusEl.className = 'status ' + store.mode;
    store.subscribe(render, fatalError);
  } catch (err) {
    fatalError(err);
  }
})();
