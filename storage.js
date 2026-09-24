// Camada de armazenamento: Firestore (compartilhado, tempo real) ou
// localStorage (modo local, só neste navegador) quando não há config.
import { firebaseConfig } from './firebase-config.js';

const FIREBASE_VERSION = '10.12.2';
const COLLECTION = 'markers';

export async function createStore() {
  if (firebaseConfig) return createFirestoreStore();
  return createLocalStore();
}

async function createFirestoreStore() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const fs = await import(`${base}/firebase-firestore.js`);

  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  const col = fs.collection(db, COLLECTION);

  return {
    mode: 'online',
    subscribe(onChange, onError) {
      return fs.onSnapshot(
        col,
        snap => onChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        onError,
      );
    },
    add: data => fs.addDoc(col, { ...data, createdAt: Date.now(), updatedAt: Date.now() }),
    update: (id, patch) => fs.updateDoc(fs.doc(db, COLLECTION, id), { ...patch, updatedAt: Date.now() }),
    remove: id => fs.deleteDoc(fs.doc(db, COLLECTION, id)),
  };
}

function createLocalStore() {
  const KEY = 'lost-vikings:markers';
  const listeners = new Set();

  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  };
  const write = list => {
    localStorage.setItem(KEY, JSON.stringify(list));
    listeners.forEach(cb => cb(list));
  };

  return {
    mode: 'local',
    subscribe(onChange) {
      listeners.add(onChange);
      onChange(read());
      return () => listeners.delete(onChange);
    },
    async add(data) {
      const id = crypto.randomUUID();
      write([...read(), { id, ...data, createdAt: Date.now(), updatedAt: Date.now() }]);
    },
    async update(id, patch) {
      write(read().map(m => (m.id === id ? { ...m, ...patch, updatedAt: Date.now() } : m)));
    },
    async remove(id) {
      write(read().filter(m => m.id !== id));
    },
  };
}
