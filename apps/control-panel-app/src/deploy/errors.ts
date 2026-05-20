export class DeploymentValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DeploymentValidationError';
    }
}
