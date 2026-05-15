export interface IEncryptionService {
    encrypt(data: string): string;
    decrypt(data: string): string;
}
