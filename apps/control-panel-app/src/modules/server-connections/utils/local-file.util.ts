import * as fs from "node:fs/promises";
import * as path from "node:path";

export async function writeLocalTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}
