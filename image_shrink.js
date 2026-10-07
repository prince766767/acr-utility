// Phone photos are resized when attached as an enclosure: still sharp when printed on A4, but a few hundred KB.

export const MAX_SIDE = 1700;

export function fitSize(w, h, max = MAX_SIDE) {
  const s = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

// A JPEG Blob of the photo, upright (EXIF orientation applied), long side at most MAX_SIDE; null if it cannot be read.
export async function shrinkImage(file, { createImageBitmap = globalThis.createImageBitmap, document = globalThis.document } = {}) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return null; }
  const { width, height } = fitSize(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';   // a transparent PNG gets a white page, not a black one
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return blob || null;
}
