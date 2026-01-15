import { useQuery } from '@tanstack/react-query'

export interface Run {
  id: string
  display_name: string
  created_at: string | null
  is_offline: boolean
  has_videos: boolean
  state: string | null  // 'running', 'finished', etc.
  metadata: {
    host: string | null
    gpu: string | null
    args: string[] | null
    program: string | null
  }
  config: Record<string, unknown> | null
}

export interface RunDetail {
  id: string
  dir: string
  display_name: string
  created_at: string | null
  is_offline: boolean
  has_videos: boolean
  metadata: Record<string, unknown> | null
  config: Record<string, unknown> | null
  summary: Record<string, unknown> | null
}

export interface Video {
  path: string
  filename: string
  name: string
  epoch: number | null
  relative_path: string
}

// Common x-axis keys to always fetch
const X_AXIS_KEYS = ['_step', 'iter', 'info/epochs', 'step', '_timestamp', '_runtime']

// Fetch all runs
export function useRuns() {
  return useQuery<Run[]>({
    queryKey: ['runs'],
    queryFn: async () => {
      const res = await fetch('/api/runs')
      if (!res.ok) throw new Error('Failed to fetch runs')
      return res.json()
    },
  })
}

// Fetch single run details
export function useRun(runId: string | null) {
  return useQuery<RunDetail>({
    queryKey: ['run', runId],
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}`)
      if (!res.ok) throw new Error('Failed to fetch run')
      return res.json()
    },
    enabled: !!runId,
  })
}

// Fetch metrics for a run
export function useRunMetrics(runId: string | null, keys?: string[]) {
  const queryString = keys?.length
    ? '?' + keys.map((k) => `keys=${encodeURIComponent(k)}`).join('&')
    : ''

  return useQuery<Record<string, (number | null)[]>>({
    queryKey: ['metrics', runId, keys],
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/metrics${queryString}`)
      if (!res.ok) throw new Error('Failed to fetch metrics')
      return res.json()
    },
    enabled: !!runId,
    staleTime: 60000,
  })
}

// Fetch available metrics for a run
export function useAvailableMetrics(runId: string | null) {
  return useQuery<string[]>({
    queryKey: ['available-metrics', runId],
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/available-metrics`)
      if (!res.ok) throw new Error('Failed to fetch available metrics')
      return res.json()
    },
    enabled: !!runId,
  })
}

// Fetch videos for a run
export function useRunVideos(runId: string | null) {
  return useQuery<Video[]>({
    queryKey: ['videos', runId],
    queryFn: async () => {
      const res = await fetch(`/api/runs/${runId}/videos`)
      if (!res.ok) throw new Error('Failed to fetch videos')
      return res.json()
    },
    enabled: !!runId,
  })
}

// Fetch metrics for multiple runs at once
// Always includes common x-axis keys for plotting
export function useMultiRunMetrics(runIds: string[], keys?: string[]) {
  // Merge requested keys with x-axis keys
  const allKeys = keys?.length 
    ? [...new Set([...keys, ...X_AXIS_KEYS])]
    : undefined

  return useQuery<Map<string, Record<string, (number | null)[]>>>({
    queryKey: ['multi-metrics', runIds, allKeys],
    queryFn: async () => {
      const results = new Map()
      const queryString = allKeys?.length
        ? '?' + allKeys.map((k) => `keys=${encodeURIComponent(k)}`).join('&')
        : ''

      await Promise.all(
        runIds.map(async (runId) => {
          const res = await fetch(`/api/runs/${runId}/metrics${queryString}`)
          if (res.ok) {
            results.set(runId, await res.json())
          }
        })
      )
      return results
    },
    enabled: runIds.length > 0,
    staleTime: 60000,
  })
}
