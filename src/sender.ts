export interface DeliveryResult {
  success: boolean;
  statusCode: number | null;
  durationMs: number;
  errorReason: string | null;
}
/**
 * Sends the webhook payload to the destination URL.
 * Enforces a strict timeout to prevent worker starvation.
 */
export async function sendWebhook(
  url: string, 
  payloadJson: string, 
  signatureHeader: string, 
  timeoutMs: number = 5000
): Promise<DeliveryResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OutboxWorks-Signature': signatureHeader,
        'User-Agent': 'OutboxWorks-Worker/1.0'
      },
      body: payloadJson,
      signal: controller.signal
    });
    const duration = Date.now() - startTime;
    return {
      success: response.ok,
      statusCode: response.status,
      durationMs: duration,
      errorReason: response.ok ? null : `HTTP ${response.status} ${response.statusText}`
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    return {
      success: false,
      statusCode: null,
      durationMs: duration,
      errorReason: error.name === 'AbortError' ? 'TIMEOUT' : error.message
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
