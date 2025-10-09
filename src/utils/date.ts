/**
 * Date Utilities
 * 
 * Shared date calculation functions used throughout the application.
 */

import { MS_PER_DAY } from './constants'

/**
 * Calculate the number of days between two dates.
 * Returns the floor of the difference (full days only).
 * 
 * @param fromDate - The earlier date
 * @param toDate - The later date (defaults to now)
 * @returns The number of full days elapsed, minimum 0
 * 
 * @example
 * const past = new Date('2024-01-01')
 * const future = new Date('2024-01-10')
 * calculateDaysBetween(past, future) // Returns 9
 */
export function calculateDaysBetween(fromDate: Date, toDate: Date = new Date()): number {
  const daysDiff = Math.floor((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY)
  return Math.max(0, daysDiff) // Ensure non-negative
}

/**
 * Find the earliest date from an array of dates.
 * 
 * @param dates - Array of dates to search
 * @returns The earliest date, or null if array is empty
 */
export function findEarliestDate(dates: Date[]): Date | null {
  if (dates.length === 0) return null
  
  return dates.reduce((earliest, current) => {
    return current < earliest ? current : earliest
  }, dates[0])
}
