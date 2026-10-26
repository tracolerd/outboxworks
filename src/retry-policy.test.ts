import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_DELIVERY_AGE_MS,
  MAX_RETRY_DELAY_SECONDS,
  calculateRetryDelaySeconds,
  hasExceededMaximumDeliveryAge,
} from './retry-policy.js';

test('retry delay uses a bounded exponential window with injected jitter', () => {
  assert.equal(calculateRetryDelaySeconds(1, () => 0), 1);
  assert.equal(calculateRetryDelaySeconds(1, () => 0.99), 1);
  assert.equal(calculateRetryDelaySeconds(2, () => 0.75), 3);
  assert.equal(calculateRetryDelaySeconds(20, () => 0.99), Math.floor(MAX_RETRY_DELAY_SECONDS * 0.99));
});

test('retry delay rejects invalid attempts and random values', () => {
  assert.throws(() => calculateRetryDelaySeconds(0), RangeError);
  assert.throws(() => calculateRetryDelaySeconds(1.5), RangeError);
  assert.throws(() => calculateRetryDelaySeconds(1, () => 1), RangeError);
  assert.throws(() => calculateRetryDelaySeconds(1, () => Number.NaN), RangeError);
});

test('delivery age limit remains stable across worker restarts', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const underLimit = createdAt.getTime() + MAX_DELIVERY_AGE_MS - 1;
  const atLimit = createdAt.getTime() + MAX_DELIVERY_AGE_MS;

  assert.equal(hasExceededMaximumDeliveryAge(createdAt, underLimit), false);
  assert.equal(hasExceededMaximumDeliveryAge(createdAt, atLimit), true);
  assert.equal(hasExceededMaximumDeliveryAge(createdAt.toISOString(), atLimit), true);
});

test('delivery age helper rejects invalid timestamps', () => {
  assert.throws(() => hasExceededMaximumDeliveryAge('not-a-date'), RangeError);
});
