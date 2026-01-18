import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '../stores/appStore'
import { useRuns } from '../hooks/useRuns'
import { ChevronDown, ChevronUp, Search, Plus, Check, X } from 'lucide-react'
import clsx from 'clsx'

// Fetch all config keys
function useConfigKeys() {
  return useQuery<string[]>({
    queryKey: ['config-keys'],
    queryFn: async () => {
      const res = await fetch('/api/config-keys')
      if (!res.ok) throw new Error('Failed to fetch config keys')
      return res.json()
    },
  })
}

// Group keys by top-level prefix
function groupKeys(keys: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {}
  
  for (const key of keys) {
    const parts = key.split('.')
    const group = parts[0]
    if (!groups[group]) groups[group] = []
    groups[group].push(key)
  }
  
  return groups
}

// Custom dropdown component that can show full values
function ValueDropdown({ 
  value, 
  options, 
  onChange,
  placeholder = 'any',
  darkMode = false
}: { 
  value: string | undefined
  options: string[]
  onChange: (val: string | undefined) => void
  placeholder?: string
  darkMode?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const displayValue = value || placeholder

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'w-full text-left text-xs border rounded px-2 py-1 focus:outline-none focus:border-amber-500 flex items-center justify-between gap-1',
          value
            ? (darkMode ? 'border-amber-600 bg-amber-900/50 text-amber-300' : 'border-amber-300 bg-amber-50')
            : (darkMode ? 'border-gray-600 bg-gray-700 text-gray-200' : 'border-gray-200 bg-white')
        )}
      >
        <span className="truncate flex-1" title={displayValue}>
          {displayValue.length > 20 ? displayValue.slice(0, 17) + '...' : displayValue}
        </span>
        {value ? (
          <X 
            size={12} 
            className={clsx("hover:text-red-500 flex-shrink-0", darkMode ? "text-gray-500" : "text-gray-400")}
            onClick={(e) => { e.stopPropagation(); onChange(undefined); }}
          />
        ) : (
          <ChevronDown size={12} className={clsx("flex-shrink-0", darkMode ? "text-gray-500" : "text-gray-400")} />
        )}
      </button>
      
      {isOpen && (
        <div className={clsx(
          "absolute z-50 mt-1 left-0 min-w-full border rounded shadow-lg max-h-48 overflow-y-auto",
          darkMode ? "bg-gray-700 border-gray-600" : "bg-white border-gray-200"
        )}>
          <button
            onClick={() => { onChange(undefined); setIsOpen(false); }}
            className={clsx(
              'w-full text-left px-2 py-1.5 text-xs whitespace-nowrap',
              !value 
                ? (darkMode ? 'bg-amber-900/50 text-amber-400' : 'bg-amber-50 text-amber-700')
                : (darkMode ? 'text-gray-200 hover:bg-gray-600' : 'hover:bg-gray-50')
            )}
          >
            {placeholder}
          </button>
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setIsOpen(false); }}
              className={clsx(
                'w-full text-left px-2 py-1.5 text-xs whitespace-nowrap',
                value === opt 
                  ? (darkMode ? 'bg-amber-900/50 text-amber-400' : 'bg-amber-50 text-amber-700')
                  : (darkMode ? 'text-gray-200 hover:bg-gray-600' : 'hover:bg-gray-50')
              )}
              title={opt}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Helper to get nested value from config (matches RunSelector logic)
function getNestedValue(obj: Record<string, unknown> | null, path: string): unknown {
  if (!obj) return undefined
  
  const tryPath = (p: string): unknown => {
    const parts = p.split('.')
    let current: unknown = obj
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return undefined
      }
    }
    return current
  }
  
  const direct = tryPath(path)
  if (direct !== undefined) return direct
  
  const prefixes = ['env_kwargs', 'task', 'params', 'config']
  for (const prefix of prefixes) {
    if (path.startsWith(prefix + '.')) {
      const withoutPrefix = path.slice(prefix.length + 1)
      for (const altPrefix of prefixes) {
        if (altPrefix !== prefix) {
          const val = tryPath(altPrefix + '.' + withoutPrefix)
          if (val !== undefined) return val
        }
      }
      const val = tryPath(withoutPrefix)
      if (val !== undefined) return val
    } else {
      const val = tryPath(prefix + '.' + path)
      if (val !== undefined) return val
    }
  }
  
  return undefined
}

interface Props {
  darkMode?: boolean
}

