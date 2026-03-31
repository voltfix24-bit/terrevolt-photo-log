import { getPendingPhotos, markDone, clearDone } from './offline-queue';
import { supabase } from '@/integrations/supabase/client';
import imageCompression from 'browser-image-compression';

let isSyncing = false;

export async function syncPendingPhotos(
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  if (isSyncing) return 0;
  isSyncing = true;

  try {
    const pending = await getPendingPhotos();
    if (pending.length === 0) return 0;

    let done = 0;
    for (const item of pending) {
      try {
        const file = new File([item.file], item.fileName);

        let compressed: File | Blob = file;
        if (file.type !== 'image/heic') {
          try {
            compressed = await imageCompression(file, {
              maxSizeMB: 2,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
              fileType: 'image/jpeg',
              initialQuality: 0.85
            });
          } catch { /* use original */ }
        }

        const catSlug = item.categorie.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const storagePath = `stations/${item.stationId}/${catSlug}/${Date.now()}_${item.fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('to-fotos')
          .upload(storagePath, compressed);

        if (uploadError) continue;

        const { data: urlData } = supabase.storage
          .from('to-fotos')
          .getPublicUrl(storagePath);

        await supabase.from('fotos').insert({
          station_id: item.stationId,
          categorie: item.categorie,
          storage_path: storagePath,
          url: urlData.publicUrl,
          volgorde: 0,
        });

        await markDone(item.id);
        done++;
        onProgress?.(done, pending.length);
      } catch { /* continue with next */ }
    }

    await clearDone();
    return done;
  } finally {
    isSyncing = false;
  }
}
