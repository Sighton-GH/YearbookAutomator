export function filesFromDataTransfer(dt: DataTransfer): File[] {
  if (dt.files && dt.files.length) return Array.from(dt.files);
  if (dt.items && dt.items.length) {
    return Array.from(dt.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((f): f is File => Boolean(f));
  }
  return [];
}

export function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const tokens = accept
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length) return true;

  const fileName = file.name.toLowerCase();
  const fileType = (file.type || "").toLowerCase();

  return tokens.some((tokenRaw) => {
    const token = tokenRaw.toLowerCase();
    if (token === "*/*") return true;
    if (token.endsWith("/*")) {
      const prefix = token.slice(0, -1); // keep trailing '/'
      return fileType.startsWith(prefix);
    }
    if (token.startsWith(".")) {
      return fileName.endsWith(token);
    }
    // exact mime
    return fileType === token;
  });
}
