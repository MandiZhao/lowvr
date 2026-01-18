import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useAppStore } from '../stores/appStore'
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  runIds: string[]
  darkMode?: boolean
}

// Group metrics by prefix
function groupMetrics(metrics: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {}
  
  for (const metric of metrics) {
    const parts = metric.split('/')
    const group = parts.length > 1 ? parts[0] : 'Other'
    if (!groups[group]) groups[group] = []
    groups[group].push(metric)
  }
  
  return groups
}

export default function MetricSelector({ runIds, darkMode = false }: Props) {
  const { activeMetrics, toggleMetric, setActiveMetrics } = useAppStore()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Episode', 'losses']))
  const [search, setSearch] = useState('')
  
  const metricQueries = useQueries({
    queries: runIds.map((runId) => ({
      queryKey: ['available-metrics', runId],
      queryFn: async () => {
        const res = await fetch(`/api/runs/${runId}/available-metrics`)
        if (!res.ok) throw new Error('Failed to fetch available metrics')
        return res.json() as Promise<string[]>
      },
      enabled: !!runId,
      staleTime: 60000,
    })),
  })

  const { availableMetrics, isLoading, error } = useMemo(() => {
    const metricsSet = new Set<string>()
    let loading = false
    let firstError: unknown = null

    metricQueries.forEach((query) => {
      if (query.isLoading) loading = true
      if (!firstError && query.error) firstError = query.error
      if (query.data) {
        query.data.forEach((metric) => metricsSet.add(metric))
      }
    })

    return {
      availableMetrics: Array.from(metricsSet).sort(),
      isLoading: loading,
      error: firstError,
    }
  }, [metricQueries])

  const groupedMetrics = useMemo(() => {
    if (!availableMetrics || availableMetrics.length === 0) return {}
    
    // Filter by search
    let filtered = availableMetrics
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = availableMetrics.filter(m => m.toLowerCase().includes(searchLower))
    }
    
    return groupMetrics(filtered)
  }, [availableMetrics, search])

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }

  const selectAllInGroup = (_group: string, metrics: string[]) => {
    const allSelected = metrics.every(m => activeMetrics.includes(m))
    if (allSelected) {
      setActiveMetrics(activeMetrics.filter(m => !metrics.includes(m)))
    } else {
      const newMetrics = [...new Set([...activeMetrics, ...metrics])]
      setActiveMetrics(newMetrics)
    }
  }

  if (runIds.length === 0) {
    return (
      <div className={clsx("p-3 text-sm", darkMode ? "text-gray-500" : "text-gray-400")}>
        Select runs to view metrics
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={clsx("p-3 text-sm", darkMode ? "text-gray-500" : "text-gray-400")}>
        Loading metrics...
      </div>
    )
  }

  if (error) {
    return (
      <div className={clsx("p-3 text-sm", darkMode ? "text-red-400" : "text-red-600")}>
        Error loading metrics
      </div>
    )
  }

  const groups = Object.entries(groupedMetrics).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="text-sm">
      {/* Search bar */}
      <div className={clsx(
        "px-3 py-2",
        darkMode ? "text-gray-400" : "text-gray-500"
      )}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
          <Search size={14} className={clsx(
            "absolute left-2 top-1/2 -translate-y-1/2",
            darkMode ? "text-gray-500" : "text-gray-400"
          )} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search metrics..."
            className={clsx(
              "w-full border rounded pl-7 pr-2 py-1 text-xs focus:outline-none focus:border-amber-500",
              darkMode 
                ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500" 
                : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"
            )}
          />
          </div>
          {activeMetrics.length > 0 && (
            <button
              onClick={() => setActiveMetrics([])}
              className={clsx(
                "text-xs hover:text-red-500",
                darkMode ? "text-gray-500" : "text-gray-400"
              )}
            >
              Clear ({activeMetrics.length})
            </button>
          )}
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto">
        {groups.length === 0 ? (
          <div className={clsx("px-3 py-2 text-xs", darkMode ? "text-gray-500" : "text-gray-400")}>
            {search ? 'No metrics match search' : 'No metrics available'}
          </div>
        ) : (
          groups.map(([group, metrics]) => {
            const isExpanded = expandedGroups.has(group) || search.length > 0
            const selectedCount = metrics.filter(m => activeMetrics.includes(m)).length

            return (
              <div key={group}>
                <button
                  onClick={() => toggleGroup(group)}
                  className={clsx(
                    "w-full px-3 py-1.5 flex items-center justify-between transition-colors",
                    darkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                  )}
                >
                  <div className={clsx(
                    "flex items-center gap-2",
                    darkMode ? "text-gray-300" : "text-gray-700"
                  )}>
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    <span className="text-xs">{group}</span>
                    <span className={clsx("text-xs", darkMode ? "text-gray-500" : "text-gray-400")}>
                      ({selectedCount}/{metrics.length})
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      selectAllInGroup(group, metrics)
                    }}
                    className={clsx(
                      "text-xs hover:text-amber-500",
                      darkMode ? "text-gray-500" : "text-gray-400"
                    )}
                  >
                    {selectedCount === metrics.length ? 'none' : 'all'}
                  </button>
                </button>

                {isExpanded && (
                  <div className="pl-5 pr-3 pb-1">
                    {metrics.map(metric => {
                      const isActive = activeMetrics.includes(metric)
                      const shortName = metric.split('/').slice(1).join('/') || metric

                      return (
                        <button
                          key={metric}
                          onClick={() => toggleMetric(metric)}
                          className={clsx(
                            'w-full text-left px-2 py-0.5 rounded flex items-center gap-2 transition-colors text-xs',
                            isActive
                              ? (darkMode ? 'bg-amber-900/50 text-amber-400' : 'bg-amber-50 text-amber-700')
                              : (darkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')
                          )}
                        >
                          <div className={clsx(
                            'w-3 h-3 rounded-sm border flex items-center justify-center flex-shrink-0',
                            isActive
                              ? 'bg-amber-500 border-amber-500'
                              : (darkMode ? 'border-gray-500' : 'border-gray-300')
                          )}>
                            {isActive && <Check size={8} className="text-white" />}
                          </div>
                          <span className="truncate" title={metric}>{shortName}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {activeMetrics.length === 0 && !search && (
        <div className="px-3 py-2 text-xs text-gray-400">
          Select metrics to display charts
        </div>
      )}
    </div>
  )
}
