export type PhotoFocus = { x: number; y: number; zoom: number };
export type PhotoSettings = {
  mugshot_fit?: "cover" | "contain";
  mugshot_face_aware?: boolean;
  contain_fill_color?: string;
};
export const DEFAULT_PHOTO_SETTINGS: PhotoSettings = {
  mugshot_fit: "cover", mugshot_face_aware: false, contain_fill_color: "#ffffff",
};
