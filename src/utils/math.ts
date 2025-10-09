
/**
 * Round to 2 decimal places (uses Number.EPSILON for floating-point precision)
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
