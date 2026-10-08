// Default matches the renderer; callers can select a print DPI.
export const PRINT_DPI = 300;

type Size = { width: number; height: number };

export function printSizeDescription(template: Size, output: Size | null, dpi = PRINT_DPI): string {
  // The renderer anchors to width, clamps to the template and preserves its ratio.
  const width = output ? Math.max(1, Math.min(template.width, Math.round(output.width))) : template.width;
  const height = output ? Math.max(1, Math.min(template.height, Math.round(width * template.height / template.width))) : template.height;
  return `Prints at ${(width / dpi).toFixed(2)} × ${(height / dpi).toFixed(2)} in at ${dpi} dpi`;
}
