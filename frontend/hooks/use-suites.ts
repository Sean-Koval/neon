'use client'

import { type Suite, api } from '@/lib/api'
import { useQuery } from '@tanstack/react-query'

export function useSuites() {
  return useQuery<Suite[]>({
    queryKey: ['suites'],
    queryFn: () => api.getSuites(),
  })
}

export function useSuite(id: string) {
  return useQuery<Suite>({
    queryKey: ['suites', id],
    queryFn: () => api.getSuite(id),
    enabled: !!id,
  })
}
