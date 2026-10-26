import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { mock, test } from 'node:test';
import { sendWebhook } from './sender.js';

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
