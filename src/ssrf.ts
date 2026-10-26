import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
/**
 * Validates a URL against SSRF attacks.
 * Blocks private, loopback, link-local, and broadcast IP ranges.
 */
export async function validateWebhookUrl(urlString: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false; // Invalid URL format
  }
  // Only allow HTTP and HTTPS protocols
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }
  // Quick fail for obvious localhosts
  if (url.hostname === 'localhost' || url.hostname.includes('127.0.0.1')) {
    return false;
  }
  try {
    // Resolve DNS to get the actual underlying IP
    const lookup = await dns.lookup(url.hostname);
    const addr = ipaddr.parse(lookup.address);
    const range = addr.range();
    // Explicitly block internal/reserved network ranges
    const restrictedRanges = [
      'unspecified',
      'broadcast',
      'multicast',
      'linkLocal',   // Blocks AWS/GCP Metadata server (169.254.169.254)
      'loopback',    // Blocks 127.0.0.0/8
      'private',     // Blocks 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
      'carrierGradeNat',
      'ipv4Mapped'
    ];
    if (restrictedRanges.includes(range)) {
      return false; // Failed SSRF Policy
    }
    return true; // Passed SSRF Policy
  } catch (error) {
    // If DNS resolution fails, reject the URL
    return false;
  }
}
