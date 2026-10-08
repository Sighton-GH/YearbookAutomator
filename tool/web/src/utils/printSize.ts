// Keep in sync with generator.PRINT_DPI until export DPI becomes a setting.
export const PRINT_DPI = 300;

type Size = { width: number; height: number };

export function printSizeDescription(template: Size, output: Size | null): string {
  // The renderer anchors to width, clamps to the template and preserves its ratio.
  const width = output ? Math.max(1, Math.min(template.width, Math.round(output.width))) : template.width;
  const height = output ? Math.max(1, Math.min(template.height, Math.round(width * template.height / template.width))) : template.height;
  return `Prints at ${(width / PRINT_DPI).toFixed(2)} × ${(height / PRINT_DPI).toFixed(2)} in at ${PRINT_DPI} dpi`;
}
