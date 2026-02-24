/**
 * Activity feed event types for the Command Center.
 */

export interface ActivityEvent {
  id: string
  type: 'eval-complete' | 'deploy' | 'optimization' | 'alert'
  description: string
  timestamp: string // ISO 8601
  href: string // link to detail page
  metadata?: Record<string, unknown>
}
