import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs/promises";
import * as path from "path";
import { APP_CONFIG } from "@shared/common";

@Injectable()
export class FilesystemService {
  private readonly logger = new Logger(FilesystemService.name);

  /**
   * Gets the root directory for all deployments.
   * @returns Absolute path to deployments root directory.
   */
  getDeploymentsRoot(): string {
    try {
      return path.join(process.cwd(), APP_CONFIG.DEPLOYMENTS_DIR);
    } catch (error) {
      throw new Error(
        `Failed to resolve deployments root path: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Sanitizes a name for use as a directory or project name.
   * @param name Raw deployment identifier.
   * @returns Sanitized deployment-safe name.
   */
  sanitizeName(name: string): string {
    try {
      return name.replace(APP_CONFIG.REGEX.SANITIZATION, "").toLowerCase();
    } catch (error) {
      throw new Error(
        `Failed to sanitize deployment name "${name}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Ensures the deployment directory exists.
   * @param deploymentId Deployment identifier to materialize.
   * @returns Absolute path to ensured deployment directory.
   */
  async ensureDeploymentDir(deploymentId: string): Promise<string> {
    const targetDir = "";
    try {
      const safeId = this.sanitizeName(deploymentId);
      if (!safeId) {
        throw new Error(`Invalid deployment ID: ${deploymentId}`);
      }

      const targetDir = path.join(this.getDeploymentsRoot(), safeId);
      await fs.mkdir(targetDir, { recursive: true });
      return targetDir;
    } catch (error) {
      const msg = `Failed to create deployment directory ${targetDir}`;
      this.logger.error(
        `${msg}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(msg);
    }
  }

  /**
   * Writes a file to the target directory.
   * @param targetDir Destination directory.
   * @param filename Name of file to write.
   * @param content UTF-8 file content.
   */
  async writeFile(
    targetDir: string,
    filename: string,
    content: string,
  ): Promise<void> {
    const filePath = path.join(targetDir, filename);
    try {
      await fs.writeFile(filePath, content, { encoding: "utf8", flag: "w" });
      this.logger.debug(`File written: ${filePath}`);
    } catch (error) {
      const msg = `Failed to write file ${filePath}`;
      this.logger.error(
        `${msg}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(msg);
    }
  }
}
