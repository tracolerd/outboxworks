import test from 'node:test';
import assert from 'node:assert';
import { generateSignature, verifySignature } from './signer.js';
test('Webhook HMAC Signature Utility', async (t) => {
  const secret = 'super_secret_key_that_is_long_enough';
  const payload = JSON.stringify({ event: 'user.created', id: 123 });
  await t.test('1. Should generate and verify a valid signature', () => {
    const header = generateSignature(payload, secret);
    assert.ok(header.includes('t='));
    assert.ok(header.includes('v1='));
    const isValid = verifySignature(header, payload, secret);
    assert.strictEqual(isValid, true, 'Signature should be valid');
  });
  await t.test('2. Should reject altered payload', () => {
    const header = generateSignature(payload, secret);
    const alteredPayload = JSON.stringify({ event: 'user.created', id: 999 }); // Malicious alteration
    const isValid = verifySignature(header, alteredPayload, secret);
    assert.strictEqual(isValid, false, 'Altered payload must be rejected');
  });
  await t.test('3. Should reject wrong secret', () => {
    const header = generateSignature(payload, 'wrong_secret_key');
    const isValid = verifySignature(header, payload, secret);
    assert.strictEqual(isValid, false, 'Wrong secret must fail verification');
  });
  await t.test('4. Should reject expired timestamp (Replay Attack Prevention)', () => {
    const oldTimestamp = Date.now() - 600000; // 10 minutes ago
    const header = generateSignature(payload, secret, oldTimestamp);
    // Default tolerance is 5 minutes (300000ms), so this should fail
    const isValid = verifySignature(header, payload, secret);
    assert.strictEqual(isValid, false, 'Expired timestamp must be rejected');
  });
});
