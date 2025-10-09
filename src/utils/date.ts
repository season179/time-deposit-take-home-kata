
import { MS_PER_DAY } from './constants'

/**
 * Calculate full days between two dates (floor, minimum 0)
 */
export function calculateDaysBetween(fromDate: Date, toDate: Date = new Date()): number {
  const daysDiff = Math.floor((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY)
  return Math.max(0, daysDiff)
}

export function findEarliestDate(dates: Date[]): Date | null {
  if (dates.length === 0) return null
  
  return dates.reduce((earliest, current) => {
    return current < earliest ? current : earliest
  }, dates[0])
}
