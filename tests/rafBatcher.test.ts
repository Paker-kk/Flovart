import { describe, it, expect, vi } from 'vitest';
import { createRafBatcher } from '../utils/rafBatcher';

describe('createRafBatcher', () => {
  it('coalesces multiple schedule calls into one flush', () => {
    const flush = vi.fn<(v: number) => void>();
    let rafCb: FrameRequestCallback | null = null;
    const fakeRaf = vi.fn((cb: FrameRequestCallback) => { rafCb = cb; return 1; });
    const fakeCancelRaf = vi.fn();

    const batcher = createRafBatcher<number>(flush, fakeRaf, fakeCancelRaf);

    batcher.schedule(1);
    batcher.schedule(2);
    batcher.schedule(3);

    // Only one rAF requested
    expect(fakeRaf).toHaveBeenCalledTimes(1);
    expect(flush).not.toHaveBeenCalled();

    // Simulate frame tick
    rafCb!(0);

    // Only the latest value is flushed
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(3);
  });

  it('flush() fires synchronously and cancels pending rAF', () => {
    const flush = vi.fn<(v: string) => void>();
    const fakeRaf = vi.fn(() => 42);
    const fakeCancelRaf = vi.fn();

    const batcher = createRafBatcher<string>(flush, fakeRaf, fakeCancelRaf);

    batcher.schedule('hello');
    expect(flush).not.toHaveBeenCalled();

    batcher.flush();

    expect(flush).toHaveBeenCalledWith('hello');
    expect(fakeCancelRaf).toHaveBeenCalledWith(42);
  });

  it('flush() is a no-op when nothing is pending', () => {
    const flush = vi.fn();
    const batcher = createRafBatcher<number>(flush, vi.fn(() => 0), vi.fn());

    batcher.flush(); // should not throw or call flush
    expect(flush).not.toHaveBeenCalled();
  });

  it('cancel() drops pending value without flushing', () => {
    const flush = vi.fn();
    let rafCb: FrameRequestCallback | null = null;
    const fakeRaf = vi.fn((cb: FrameRequestCallback) => { rafCb = cb; return 7; });
    const fakeCancelRaf = vi.fn();

    const batcher = createRafBatcher<number>(flush, fakeRaf, fakeCancelRaf);

    batcher.schedule(99);
    batcher.cancel();

    expect(fakeCancelRaf).toHaveBeenCalledWith(7);
    // Even if the frame fires late, nothing happens
    rafCb!(0);
    expect(flush).not.toHaveBeenCalled();
  });

  it('can schedule again after flush', () => {
    const flush = vi.fn<(v: number) => void>();
    let rafCb: FrameRequestCallback | null = null;
    const fakeRaf = vi.fn((cb: FrameRequestCallback) => { rafCb = cb; return 1; });
    const fakeCancelRaf = vi.fn();

    const batcher = createRafBatcher<number>(flush, fakeRaf, fakeCancelRaf);

    batcher.schedule(1);
    rafCb!(0);
    expect(flush).toHaveBeenCalledWith(1);

    batcher.schedule(2);
    rafCb!(0);
    expect(flush).toHaveBeenCalledWith(2);
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
