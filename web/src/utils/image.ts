import type { Area } from "react-easy-crop";

export function createImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export async function cropToPngBlob(
  imageSrc: string,
  cropPixels: Area,
  outSize: { width: number; height: number }
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(outSize.width));
  canvas.height = Math.max(1, Math.floor(outSize.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Support crops that extend outside the image bounds (e.g. when zoomed out < 1
  // and the user drags freely). Out-of-bounds areas remain transparent.
  const imgW = image.naturalWidth || image.width;
  const imgH = image.naturalHeight || image.height;
  const sx = cropPixels.x;
  const sy = cropPixels.y;
  const sw = cropPixels.width;
  const sh = cropPixels.height;
  if (sw > 0 && sh > 0 && imgW > 0 && imgH > 0) {
    const ix0 = Math.max(0, sx);
    const iy0 = Math.max(0, sy);
    const ix1 = Math.min(imgW, sx + sw);
    const iy1 = Math.min(imgH, sy + sh);

    const iW = Math.max(0, ix1 - ix0);
    const iH = Math.max(0, iy1 - iy0);

    if (iW > 0 && iH > 0) {
      const dx = ((ix0 - sx) / sw) * canvas.width;
      const dy = ((iy0 - sy) / sh) * canvas.height;
      const dW = (iW / sw) * canvas.width;
      const dH = (iH / sh) * canvas.height;
      ctx.drawImage(image, ix0, iy0, iW, iH, dx, dy, dW, dH);
    }
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create image blob"))), "image/png");
  });
  return blob;
}
