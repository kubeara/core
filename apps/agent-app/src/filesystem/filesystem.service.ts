import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { APP_CONFIG } from '@shared/common';

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
            throw new Error(`Failed to resolve deployments root path: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Sanitizes a name for use as a directory or project name.
     * @param name Raw deployment identifier.
     * @returns Sanitized deployment-safe name.
     */
    sanitizeName(name: string): string {
        try {
            return name.replace(APP_CONFIG.REGEX.SANITIZATION, '').toLowerCase();
        } catch (error) {
            throw new Error(`Failed to sanitize deployment name "${name}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Resolves the deployment directory path without creating it.
     * @param deploymentId Deployment identifier.
     * @returns Absolute path to the deployment directory.
     */
    getDeploymentDir(deploymentId: string): string {
        try {
            const safeId = this.sanitizeName(deploymentId);
            if (!safeId) {
                throw new Error(`Invalid deployment ID: ${deploymentId}`);
            }

            return path.join(this.getDeploymentsRoot(), safeId);
        } catch (error) {
            throw new Error(
                `Failed to resolve deployment directory for "${deploymentId}": ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Removes the deployment directory and all files inside it.
     * @param deploymentId Deployment identifier.
     */
    async removeDeploymentDir(deploymentId: string): Promise<void> {
        const targetDir = this.getDeploymentDir(deploymentId);

        try {
            await fs.rm(targetDir, { recursive: true, force: true });
            this.logger.debug(`Removed deployment directory: ${targetDir}`);
        } catch (error) {
            const msg = `Failed to remove deployment directory ${targetDir}`;
            this.logger.error(`${msg}: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(msg);
        }
    }

    /**
     * Ensures the deployment directory exists.
     * @param deploymentId Deployment identifier to materialize.
     * @returns Absolute path to ensured deployment directory.
     */
    async ensureDeploymentDir(deploymentId: string): Promise<string> {
        let targetDir = '';
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
            this.logger.error(`${msg}: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(msg);
        }
    }

    /**
     * Writes a file to the target directory.
     * @param targetDir Destination directory.
     * @param filename Name of file to write.
     * @param content UTF-8 file content.
     */
    async writeFile(targetDir: string, filename: string, content: string): Promise<void> {
        const filePath = path.join(targetDir, filename);
        try {
            await fs.writeFile(filePath, content, { encoding: 'utf8', flag: 'w' });
            this.logger.debug(`File written: ${filePath}`);
        } catch (error) {
            const msg = `Failed to write file ${filePath}`;
            this.logger.error(`${msg}: ${error instanceof Error ? error.message : String(error)}`);
            throw new Error(msg);
        }
    }
}
