/** The model gave no answer in time (Chrome's on-device model can stall, for example when memory is short). */
export class ReaderTimeoutError extends Error {
  override name = 'ReaderTimeoutError';
}

/** Reject with ReaderTimeoutError if `p` hasn't settled after `ms`. The underlying call can't be cancelled; its late result is ignored. */
export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReaderTimeoutError(message)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** Try once more if the first call timed out; any other error is passed straight on. */
export async function retryOnTimeout<T>(call: () => Promise<T>, onTimeout?: (e: ReaderTimeoutError) => void): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (!(e instanceof ReaderTimeoutError)) throw e;
    onTimeout?.(e);
    return call();
  }
}
