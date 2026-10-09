/** Save only successful downloads. Error JSON stays in the app, never a new tab. */
export async function downloadBlobFile(
  url: string,
  filename: string,
  fetchBlob: (url: string) => Promise<Blob>,
): Promise<void> {
  let blob: Blob;
  try {
    blob = await fetchBlob(url);
  } catch (error) {
    // Axios returns error bodies as blobs when responseType is "blob".
    const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
    if (data instanceof Blob) {
      let detail: unknown;
      try {
        detail = (JSON.parse(await data.text()) as { detail?: unknown }).detail;
      } catch { /* A proxy can return HTML rather than API JSON. */ }
      if (typeof detail === "string" && detail.trim()) throw new Error(detail);
    }
    throw new Error("Could not download this file. Check your connection and try again.");
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
    }
  } finally {
    // Let the browser begin consuming the object URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
