import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { APP_CONFIG } from '@shared/common';

@Injectable()
export class FilesystemService {
    private readonly logger = new Logger(FilesystemService.name);

    /**
     * Gets the root directory for all deployments.
     */
    getDeploymentsRoot(): string {
        return path.join(process.cwd(), APP_CONFIG.DEPLOYMENTS_DIR);
    }

    /**
     * Sanitizes a name for use as a directory or project name.
     */
    sanitizeName(name: string): string {
        return name.replace(APP_CONFIG.REGEX.SANITIZATION, '').toLowerCase();
    }

    /**
     * Ensures the deployment directory exists.
     */
    async ensureDeploymentDir(deploymentId: string): Promise<string> {
        const safeId = this.sanitizeName(deploymentId);
        if (!safeId) {
            throw new Error(`Invalid deployment ID: ${deploymentId}`);
        }
        
        const targetDir = path.join(this.getDeploymentsRoot(), safeId);

        try {
            await fs.mkdir(targetDir, { recursive: true });
            return targetDir;
        } catch (err) {
            const msg = `Failed to create deployment directory ${targetDir}`;
            this.logger.error(`${msg}: ${err}`);
            throw new Error(msg);
        }
    }

    /**
     * Writes a file to the target directory.
     */
    async writeFile(targetDir: string, filename: string, content: string): Promise<void> {
        const filePath = path.join(targetDir, filename);
        try {
            await fs.writeFile(filePath, content, { encoding: 'utf8', flag: 'w' });
            this.logger.debug(`File written: ${filePath}`);
        } catch (err) {
            const msg = `Failed to write file ${filePath}`;
            this.logger.error(`${msg}: ${err}`);
            throw new Error(msg);
        }
    }
}
