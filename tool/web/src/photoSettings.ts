export type PhotoShadow = { color: string; opacity: number; offset_x: number; offset_y: number; blur: number };
export type PhotoFocus = { x: number; y: number; zoom: number };
export type PhotoSettings = {
  mugshot_fit?: "cover" | "contain";
  mugshot_face_aware?: boolean;
  contain_fill_color?: string;
  output_dpi?: number;
  crop_marks?: boolean;
  mugshot_shape?: "rect" | "rounded" | "ellipse";
  mugshot_corner_radius?: number;
  mugshot_border_width?: number;
  mugshot_border_color?: string;
  mugshot_shadow?: PhotoShadow | null;
  baby_shape?: "rect" | "rounded" | "ellipse";
  baby_corner_radius?: number;
  baby_border_width?: number;
  baby_border_color?: string;
  baby_shadow?: PhotoShadow | null;
};
export const DEFAULT_PHOTO_SETTINGS: PhotoSettings = {
  mugshot_fit: "cover", mugshot_face_aware: false, contain_fill_color: "#ffffff",
};
