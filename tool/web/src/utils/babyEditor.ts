/** The cropper's initial zoom is its cover/fit scale, including current rotation. */
export function centredPhoto() {
  return { crop: { x: 0, y: 0 }, zoom: 1 };
}

export function faceDetectionMessage(reason?: string | null): string {
  return reason === "unavailable"
    ? "Face detection is unavailable. Try again later or centre the photo manually."
    : "No face found";
}
