import {detectFaceCenter} from "../api";

// Crop to the template's aspect ratio with the detected face at the centre.
// Clamping preserves the image edges when a face is too close to a border.
export async function faceCentreImage(blob: Blob, aspect: number): Promise<Blob | null> {
  const face = await detectFaceCenter(blob);
  if (!face.found || face.center_x == null || face.center_y == null) return null;
  const image = await createImageBitmap(blob, {imageOrientation: "from-image"});
  try {
    const ratio = aspect > 0 ? aspect : 1;
    const width = Math.min(image.width, image.height * ratio);
    const height = width / ratio;
    const x = Math.max(0, Math.min(image.width - width, face.center_x * image.width / face.width - width / 2));
    const y = Math.max(0, Math.min(image.height - height, face.center_y * image.height / face.height - height / 2));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the photo");
    ctx.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not save the photo")), "image/png"));
  } finally {image.close();}
}
