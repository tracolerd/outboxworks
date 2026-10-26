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
const restrictedRanges = ['unspecified', 'broadcast', 'multicast', 'linkLocal', 'loopback', 'private', 'carrierGradeNat', 'ipv4Mapped'];
// Custom DNS lookup that blocks SSRF ranges exactly at connection time
function safeLookup(hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | any[] | any, family: number) => void) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    try {
      const ips = Array.isArray(address) ? address.map(a => a.address) : [address];
      for (const ip of ips) {
        const addr = ipaddr.parse(ip);
        if (restrictedRanges.includes(addr.range())) {
          return callback(new Error(`SSRF blocked: IP ${ip} is restricted`), '', 0);
        }
      }
      callback(null, address, family);
    } catch (e) {
      callback(new Error('SSRF blocked: Invalid IP format'), '', 0);
    }
  });
}
export function sendWebhook(url: string, payloadJson: string, signatureHeader: string, timeoutMs: number = 5000): Promise<DeliveryResult> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let targetUrl: URL;
    try {
      targetUrl = new URL(url);
    } catch {
      return resolve({ success: false, statusCode: null, durationMs: Date.now() - startTime, errorReason: 'Invalid URL' });
    }
    const isHttps = targetUrl.protocol === 'https:';
    const requestModule = isHttps ? https : http;
    const options: http.RequestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'OutboxWorks-Signature': signatureHeader,
        'User-Agent': 'OutboxWorks-Worker/1.0',
        'Content-Length': Buffer.byteLength(payloadJson)
      },
      lookup: safeLookup as any, // Inject SSRF protection into the connection layer
      timeout: timeoutMs
    };
    const req = requestModule.request(targetUrl, options, (res) => {
      // Consume response data to free up memory
      res.on('data', () => {});
      res.on('end', () => {
        const durationMs = Date.now() - startTime;
        // Block redirects entirely (301, 302, 307, 308)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          return resolve({ success: false, statusCode: res.statusCode, durationMs, errorReason: 'REDIRECT_BLOCKED_FOR_SECURITY' });
        }
        const success = res.statusCode ? res.statusCode >= 200 && res.statusCode < 300 : false;
        resolve({
          success,
          statusCode: res.statusCode || null,
          durationMs,
          errorReason: success ? null : `HTTP ${res.statusCode} ${res.statusMessage}`
        });
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, statusCode: null, durationMs: Date.now() - startTime, errorReason: 'TIMEOUT' });
    });
    req.on('error', (err: any) => {
      resolve({ success: false, statusCode: null, durationMs: Date.now() - startTime, errorReason: err.message });
    });
    req.write(payloadJson);
    req.end();
  });
}
