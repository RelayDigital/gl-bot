/**
 * Calculate exponential backoff delay with jitter
 *
 * @param attempt - Current attempt number (1-based)
 * @param baseSeconds - Base delay in seconds
 * @param maxSeconds - Maximum delay cap in seconds (default 300s = 5 minutes)
 * @returns Delay in milliseconds
 */
export function calculateBackoff(
  attempt: number,
  baseSeconds: number,
  maxSeconds: number = 300
): number {
  // Exponential delay: base * 2^(attempt-1)
  const exponentialDelay = baseSeconds * Math.pow(2, attempt - 1);

  // Cap at maximum
  const cappedDelay = Math.min(exponentialDelay, maxSeconds);

  // Add jitter (0-1 second) to prevent thundering herd
  const jitter = Math.random() * 1000;

  return cappedDelay * 1000 + jitter;
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep with abort signal support
 *
 * @param ms - Duration in milliseconds
 * @param signal - Optional AbortSignal to cancel the sleep
 * @returns Promise that resolves after the delay or rejects on abort
 */
export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(new Error('Aborted'));
    });
  });
}

/**
 * Create a timeout promise that rejects after specified duration
 *
 * @param ms - Timeout in milliseconds
 * @param message - Error message on timeout
 * @returns Promise that rejects after timeout
 */
export function timeout(ms: number, message: string = 'Operation timed out'): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Race a promise against a timeout
 *
 * @param promise - The promise to race
 * @param ms - Timeout in milliseconds
 * @param message - Error message on timeout
 * @returns The result of the promise if it completes first
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([promise, timeout(ms, message)]);
}
