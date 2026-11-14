export function horizonAt(profile: readonly number[], az: number): number {
  const count = profile.length;
  if (count === 0) {
    throw new RangeError('horizon profile is empty');
  }

  const step = 360 / count;
  const normalizedAz = ((az % 360) + 360) % 360;
  const position = normalizedAz / step;

  const left = Math.floor(position) % count;
  const right = (left + 1) % count;
  const fraction = position - Math.floor(position);

  const leftValue = profile[left]!;
  const rightValue = profile[right]!;
  return leftValue + (rightValue - leftValue) * fraction;
}
