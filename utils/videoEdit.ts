export interface VideoTrimLike {
  durationSec?: number;
  trimInSec?: number;
  trimOutSec?: number;
}

export interface NormalizedVideoTrim {
  trimInSec?: number;
  trimOutSec?: number;
}

const normalizeNumber = (value: number | undefined): number | undefined => {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return value;
};

export function normalizeVideoTrim(input: VideoTrimLike): NormalizedVideoTrim {
  const durationSec = normalizeNumber(input.durationSec);
  const rawTrimIn = normalizeNumber(input.trimInSec);
  const rawTrimOut = normalizeNumber(input.trimOutSec);

  let trimInSec = rawTrimIn == null ? undefined : Math.max(0, rawTrimIn);
  let trimOutSec = rawTrimOut == null ? undefined : Math.max(0, rawTrimOut);

  if (durationSec != null) {
    if (trimInSec != null) trimInSec = Math.min(trimInSec, durationSec);
    if (trimOutSec != null) trimOutSec = Math.min(trimOutSec, durationSec);
  }

  if (trimInSec != null && trimOutSec != null && trimOutSec < trimInSec) {
    trimOutSec = trimInSec;
  }

  return {
    trimInSec,
    trimOutSec,
  };
}

export function getTrimmedDuration(input: VideoTrimLike): number | undefined {
  const durationSec = normalizeNumber(input.durationSec);
  if (durationSec == null) return undefined;
  const { trimInSec, trimOutSec } = normalizeVideoTrim(input);
  const start = trimInSec ?? 0;
  const end = trimOutSec ?? durationSec;
  return Math.max(0, end - start);
}
