export const MAX_RETRY_DELAY_SECONDS = 60 * 60;
export const MAX_DELIVERY_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Return a bounded jittered retry delay in seconds.
 *
 * A capped exponential window starts at 2 seconds and tops out at one hour.
 * Jitter prevents many failing destinations from retrying in lock-step.
 */
export function calculateRetryDelaySeconds(
  attemptNumber: number,
  random: () => number = Math.random,
): number {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new RangeError('attemptNumber must be a positive integer');
  }

  const exponent = Math.min(attemptNumber - 1, 30);
  const upperBound = Math.min(2 * (2 ** exponent), MAX_RETRY_DELAY_SECONDS);
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError('random source must return a finite number in [0, 1)');
  }

  // Full jitter over [1, upperBound], retaining a non-zero delay.
  return Math.max(1, Math.floor(sample * upperBound));
}

/**
 * Return true once a delivery has exceeded its maximum retry age.
 * Values are explicit timestamps from the database rather than the current
 * process's startup time so worker restarts do not reset the age limit.
 */
export function hasExceededMaximumDeliveryAge(
  createdAt: Date | string,
  nowMs: number = Date.now(),
  maxAgeMs: number = MAX_DELIVERY_AGE_MS,
): boolean {
  const createdAtMs = createdAt instanceof Date ? createdAt.getTime() : Date.parse(createdAt);
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    throw new RangeError('createdAt, nowMs, and maxAgeMs must describe valid timestamps and a positive age limit');
  }
  return nowMs - createdAtMs >= maxAgeMs;
}
