type Point = { x: number; y: number };
type Size = { width: number; height: number };

/** Bounds in the same rotated-image coordinates used by react-easy-crop. */
export function rotatedSize(size: Size, rotationDegrees: number): Size {
  const radians = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    width: Math.abs(cos * size.width) + Math.abs(sin * size.height),
    height: Math.abs(sin * size.width) + Math.abs(cos * size.height),
  };
}

/** Rotate clockwise about the image centre, then translate into its new bounds. */
export function rotateFocusPoint(point: Point, size: Size, rotationDegrees: number): Point {
  const radians = (rotationDegrees * Math.PI) / 180;
  const bounds = rotatedSize(size, rotationDegrees);
  const x = point.x - size.width / 2;
  const y = point.y - size.height / 2;
  return {
    x: Math.cos(radians) * x - Math.sin(radians) * y + bounds.width / 2,
    y: Math.sin(radians) * x + Math.cos(radians) * y + bounds.height / 2,
  };
}
