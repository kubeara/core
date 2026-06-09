import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { describe, expect, it } from "@jest/globals";

import {
  encodeImageFileToDataUri,
  encodeLogoReferenceToDataUri,
} from "./image-data-uri.util";

describe("image-data-uri.util", () => {
  it("encodes an SVG file as a base64 data URI", () => {
    const dir = mkdtempSync(join(tmpdir(), "kubeara-logo-"));
    const svgPath = join(dir, "postgresql.svg");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>';

    writeFileSync(svgPath, svg, "utf8");

    const dataUri = encodeImageFileToDataUri(svgPath);
    const expectedBase64 = Buffer.from(svg, "utf8").toString("base64");

    expect(dataUri).toBe(`data:image/svg+xml;base64,${expectedBase64}`);
  });

  it("resolves a templates-relative logo path", () => {
    const templatesDir = mkdtempSync(join(tmpdir(), "kubeara-templates-"));
    const svgPath = join(templatesDir, "svgs", "redis.svg");
    const svg = "<svg></svg>";

    mkdirSync(join(templatesDir, "svgs"));
    writeFileSync(svgPath, svg, "utf8");

    const dataUri = encodeLogoReferenceToDataUri(templatesDir, "svgs/redis.svg");

    expect(dataUri.startsWith("data:image/svg+xml;base64,")).toBe(true);
  });

  it("returns an existing data URI unchanged", () => {
    const existing = "data:image/svg+xml;base64,abc";

    expect(encodeLogoReferenceToDataUri("/tmp", existing)).toBe(existing);
  });
});
