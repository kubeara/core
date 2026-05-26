/**
 * Builds a shell command that writes UTF-8 content to a remote path via base64 decode.
 * Path must not contain shell metacharacters (use fixed install dirs only).
 */
export function buildBase64WriteCommand(
  remotePath: string,
  content: string,
): string {
  const encoded = Buffer.from(content, "utf8").toString("base64");
  const dir = pathDirname(remotePath);
  return `mkdir -p ${shellQuote(dir)} && printf '%s' ${shellQuote(encoded)} | base64 -d > ${shellQuote(remotePath)}`;
}

function pathDirname(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  return idx > 0 ? filePath.slice(0, idx) : filePath;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
