import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { mock, test } from 'node:test';
import { isPublicUnicastIp, sendWebhook } from './sender.js';

test('sendWebhook enforces an absolute deadline if the request never responds', async (t) => {
  const fakeRequest = new EventEmitter() as EventEmitter & {
    write: (body: string) => void;
    end: () => void;
    destroy: (error?: Error) => void;
  };
  fakeRequest.write = () => {};
  fakeRequest.end = () => {};
  fakeRequest.destroy = (error?: Error) => {
    if (error) fakeRequest.emit('error', error);
  };

  const requestMock = mock.method(
    http,
    'request',
    (() => fakeRequest as unknown as http.ClientRequest) as typeof http.request,
  );
  t.after(() => requestMock.mock.restore());

  const result = await sendWebhook('http://example.test/hook', '{}', 'test-signature', 25);

  assert.equal(result.success, false);
  assert.equal(result.statusCode, null);
  assert.equal(result.errorReason, 'TIMEOUT');
  assert.ok(result.durationMs >= 15, `unexpectedly early timeout: ${result.durationMs}ms`);
  assert.ok(result.durationMs < 1000, `deadline was not enforced promptly: ${result.durationMs}ms`);
});

test('sendWebhook rejects a non-positive timeout without creating a request', async (t) => {
  const requestMock = mock.method(http, 'request');
  t.after(() => requestMock.mock.restore());

  const result = await sendWebhook('http://example.test/hook', '{}', 'test-signature', 0);

  assert.equal(result.errorReason, 'INVALID_TIMEOUT');
  assert.equal(requestMock.mock.callCount(), 0);
});


test('SSRF policy allows global unicast and rejects reserved address classes', () => {
  assert.equal(isPublicUnicastIp('8.8.8.8'), true);
  assert.equal(isPublicUnicastIp('2606:4700:4700::1111'), true);

  const blocked = [
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.1.2',
    '100.64.0.1',
    '192.0.2.1',
    '224.0.0.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
    'not-an-ip',
  ];

  for (const address of blocked) {
    assert.equal(isPublicUnicastIp(address), false, `${address} must not be accepted as public unicast`);
  }
});
