import { formatDistanceToNow } from 'date-fns'

/**
 * Safely format a date string as a relative distance (e.g., "3 minutes ago").
 * Returns a fallback string if the date is null, undefined, empty, or invalid.
 */
export function safeFormatDistance(
  dateStr: string | null | undefined,
  options?: { addSuffix?: boolean },
): string {
  if (!dateStr || dateStr.trim() === '') return 'Never'
  try {
    const date = new Date(dateStr)
    if (Number.isNaN(date.getTime())) return 'Invalid date'
    return formatDistanceToNow(date, { addSuffix: true, ...options })
  } catch {
    return 'Invalid date'
  }
}