export default function ConfigFilter({ darkMode = false }: Props) {
  const { data: configKeys, isLoading } = useConfigKeys()
  const { data: runs } = useRuns()
  const { 
    configFilters, 
    setConfigFilter, 
    clearConfigFilters,
    configDisplayKeys,
    addConfigDisplayKey,
    removeConfigDisplayKey,
    clearConfigDisplayKeys,
  } = useAppStore()
  const [search, setSearch] = useState('')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'columns' | 'filters'>('columns')

  const groupedKeys = useMemo(() => {
    if (!configKeys) return {}
    const isHiddenKey = (key: string) => key.startsWith('_wandb') || key.startsWith('wandb_version')
    const visibleKeys = configKeys.filter((key) => !isHiddenKey(key))
    return groupKeys(visibleKeys)
  }, [configKeys])

  const filteredGroups = useMemo(() => {
    if (!search) return groupedKeys
    
    const result: Record<string, string[]> = {}
    for (const [group, keys] of Object.entries(groupedKeys)) {
      const filtered = keys.filter(key => 
        key.toLowerCase().includes(search.toLowerCase())
      )
      if (filtered.length > 0) {
        result[group] = filtered
      }
    }
    return result
  }, [groupedKeys, search])

  // Get unique values for each config key across all runs
  const configValues = useMemo(() => {
    if (!runs || !configKeys) return {}
    
    const values: Record<string, Set<string>> = {}
    
    const isHiddenKey = (key: string) => key.startsWith('_wandb') || key.startsWith('wandb_version')
    for (const key of configKeys.filter((k) => !isHiddenKey(k))) {
      values[key] = new Set()
      for (const run of runs) {
        const value = getNestedValue(run.config, key)
        if (value !== undefined && value !== null) {
          values[key].add(String(value))
        }
      }
    }
    
    return values
  }, [runs, configKeys])

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

  if (isLoading) {
    return (
      <div className={clsx("p-3 text-sm", darkMode ? "text-gray-500" : "text-gray-400")}>
        Loading config keys...
      </div>
    )
  }

  const groups = Object.entries(filteredGroups).sort(([a], [b]) => a.localeCompare(b))
  const activeFilterCount = Object.values(configFilters).filter(v => v).length

  return (
    <div className="text-sm">
      {/* Header with mode toggle */}
      <div className={clsx(
        "px-3 py-2 border-b flex items-center justify-between",
        darkMode ? "border-gray-700" : "border-gray-200"
      )}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode('columns')}
            className={clsx(
              'px-2 py-1 rounded text-xs font-medium transition-colors',
              mode === 'columns' 
                ? 'bg-amber-100 text-amber-700' 
                : (darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')
            )}
          >
            Columns ({configDisplayKeys.length})
          </button>
          <button
            onClick={() => setMode('filters')}
            className={clsx(
              'px-2 py-1 rounded text-xs font-medium transition-colors',
              mode === 'filters' 
                ? 'bg-amber-100 text-amber-700' 
                : (darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700')
            )}
          >
            Filters ({activeFilterCount})
          </button>
        </div>
        <button
          onClick={() => mode === 'columns' ? clearConfigDisplayKeys() : clearConfigFilters()}
          className={clsx("text-xs hover:text-red-500", darkMode ? "text-gray-500" : "text-gray-400")}
        >
          Clear
        </button>
      </div>

      {/* Search */}
      <div className={clsx("p-2 border-b", darkMode ? "border-gray-700" : "border-gray-200")}>
        <div className="relative">
          <Search size={14} className={clsx(
            "absolute left-2 top-1/2 -translate-y-1/2",
            darkMode ? "text-gray-500" : "text-gray-400"
          )} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search config keys..."
            className={clsx(
              "w-full border rounded pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:border-amber-500",
              darkMode 
                ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500" 
                : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"
            )}
          />
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto">
        {groups.length === 0 ? (
          <div className={clsx("p-3 text-xs", darkMode ? "text-gray-500" : "text-gray-400")}>
            No config keys found
          </div>
        ) : (
          groups.map(([group, keys]) => {
            const isExpanded = expandedGroups.has(group)

            return (
              <div key={group}>
                <button
                  onClick={() => toggleGroup(group)}
                  className={clsx(
                    "w-full px-3 py-2 flex items-center justify-between transition-colors text-left",
                    darkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                  )}
                >
                  <div className={clsx(
                    "flex items-center gap-2",
                    darkMode ? "text-gray-300" : "text-gray-700"
                  )}>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    <span className="font-medium">{group}</span>
                    <span className={clsx("text-xs", darkMode ? "text-gray-500" : "text-gray-400")}>({keys.length})</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="pl-6 pr-3 pb-2 space-y-1">
                    {keys.map(key => {
                      const shortKey = key.split('.').slice(1).join('.')
                      const isDisplayed = configDisplayKeys.includes(key)
                      const filterValue = configFilters[key]
                      const availableValues = Array.from(configValues[key] || []).sort()

                      if (mode === 'columns') {
                        return (
                          <button
                            key={key}
                            onClick={() => isDisplayed ? removeConfigDisplayKey(key) : addConfigDisplayKey(key)}
                            className={clsx(
                              'w-full text-left px-2 py-1 rounded flex items-center gap-2 text-xs transition-colors',
                              isDisplayed
                                ? (darkMode ? 'bg-amber-900/50 text-amber-400' : 'bg-amber-50 text-amber-600')
                                : (darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-50')
                            )}
                            title={key}
                          >
                            {isDisplayed ? (
                              <Check size={12} className="text-amber-500" />
                            ) : (
                              <Plus size={12} className={darkMode ? "text-gray-500" : "text-gray-400"} />
                            )}
                            <span className="truncate">{shortKey || key}</span>
                          </button>
                        )
                      } else {
                        return (
                          <div key={key} className="space-y-1">
                            <span 
                              className={clsx("text-xs block", darkMode ? "text-gray-400" : "text-gray-600")}
                              title={key}
                            >
                              {shortKey || key}
                            </span>
                            <ValueDropdown
                              value={filterValue}
                              options={availableValues}
                              onChange={(val) => setConfigFilter(key, val)}
                              darkMode={darkMode}
                            />
                          </div>
                        )
                      }
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
