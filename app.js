import { createStore } from './storage.js';

const IMAGE = { url: 'tree-map.png', width: 946, height: 939 };
const COLORS = ['#e8c547', '#e05a47', '#4fb3d9', '#6fcf6f', '#b57be0', '#f08fc0', '#ffffff', '#ff9a3c'];

const $ = sel => document.querySelector(sel);
const statusEl = $('#status');

// ---------- Mapa ----------
const bounds = [[0, 0], [IMAGE.height, IMAGE.width]];
const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -2,
  maxZoom: 3,
  zoomSnap: 0.25,
  doubleClickZoom: false,
  attributionControl: false,
  maxBounds: L.latLngBounds(bounds).pad(0.25),
});
L.imageOverlay(IMAGE.url, bounds).addTo(map);
map.fitBounds(bounds);

const layers = new Map(); // id -> L.Marker
let markers = [];
let store;

// ---------- Helpers ----------
function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of [].concat(children)) node.append(c);
  return node;
}

function makeIcon(color) {
  return L.divIcon({
    className: 'pin',
    html: `<span style="--c:${color}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
    tooltipAnchor: [10, 0],
  });
}

function showError(err) {
  console.error(err);
  statusEl.textContent = 'Erro ao salvar — veja o console';
  statusEl.className = 'status error';
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

// ---------- Desfazer (Ctrl+Z) ----------
// Só desfaz ações feitas por você nesta aba (criar, arrastar, excluir) — não
// é um histórico compartilhado, fica só na memória enquanto a página está aberta.
const UNDO_LIMIT = 50;
const undoStack = [];
function pushUndo(action) {
  undoStack.push(action);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}
function undoLast() {
  const action = undoStack.pop();
  if (!action) { toast('Nada para desfazer'); return; }
  if (action.type === 'create') {
    store.remove(action.id).catch(showError);
    toast('Criação desfeita');
  } else if (action.type === 'delete') {
    store.add(action.data).catch(showError);
    toast('Exclusão desfeita');
  } else if (action.type === 'move') {
    store.update(action.id, action.from).catch(showError);
    toast('Movimento desfeito');
  }
}
document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() !== 'z' || !(e.ctrlKey || e.metaKey) || e.shiftKey) return;
  const t = e.target;
  // Dentro de um campo de texto, deixa o undo nativo do navegador funcionar
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  e.preventDefault();
  undoLast();
});

// Popups sempre abrem "pra cima" a partir do marcador (padrão do Leaflet, que
// posiciona o popup com bottom:0 + transform — margin não afeta essa caixa).
// Perto do topo isso empurraria o conteúdo pra debaixo do cabeçalho — como o
// mapa nunca pode se mover (autoPan fica desligado em todo popup), corrige só
// o popup, somando um translateY ao transform que o Leaflet já aplicou.
function keepPopupOnScreen(popup) {
  const el = popup?.getElement?.();
  if (!el) return;
  requestAnimationFrame(() => {
    const mapTop = map.getContainer().getBoundingClientRect().top;
    const popTop = el.getBoundingClientRect().top;
    const overflow = mapTop - popTop;
    if (overflow > 0) el.style.transform += ` translateY(${overflow + 10}px)`;
  });
}

// ---------- Formulário (criar / editar) ----------
function buildForm(initial, onSubmit, onCancel) {
  const form = $('#form-template').content.firstElementChild.cloneNode(true);
  form.title.value = initial.name || '';
  form.description.value = initial.description || '';

  let color = initial.color || COLORS[0];
  const swatches = form.querySelector('.swatches');
  // Só alterna classes: recriar os botões desanexa o alvo do clique e o
  // Leaflet passa a tratá-lo como clique no mapa (abrindo outro formulário).
  const select = c => {
    color = c;
    for (const b of swatches.querySelectorAll('.swatch')) b.classList.toggle('selected', b.dataset.color === c);
    custom.value = /^#[0-9a-f]{6}$/i.test(c) ? c : '#ffffff';
  };
  const custom = el('input', {
    type: 'color',
    title: 'Outra cor',
    className: 'swatch-custom',
    oninput: e => select(e.target.value),
  });
  swatches.append(
    ...COLORS.map(c => el('button', {
      type: 'button',
      className: 'swatch',
      style: `--c:${c}`,
      title: c,
      onclick: () => select(c),
    })),
    custom,
  );
  swatches.querySelectorAll('.swatch').forEach((b, i) => { b.dataset.color = COLORS[i]; });
  select(color);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = form.title.value.trim();
    if (!name) return;
    onSubmit({ name, description: form.description.value.trim(), color });
  });
  form.querySelector('[data-action="cancel"]').onclick = onCancel;
  L.DomEvent.disableClickPropagation(form);
  return form;
}

// Clique no mapa → novo marcador
map.on('click', e => {
  // Cliques em botões de popup que se removem do DOM (Salvar, Editar, Excluir)
  // chegam aqui como se fossem no mapa — ignora.
  const target = e.originalEvent?.target;
  if (target && (!target.isConnected || target.closest('.leaflet-popup'))) return;
  // Ignora cliques fora da imagem (na área de fundo ao redor dela, visível
  // quando o mapa é mais largo/alto que a imagem quadrada)
  const { lat, lng } = e.latlng;
  if (lat < 0 || lat > IMAGE.height || lng < 0 || lng > IMAGE.width) return;
  const popup = L.popup({ minWidth: 240, autoPan: false }).setLatLng(e.latlng);
  const form = buildForm(
    {},
    data => {
      map.closePopup(popup);
      store.add({ ...data, lat, lng })
        .then(id => pushUndo({ type: 'create', id }))
        .catch(showError);
    },
    () => map.closePopup(popup),
  );
  popup.setContent(form).openOn(map);
  keepPopupOnScreen(popup);
  setTimeout(() => form.title.focus(), 0);
});

// ---------- Popup de visualização ----------
function viewContent(m) {
  const box = el('div', { className: 'marker-view' });
  box.append(el('h3', { textContent: m.name, style: `color:${m.color}` }));
  if (m.description) box.append(el('p', { className: 'desc', textContent: m.description }));
  if (m.updatedAt) box.append(el('p', { className: 'meta', textContent: new Date(m.updatedAt).toLocaleString('pt-BR') }));

  const actions = el('div', { className: 'actions' });
  const editBtn = el('button', { className: 'btn', textContent: 'Editar', type: 'button' });
  const delBtn = el('button', { className: 'btn danger', textContent: 'Excluir', type: 'button' });
  actions.append(editBtn, delBtn);
  box.append(actions);

  const layer = layers.get(m.id);
  editBtn.onclick = () => {
    layer.setPopupContent(buildForm(
      m,
      data => { layer.closePopup(); store.update(m.id, data).catch(showError); },
      () => { layer.setPopupContent(viewContent(m)); keepPopupOnScreen(layer.getPopup()); },
    ));
    keepPopupOnScreen(layer.getPopup());
  };
  delBtn.onclick = () => {
    if (delBtn.dataset.confirm) {
      layer.closePopup();
      pushUndo({
        type: 'delete',
        data: { name: m.name, description: m.description || '', color: m.color, lat: m.lat, lng: m.lng },
      });
      store.remove(m.id).catch(showError);
    } else {
      delBtn.dataset.confirm = '1';
      delBtn.textContent = 'Confirmar exclusão';
    }
  };
  L.DomEvent.disableClickPropagation(box);
  return box;
}

// ---------- Renderização ----------
function render(list) {
  markers = list;
  const seen = new Set();

  for (const m of list) {
    seen.add(m.id);
    let layer = layers.get(m.id);
    if (!layer) {
      layer = L.marker([m.lat, m.lng], { draggable: true, autoPan: true });
      // autoPan: false — o mapa nunca se move ao abrir um popup (fica sempre parado)
      layer.bindPopup('', { minWidth: 240, autoPan: false });
      // Abrir o popup sempre mostra a versão mais recente, em modo visualização
      layer.on('popupopen', () => {
        const cur = markers.find(x => x.id === m.id);
        if (cur) layer.setPopupContent(viewContent(cur));
        keepPopupOnScreen(layer.getPopup());
      });
      layer.on('dragstart', () => {
        const { lat, lng } = layer.getLatLng();
        layer._dragFrom = { lat, lng };
        layer._dragging = true;
      });
      layer.on('dragend', () => {
        layer._dragging = false;
        const { lat, lng } = layer.getLatLng();
        if (layer._dragFrom) pushUndo({ type: 'move', id: m.id, from: layer._dragFrom });
        store.update(m.id, { lat, lng }).catch(showError);
      });
      layer.addTo(map);
      layers.set(m.id, layer);
    }
    // Não sobrescreve o popup se alguém estiver editando este marcador agora
    const editing = layer.isPopupOpen() && layer.getPopup().getContent()?.tagName === 'FORM';
    // _dragging (flag própria, não layer.dragging.moved() — o Leaflet nunca
    // reseta esse .moved() depois do primeiro arrasto, então ficaria bloqueando
    // pra sempre a sincronização de posição vinda do desfazer ou de outro usuário)
    const cur = layer.getLatLng();
    if (!layer._dragging && (cur.lat !== m.lat || cur.lng !== m.lng)) layer.setLatLng([m.lat, m.lng]);
    // Só recria ícone/rótulo quando nome ou cor mudam (recriar à toa troca o
    // elemento do DOM debaixo do mouse e atrapalha cliques/arrastes)
    const look = `${m.color}|${m.name}`;
    if (layer._look !== look) {
      layer._look = look;
      layer.setIcon(makeIcon(m.color));
      layer.unbindTooltip().bindTooltip(
        el('span', { textContent: m.name, style: `color:${m.color}` }),
        { permanent: true, direction: 'right', className: 'pin-label' },
      );
    }
    if (!editing) {
      layer.setPopupContent(viewContent(m));
      if (layer.isPopupOpen()) keepPopupOnScreen(layer.getPopup());
    }
  }

  for (const [id, layer] of layers) {
    if (!seen.has(id)) { layer.remove(); layers.delete(id); }
  }

  $('#count').textContent = list.length;
  renderList();
}

// ---------- Lista lateral ----------
function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const items = markers
    .filter(m => !q || m.name.toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  $('#marker-list').replaceChildren(...items.map(m => el('li', {
    onclick: () => {
      map.flyTo([m.lat, m.lng], Math.max(map.getZoom(), 1));
      layers.get(m.id)?.openPopup();
    },
  }, [el('span', { className: 'dot', style: `--c:${m.color}` }), m.name])));
}

$('#search').addEventListener('input', renderList);
$('#toggle-list').addEventListener('click', () => {
  const sb = $('#sidebar');
  sb.hidden = !sb.hidden;
  setTimeout(() => map.invalidateSize(), 0);
});

// ---------- Inicialização ----------
(async () => {
  try {
    store = await createStore();
    statusEl.textContent = store.mode === 'online' ? '● online' : '● modo local (sem Firebase)';
    statusEl.className = 'status ' + store.mode;
    store.subscribe(render, showError);
  } catch (err) {
    showError(err);
  }
})();
