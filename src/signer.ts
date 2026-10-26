import crypto from 'node:crypto';
/**
 * Generates an HMAC-SHA256 signature for the webhook payload.
 * Format: t=<timestamp>,v1=<hash>
 */
export function generateSignature(payload: string, secret: string, timestamp: number = Date.now()): string {
  const hmac = crypto.createHmac('sha256', secret);
  const dataToSign = `${timestamp}.${payload}`;
  const signature = hmac.update(dataToSign).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}
/**
 * Verifies the signature using constant-time comparison.
 * Rejects payloads older than toleranceMs (default: 5 minutes).
 */
export function verifySignature(header: string, payload: string, secret: string, toleranceMs: number = 300000): boolean {
  try {
    const parts = header.split(',');
    const tPart = parts.find(p => p.startsWith('t='));
    const v1Part = parts.find(p => p.startsWith('v1='));
    if (!tPart || !v1Part) return false;
    const timestamp = parseInt(tPart.slice(2), 10);
    const signature = v1Part.slice(3);
    if (isNaN(timestamp)) return false;
    // Check tolerance to prevent replay attacks
    const now = Date.now();
    if (Math.abs(now - timestamp) > toleranceMs) return false;
    // Compute expected signature
    const expectedHeader = generateSignature(payload, secret, timestamp);
    const expectedSignature = expectedHeader.split('v1=')[1];
    // Constant-time comparison
    const bufferA = Buffer.from(signature, 'utf8');
    const bufferB = Buffer.from(expectedSignature, 'utf8');
    if (bufferA.length !== bufferB.length) return false;
    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch (error) {
    return false;
  }
}
