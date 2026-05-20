# SSH Credentials API

POST /server-connections/:serverId/credentials

Purpose: Save SSH credentials for a server, encrypt secrets, and immediately test SSH connectivity.

Request examples

Password auth (curl):

```bash
curl -X POST http://localhost:3000/server-connections/<SERVER_ID>/credentials \
  -H "Content-Type: application/json" \
  -d '{
    "authType": "PASSWORD",
    "username": "ubuntu",
    "password": "ubuntu123"
  }'
```

Private key auth (curl):

```bash
curl -X POST http://localhost:3000/server-connections/<SERVER_ID>/credentials \
  -H "Content-Type: application/json" \
  -d '{
    "authType": "PRIVATE_KEY",
    "username": "ubuntu",
    "privateKey": "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----",
    "privateKeyPassphrase": ""
  }'
```

Postman

- Method: POST
- URL: http://localhost:3000/server-connections/:serverId/credentials
- Body: raw -> JSON. Use the same JSON payloads shown above.

Success response example

```json
{
  "success": true,
  "message": "SSH connection established successfully",
  "serverId": "uuid",
  "authType": "PRIVATE_KEY",
  "connectionTest": {
    "latency": 120,
    "platform": "Linux"
  }
}
```

Failure response example

```json
{
  "success": false,
  "message": "SSH authentication failed",
  "error": "Permission denied"
}
```

Expected DB structure (serverSshCredentials table)

- id: uuid
- serverId: uuid
- authType: enum('PASSWORD','PRIVATE_KEY')
- username: varchar
- encryptedPrivateKey: text (select: false) -- AES-256-GCM base64 payload
- privateKeyPassphrase: text (select: false) -- encrypted
- encryptedPassword: text (select: false) -- encrypted
- sshFingerprint: varchar (nullable)
- createdAt, updatedAt, deletedAt, status, metadata

Notes

- Private key is accepted as plain text JSON; do NOT use file uploads.
- Sensitive fields are encrypted using `EncryptionService.encrypt()` before storage.
- Encrypted columns are declared with `select: false` so they are not returned by default from DB.
- The endpoint will attempt an immediate SSH test using the existing `SshHealthCheckService` and will return success/failure details.

Sample logs (success)

- "Credential save started for server=<serverId>"
- "Credential encrypted for server=<serverId>"
- "Credential saved for server=<serverId>"
- "SSH connection attempt started for server=<serverId>"
- "SSH success for server=<serverId>"

Sample logs (failure)

- "Credential save started for server=<serverId>"
- "Credential encrypted for server=<serverId>"
- "Credential saved for server=<serverId>"
- "SSH connection attempt started for server=<serverId>"
- "SSH failure for server=<serverId> msg=Permission denied"

Security

- The API never logs raw passwords or private keys.
- Encrypted values are never sent back in API responses.
- Handle timeouts or invalid key material gracefully; errors are returned in the `error` field.

