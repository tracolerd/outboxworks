import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import ipaddr from 'ipaddr.js';

export interface DeliveryResult {
  success: boolean;
  statusCode: number | null;
  durationMs: number;
  errorReason: string | null;
}

/**
 * Return true only for globally routable unicast IP addresses. Blocking every
 * non-unicast range also covers IPv6 unique-local, reserved, transition and
 * mapped ranges as ipaddr.js classifies them, rather than maintaining a fragile
 * partial denylist.
 */
export function isPublicUnicastIp(ip: string): boolean {
  try {
    return ipaddr.parse(ip).range() === 'unicast';
  } catch {
    return false;
  }
}

// Custom DNS lookup blocks SSRF ranges at connection time.
function safeLookup(
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | any[] | any, family: number) => void,
) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    try {
      const ips = Array.isArray(address) ? address.map((item) => item.address) : [address];
      for (const ip of ips) {
        if (!isPublicUnicastIp(ip)) {
          return callback(new Error('SSRF blocked: destination resolved to a non-public IP range'), '', 0);
        }
      }
      callback(null, address, family);
    } catch {
      callback(new Error('SSRF blocked: Invalid IP format'), '', 0);
    }
  });
}

export function sendWebhook(
  url: string,
  payloadJson: string,
  signatureHeader: string,
  timeoutMs = 5000,
): Promise<DeliveryResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let targetUrl: URL;
    try {
      targetUrl = new URL(url);
    } catch {
      resolve({
        success: false,
        statusCode: null,
        durationMs: Date.now() - startTime,
        errorReason: 'Invalid URL',
      });
      return;
    }

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      resolve({
        success: false,
        statusCode: null,
        durationMs: Date.now() - startTime,
        errorReason: 'INVALID_TIMEOUT',
      });
      return;
    }

    const isHttps = targetUrl.protocol === 'https:';
    if (!isHttps && targetUrl.protocol !== 'http:') {
      resolve({
        success: false,
        statusCode: null,
        durationMs: Date.now() - startTime,
        errorReason: 'UNSUPPORTED_PROTOCOL',
      });
      return;
    }

    const requestModule = isHttps ? https : http;
    let settled = false;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: DeliveryResult) => {
      if (settled) return;
      settled = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      resolve(result);
    };

    const req = requestModule.request(
      targetUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'OutboxWorks-Signature': signatureHeader,
          'User-Agent': 'OutboxWorks-Worker/1.0',
          'Content-Length': Buffer.byteLength(payloadJson),
        },
        lookup: safeLookup as any,
        // Socket inactivity timeout; the total deadline below is independent.
        timeout: timeoutMs,
      },
      (res) => {
        // Drain without retaining the response body; delivery bodies are not stored.
        res.on('data', () => {});
        res.on('end', () => {
          const durationMs = Date.now() - startTime;
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
            finish({
              success: false,
              statusCode: res.statusCode,
              durationMs,
              errorReason: 'REDIRECT_BLOCKED_FOR_SECURITY',
            });
            return;
          }
          const success = res.statusCode ? res.statusCode >= 200 && res.statusCode < 300 : false;
          finish({
            success,
            statusCode: res.statusCode || null,
            durationMs,
            errorReason: success ? null : `HTTP ${res.statusCode} ${res.statusMessage}`,
          });
        });
      },
    );

    req.on('timeout', () => {
      finish({
        success: false,
        statusCode: null,
        durationMs: Date.now() - startTime,
        errorReason: 'TIMEOUT',
      });
      req.destroy();
    });
    req.on('error', (err: Error) => {
      finish({
        success: false,
        statusCode: null,
        durationMs: Date.now() - startTime,
        errorReason: settled ? 'TIMEOUT' : err.message,
      });
    });

    // Enforce a strict wall-clock deadline even if the peer keeps the socket
    // active by trickling response bytes. Clear this timer on every terminal path.
    deadlineTimer = setTimeout(() => {
      finish({
        success: false,
        statusCode: null,
        durationMs: Date.now() - startTime,
        errorReason: 'TIMEOUT',
      });
      req.destroy(new Error('TIMEOUT'));
    }, timeoutMs);

    req.write(payloadJson);
    req.end();
  });
}
