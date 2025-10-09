/**
 * Math Utilities
 * 
 * Shared mathematical functions used throughout the application.
 */

/**
 * Round a number to 2 decimal places (cents precision).
 * Uses Number.EPSILON to handle floating-point precision errors.
 * 
 * @param value - The value to round
 * @returns The value rounded to 2 decimal places
 * 
 * @example
 * roundToTwoDecimals(0.835) // Returns 0.84
 * roundToTwoDecimals(1.005) // Returns 1.01
 */
export function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
