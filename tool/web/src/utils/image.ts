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
  outSize: { width: number; height: number },
  rotationDegrees = 0
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const rotation = ((rotationDegrees % 360) + 360) % 360;
  const rotRad = (rotation * Math.PI) / 180;

  const imgW = image.naturalWidth || image.width;
  const imgH = image.naturalHeight || image.height;

  const rotateSize = (width: number, height: number, rotationAngle: number) => {
    const r = (rotationAngle * Math.PI) / 180;
    return {
      width: Math.abs(Math.cos(r) * width) + Math.abs(Math.sin(r) * height),
      height: Math.abs(Math.sin(r) * width) + Math.abs(Math.cos(r) * height),
    };
  };

  let sourceCanvas: HTMLCanvasElement | null = null;
  let sourceW = imgW;
  let sourceH = imgH;

  if (rotation !== 0) {
    const bounds = rotateSize(imgW, imgH, rotation);
    sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = Math.max(1, Math.round(bounds.width));
    sourceCanvas.height = Math.max(1, Math.round(bounds.height));
    const rCtx = sourceCanvas.getContext("2d");
    if (!rCtx) throw new Error("Could not get canvas context");
    rCtx.translate(sourceCanvas.width / 2, sourceCanvas.height / 2);
    rCtx.rotate(rotRad);
    rCtx.translate(-imgW / 2, -imgH / 2);
    rCtx.drawImage(image, 0, 0);
    sourceW = sourceCanvas.width;
    sourceH = sourceCanvas.height;
  }

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
  const sx = cropPixels.x;
  const sy = cropPixels.y;
  const sw = cropPixels.width;
  const sh = cropPixels.height;
  if (sw > 0 && sh > 0 && sourceW > 0 && sourceH > 0) {
    const ix0 = Math.max(0, sx);
    const iy0 = Math.max(0, sy);
    const ix1 = Math.min(sourceW, sx + sw);
    const iy1 = Math.min(sourceH, sy + sh);

    const iW = Math.max(0, ix1 - ix0);
    const iH = Math.max(0, iy1 - iy0);

    if (iW > 0 && iH > 0) {
      const dx = ((ix0 - sx) / sw) * canvas.width;
      const dy = ((iy0 - sy) / sh) * canvas.height;
      const dW = (iW / sw) * canvas.width;
      const dH = (iH / sh) * canvas.height;
      if (sourceCanvas) {
        ctx.drawImage(sourceCanvas, ix0, iy0, iW, iH, dx, dy, dW, dH);
      } else {
        ctx.drawImage(image, ix0, iy0, iW, iH, dx, dy, dW, dH);
      }
    }
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create image blob"))), "image/png");
  });
  return blob;
}
