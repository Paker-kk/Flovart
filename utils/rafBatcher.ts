/**
 * Creates a rAF-based batcher that coalesces rapid calls into a single
 * flush per animation frame.  Only the **latest** value is kept.
 *
 * Usage:
 *   const batcher = createRafBatcher<Point>(p => doExpensiveWork(p));
 *   onPointerMove = (e) => batcher.schedule(getPoint(e));
 *   onPointerUp   = () => { batcher.flush(); batcher.cancel(); };
 */
export interface RafBatcher<T> {
  /** Store the latest value and request a frame if none is pending. */
  schedule(value: T): void;
  /** If a value is pending, flush it synchronously (e.g. on pointer-up). */
  flush(): void;
  /** Cancel any pending rAF without flushing. */
  cancel(): void;
}

export function createRafBatcher<T>(
  callback: (value: T) => void,
  raf: (cb: FrameRequestCallback) => number = requestAnimationFrame,
  cancelRaf: (id: number) => void = cancelAnimationFrame,
): RafBatcher<T> {
  let pending: { value: T } | null = null;
  let frameId: number | null = null;

  function tick() {
    frameId = null;
    if (pending) {
      const { value } = pending;
      pending = null;
      callback(value);
    }
  }

  return {
    schedule(value: T) {
      pending = { value };
      if (frameId === null) {
        frameId = raf(tick);
      }
    },
    flush() {
      if (pending) {
        if (frameId !== null) {
          cancelRaf(frameId);
          frameId = null;
        }
        const { value } = pending;
        pending = null;
        callback(value);
      }
    },
    cancel() {
      pending = null;
      if (frameId !== null) {
        cancelRaf(frameId);
        frameId = null;
      }
    },
  };
}
