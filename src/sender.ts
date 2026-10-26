export interface DeliveryResult {
  success: boolean;
  statusCode: number | null;
  durationMs: number;
  errorReason: string | null;
}
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
      signal: controller.signal,
      redirect: 'error' // Prevents redirect-based SSRF bypass
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
    let errorReason = error.message;
    if (error.name === 'AbortError') errorReason = 'TIMEOUT';
    else if (error.message.includes('redirect')) errorReason = 'REDIRECT_BLOCKED_FOR_SECURITY';
    return {
      success: false,
      statusCode: null,
      durationMs: duration,
      errorReason
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
