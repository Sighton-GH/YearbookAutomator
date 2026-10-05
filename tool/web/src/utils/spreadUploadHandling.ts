import { duplicateImageFileHorizontal, getImageDimensions } from "./imageTransforms";

type SpreadUploadOptions = {
  annotated: File;
  clean: File;
  autoDuplicatePortrait?: boolean;
  promptHandlers?: SpreadUploadPromptHandlers;
};

export type SpreadUploadPromptHandlers = {
  onLowResolution?: (message: string) => Promise<"continue" | "cancel">;
  onPortraitNeedsReview?: (message: string) => Promise<"continue" | "cancel">;
  onSizeMismatch?: (message: string) => Promise<"continue" | "cancel">;
};

export type SpreadUploadHandlingResult = {
  annotated: File;
  clean: File;
  canceled: boolean;
  didDuplicate: boolean;
  didRotate: boolean;
  lowResolutionWarning?: string;
};

const LOW_RES_MIN_LONG_EDGE = 2400;
const LOW_RES_MIN_SHORT_EDGE = 1500;

const getResolutionWarning = (width: number, height: number): string | null => {
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  if (longEdge < LOW_RES_MIN_LONG_EDGE || shortEdge < LOW_RES_MIN_SHORT_EDGE) {
    return `Low resolution detected (${width}×${height}). Strongly recommended: at least ${LOW_RES_MIN_LONG_EDGE}×${LOW_RES_MIN_SHORT_EDGE} for a full spread.`;
  }
  return null;
};

export async function handleSpreadUploads(
  opts: SpreadUploadOptions
): Promise<SpreadUploadHandlingResult> {
  const annotatedSize = await getImageDimensions(opts.annotated);
  const cleanSize = await getImageDimensions(opts.clean);

  if (annotatedSize.width !== cleanSize.width || annotatedSize.height !== cleanSize.height) {
    const message = `The annotated template is ${annotatedSize.width}×${annotatedSize.height} but the clean template is ${cleanSize.width}×${cleanSize.height}. They should be the same size, or boxes will land in the wrong place. Continue anyway?`;
    if (opts.promptHandlers?.onSizeMismatch) {
      const decision = await opts.promptHandlers.onSizeMismatch(message);
      if (decision === "cancel") {
        return {
          annotated: opts.annotated,
          clean: opts.clean,
          canceled: true,
          didDuplicate: false,
          didRotate: false,
        };
      }
    }
  }

  const width = cleanSize.width || annotatedSize.width;
  const height = cleanSize.height || annotatedSize.height;

  const warning = getResolutionWarning(width, height);
  if (warning && opts.promptHandlers?.onLowResolution) {
    const decision = await opts.promptHandlers.onLowResolution(warning);
    if (decision === "cancel") {
      return {
        annotated: opts.annotated,
        clean: opts.clean,
        canceled: true,
        didDuplicate: false,
        didRotate: false,
        lowResolutionWarning: warning ?? undefined,
      };
    }
  }

  const isPortrait = height > width;
  if (!isPortrait) {
    return {
      annotated: opts.annotated,
      clean: opts.clean,
      canceled: false,
      didDuplicate: false,
      didRotate: false,
      lowResolutionWarning: warning ?? undefined,
    };
  }

  if (opts.autoDuplicatePortrait) {
    const [annotated, clean] = await Promise.all([
      duplicateImageFileHorizontal(opts.annotated),
      duplicateImageFileHorizontal(opts.clean),
    ]);
    return {
      annotated,
      clean,
      canceled: false,
      didDuplicate: true,
      didRotate: false,
      lowResolutionWarning: warning ?? undefined,
    };
  }

  if (opts.promptHandlers?.onPortraitNeedsReview) {
    const message =
      "The uploaded image is vertical. If it is meant to be only one page, turn on \"duplicate page into spread\". If the spread is rotated wrong, click the preview and use the Rotate button.";
    const decision = await opts.promptHandlers.onPortraitNeedsReview(message);
    if (decision === "cancel") {
      return {
        annotated: opts.annotated,
        clean: opts.clean,
        canceled: true,
        didDuplicate: false,
        didRotate: false,
        lowResolutionWarning: warning ?? undefined,
      };
    }
  }

  if (!opts.promptHandlers?.onPortraitNeedsReview) {
    return {
      annotated: opts.annotated,
      clean: opts.clean,
      canceled: false,
      didDuplicate: false,
      didRotate: false,
      lowResolutionWarning: warning ?? undefined,
    };
  }

  return {
    annotated: opts.annotated,
    clean: opts.clean,
    canceled: false,
    didDuplicate: false,
    didRotate: false,
    lowResolutionWarning: warning ?? undefined,
  };
}