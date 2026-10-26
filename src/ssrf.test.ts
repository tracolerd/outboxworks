import test from 'node:test';
import assert from 'node:assert';
import { validateWebhookUrl } from './ssrf.js';
test('SSRF Security Policy Validation', async (t) => {
  await t.test('1. Should ALLOW valid public domains', async () => {
    assert.strictEqual(await validateWebhookUrl('https://example.com/webhook'), true);
    assert.strictEqual(await validateWebhookUrl('http://google.com'), true);
  });
  await t.test('2. Should BLOCK localhost and 127.0.0.1 (Loopback)', async () => {
    assert.strictEqual(await validateWebhookUrl('http://localhost:8080/pwned'), false);
    assert.strictEqual(await validateWebhookUrl('http://127.0.0.1/admin'), false);
  });
  await t.test('3. Should BLOCK internal private networks (RFC 1918)', async () => {
    // Typical local network IP
    assert.strictEqual(await validateWebhookUrl('http://192.168.1.100/api'), false);
    assert.strictEqual(await validateWebhookUrl('http://10.0.0.5/test'), false);
  });
  await t.test('4. Should BLOCK cloud metadata IPs (Link-Local)', async () => {
    // AWS/GCP Metadata Server
    assert.strictEqual(await validateWebhookUrl('http://169.254.169.254/latest/meta-data/'), false);
  });
  await t.test('5. Should BLOCK invalid protocols', async () => {
    assert.strictEqual(await validateWebhookUrl('ftp://example.com/file'), false);
    assert.strictEqual(await validateWebhookUrl('file:///etc/passwd'), false);
  });
});
