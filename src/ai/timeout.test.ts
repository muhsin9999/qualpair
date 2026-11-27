import { describe, expect, it, vi } from 'vitest';
import { ReaderTimeoutError, retryOnTimeout, withTimeout } from './timeout';

describe('withTimeout', () => {
  it('passes a prompt answer through', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50, 'slow')).resolves.toBe('ok');
  });

  it('gives up on a call that never answers', async () => {
    await expect(withTimeout(new Promise(() => {}), 20, 'No answer')).rejects.toBeInstanceOf(ReaderTimeoutError);
  });

  it('passes other errors through unchanged', async () => {
    await expect(withTimeout(Promise.reject(new Error('too large')), 50, 'slow')).rejects.toThrow('too large');
  });
});

describe('retryOnTimeout', () => {
  it('asks again once after a stall, then succeeds', async () => {
    const call = vi.fn()
      .mockImplementationOnce(() => withTimeout(new Promise(() => {}), 10, 'stalled'))
      .mockImplementationOnce(() => Promise.resolve('second time'));
    const seen = vi.fn();
    await expect(retryOnTimeout(call, seen)).resolves.toBe('second time');
    expect(call).toHaveBeenCalledTimes(2);
    expect(seen).toHaveBeenCalledOnce();
  });

  it('stops after the second stall', async () => {
    const call = vi.fn(() => withTimeout(new Promise<string>(() => {}), 10, 'stalled'));
    await expect(retryOnTimeout(call)).rejects.toBeInstanceOf(ReaderTimeoutError);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('does not retry other errors', async () => {
    const call = vi.fn(() => Promise.reject(new Error('bad JSON')));
    await expect(retryOnTimeout(call)).rejects.toThrow('bad JSON');
    expect(call).toHaveBeenCalledOnce();
  });
});
