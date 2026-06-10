import * as fs from "fs";
import * as path from "path";

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

/**
 * Encodes a local image file as a base64 data URI suitable for `<img src="...">`.
 */
export function encodeImageFileToDataUri(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPE_BY_EXTENSION[extension];

  if (!mimeType) {
    throw new Error(
      `Unsupported image extension "${extension}" for file "${filePath}"`,
    );
  }

  const base64 = fs.readFileSync(filePath).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Resolves a logo reference from template metadata into a data URI.
 * Accepts an existing data URI or a path relative to `templatesDir`.
 */
export function encodeLogoReferenceToDataUri(
  templatesDir: string,
  logoRef: string,
): string {
  const trimmed = logoRef.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("data:")) {
    return trimmed;
  }

  const absolutePath = path.isAbsolute(trimmed)
    ? trimmed
    : path.join(templatesDir, trimmed);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Logo file not found: ${absolutePath}`);
  }

  return encodeImageFileToDataUri(absolutePath);
}
