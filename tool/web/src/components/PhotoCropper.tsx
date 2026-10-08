import Cropper, { type CropperProps } from "react-easy-crop";
/** Shared crop engine for baby photos and nondestructive portrait focus. */
export function PhotoCropper(props: JSX.LibraryManagedAttributes<typeof Cropper, CropperProps>) {
  return <Cropper {...props} />;
}
