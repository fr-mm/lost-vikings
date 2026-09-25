// Camada de armazenamento da galeria: Supabase (bucket 'gallery' + tabela
// 'photos', compartilhado, tempo real) ou localStorage (modo local, só neste
// navegador, com as fotos em base64) quando não há config.
import { supabaseConfig } from './supabase-config.js';

const SUPABASE_JS = 'https://esm.sh/@supabase/supabase-js@2';
const BUCKET = 'gallery';
export const PHOTO_LIMIT = 200;
const MAX_DIM = 1600;
const JPEG_QUALITY = 0.82;

// Redimensiona/recomprime pro navegador antes de subir — mantém o bucket
// (3 MB por arquivo) e a cota gratuita do plano longe do limite. Se o
// navegador não conseguir decodificar o arquivo (formato exótico tipo HEIC
// não suportado), a promise rejeita e quem chamou mostra o erro.
async function compressImage(file) {
  // imageOrientation: 'from-image' — sem isso o canvas ignora o EXIF de
  // rotação e fotos tiradas em pé por celular saem deitadas.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('Não consegui converter essa imagem');
  return blob;
}

export async function createGalleryStore() {
  if (supabaseConfig) return createSupabaseStore();
  return createLocalStore();
}

async function createSupabaseStore() {
  const { createClient } = await import(SUPABASE_JS);
  const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

  async function fetchAll() {
    const { data, error } = await supabase.from('photos').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(row => ({
      id: row.id,
      path: row.path,
      caption: row.caption || '',
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
      url: supabase.storage.from(BUCKET).getPublicUrl(row.path).data.publicUrl,
    }));
  }

  return {
    mode: 'online',
    limit: PHOTO_LIMIT,
    subscribe(onChange, onError) {
      let cancelled = false;
      fetchAll().then(list => { if (!cancelled) onChange(list); }).catch(onError);
      const channel = supabase
        .channel('photos-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, () => {
          fetchAll().then(onChange).catch(onError);
        })
        .subscribe();
      return () => { cancelled = true; supabase.removeChannel(channel); };
    },
    async add(file, caption) {
      const blob = await compressImage(file);
      const path = `${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600' });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase
        .from('photos')
        .insert({ path, caption: caption || null, size_bytes: blob.size });
      if (insErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insErr;
      }
    },
    async remove(photo) {
      await supabase.storage.from(BUCKET).remove([photo.path]);
      const { error } = await supabase.from('photos').delete().eq('id', photo.id);
      if (error) throw error;
    },
  };
}

function createLocalStore() {
  const KEY = 'lost-vikings:photos';
  const listeners = new Set();
  const LOCAL_LIMIT = 30; // localStorage é pequeno — modo local é só pra testes/dev

  const read = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  };
  const write = list => {
    localStorage.setItem(KEY, JSON.stringify(list));
    listeners.forEach(cb => cb(list));
  };
  const blobToDataUrl = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  return {
    mode: 'local',
    limit: LOCAL_LIMIT,
    subscribe(onChange) {
      listeners.add(onChange);
      onChange(read());
      return () => listeners.delete(onChange);
    },
    async add(file, caption) {
      const blob = await compressImage(file);
      const url = await blobToDataUrl(blob);
      const photo = {
        id: crypto.randomUUID(),
        path: null,
        caption: caption || '',
        sizeBytes: blob.size,
        createdAt: new Date().toISOString(),
        url,
      };
      write([photo, ...read()]);
    },
    async remove(photo) {
      write(read().filter(p => p.id !== photo.id));
    },
  };
}
