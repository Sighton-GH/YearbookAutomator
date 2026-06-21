const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not load image: ${file.name || "(unnamed)"}`));
    };
    img.src = url;
  });
};

const loadBitmapFromFile = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall back to HTMLImageElement path
    }
  }
  return await loadImageFromFile(file);
};

const releaseBitmap = (source: ImageBitmap | HTMLImageElement) => {
  if ("close" in source) {
    try {
      source.close();
    } catch {
      // ignore
    }
  }
};

const canvasToFile = async (
  canvas: HTMLCanvasElement,
  source: File,
  suffix: string
): Promise<File> => {
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), source.type || "image/png");
  });
  const dot = source.name.lastIndexOf(".");
  const base = dot >= 0 ? source.name.slice(0, dot) : (source.name || "spread");
  const ext = dot >= 0 ? source.name.slice(dot) : ".png";
  return new File([blob], `${base}_${suffix}${ext}`, { type: source.type || "image/png" });
};

export async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const img = await loadBitmapFromFile(file);
  const width = "width" in img ? img.width : 0;
  const height = "height" in img ? img.height : 0;
  releaseBitmap(img);
  return { width, height };
}

export async function rotateImageFile(file: File): Promise<File> {
  const img = await loadBitmapFromFile(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.height;
    canvas.height = img.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas context");
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0);
    return await canvasToFile(canvas, file, "rotated");
  } finally {
    releaseBitmap(img);
  }
}

export async function rotateImageFileCounterClockwise(file: File): Promise<File> {
  const img = await loadBitmapFromFile(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.height;
    canvas.height = img.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas context");
    ctx.translate(0, canvas.height);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, 0, 0);
    return await canvasToFile(canvas, file, "rotated_ccw");
  } finally {
    releaseBitmap(img);
  }
}

export async function duplicateImageFileHorizontal(file: File): Promise<File> {
  const img = await loadBitmapFromFile(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.width * 2;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not create canvas context");
    ctx.drawImage(img, 0, 0);
    ctx.drawImage(img, img.width, 0);
    return await canvasToFile(canvas, file, "duplicated");
  } finally {
    releaseBitmap(img);
  }
}