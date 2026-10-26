import test from 'node:test';
import assert from 'node:assert';
import { encryptSecret, decryptSecret } from './crypto.js';
import { config } from './config.js';
test('AES-256-GCM Encryption Utility', () => {
  const plainText = 'my_super_secret_webhook_key';
  const encrypted = encryptSecret(plainText, config.ENCRYPTION_KEY);
  assert.ok(encrypted.includes(':'), 'Encrypted data should contain IV and Auth Tag separated by colon');
  const decrypted = decryptSecret(encrypted, config.ENCRYPTION_KEY);
  assert.strictEqual(decrypted, plainText, 'Decrypted text must match original plaintext');
});
