import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Run } from '../hooks/useRuns'
import { useAppStore, getRunColor } from '../stores/appStore'
import { Search, Check, X, GripVertical, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import ColorPicker from './ColorPicker'

interface Props {
  runs: Run[]
  isLoading: boolean
  darkMode?: boolean
}

// Helper to get nested value from config
function getNestedValue(obj: Record<string, unknown> | null, path: string): unknown {
  if (!obj) return undefined
  
  // Try direct path first
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
  
  // Try common prefixes for config compatibility between online/offline runs
  // Online runs often use env_kwargs.*, offline runs use task.*
  const prefixes = ['env_kwargs', 'task', 'params', 'config']
  for (const prefix of prefixes) {
    // If path starts with prefix, try without it
    if (path.startsWith(prefix + '.')) {
      const withoutPrefix = path.slice(prefix.length + 1)
      // Try with other prefixes
      for (const altPrefix of prefixes) {
        if (altPrefix !== prefix) {
          const val = tryPath(altPrefix + '.' + withoutPrefix)
          if (val !== undefined) return val
        }
      }
      // Also try the shortened path directly
      const val = tryPath(withoutPrefix)
      if (val !== undefined) return val
    } else {
      // Try adding each prefix
      const val = tryPath(prefix + '.' + path)
      if (val !== undefined) return val
    }
  }
  
  return undefined
}

// Format config value for display
function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '-'
  if (typeof value === 'boolean') return value ? '✓' : '✗'
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value)
    return value.toFixed(3)
  }
  if (typeof value === 'string') {
    return value.length > 12 ? value.slice(0, 9) + '...' : value
  }
  return String(value).slice(0, 12)
}

// Get short key name (last part)
function shortKey(key: string): string {
  const parts = key.split('.')
  return parts[parts.length - 1]
}

export default function RunSelector({ runs, isLoading, darkMode = false }: Props) {
  const queryClient = useQueryClient()
  const { 
    selectedRunIds, 
    toggleRunSelection, 
    clearSelection, 
    selectRuns, 
    configFilters,
    configDisplayKeys,
    removeConfigDisplayKey,
    hoveredRunId,
    setHoveredRunId,
    runColors,
    setRunColor,
  } = useAppStore()
  const [search, setSearch] = useState('')
  
  // Resizable run column width
  const [runColumnWidth, setRunColumnWidth] = useState(220)
  const [isResizing, setIsResizing] = useState(false)
  
  // Delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  
  // Stop confirmation state
  
  // Color picker state
  const [colorPickerRunId, setColorPickerRunId] = useState<string | null>(null)
  const colorPickerRef = useRef<HTMLDivElement>(null)
  
  const handleDeleteRun = async (runId: string) => {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/runs/${runId}`, { method: 'DELETE' })
      if (res.ok) {
        setDeleteConfirm(null)
        // Deselect the deleted run if it was selected
        if (selectedRunIds.includes(runId)) {
          selectRuns(selectedRunIds.filter(id => id !== runId))
        }
        // Invalidate runs query to refetch - preserves all other UI state
        await queryClient.invalidateQueries({ queryKey: ['runs'] })
      } else {
        const error = await res.json()
        alert(`Failed to delete: ${error.detail || 'Unknown error'}`)
      }
    } catch (err) {
      alert(`Failed to delete: ${err}`)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedRunIds.length === 0) return
    
    setIsBulkDeleting(true)
    try {
      // Delete all selected runs in parallel
      const deletePromises = selectedRunIds.map(runId =>
        fetch(`/api/runs/${runId}`, { method: 'DELETE' })
      )
      
      const results = await Promise.allSettled(deletePromises)
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok))
      
      if (failed.length > 0) {
        alert(`Failed to delete ${failed.length} run(s)`)
      }
      
      setBulkDeleteConfirm(false)
      clearSelection()
      // Invalidate runs query to refetch
      await queryClient.invalidateQueries({ queryKey: ['runs'] })
    } catch (err) {
      alert(`Failed to delete runs: ${err}`)
    } finally {
      setIsBulkDeleting(false)
    }
  }

  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        // Check if click is on the color dot itself (don't close if clicking the dot)
        const target = event.target as HTMLElement
        if (target.closest('[data-color-dot]')) {
          return
        }
        setColorPickerRunId(null)
      }
    }
    
    if (colorPickerRunId) {
      // Use a small delay to avoid closing immediately when opening
      const timeout = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
      }, 100)
      return () => {
        clearTimeout(timeout)
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [colorPickerRunId])
  
  
  const filteredRuns = useMemo(() => {
    const filtered = runs.filter((run) => {
      if (search) {
        const searchLower = search.toLowerCase()
        const matchesId = run.id.toLowerCase().includes(searchLower)
        const matchesName = run.display_name.toLowerCase().includes(searchLower)
        const matchesArgs = run.metadata.args?.some(arg => 
          arg.toLowerCase().includes(searchLower)
        )
        if (!matchesId && !matchesName && !matchesArgs) return false
      }

      for (const [key, filterValue] of Object.entries(configFilters)) {
        if (!filterValue) continue
        const configValue = getNestedValue(run.config, key)
        if (configValue === undefined) return false
        
        const valueStr = String(configValue).toLowerCase()
        const filterStr = filterValue.toLowerCase()
        
        if (!valueStr.includes(filterStr)) return false
      }

      return true
    })

    return filtered.sort((a, b) => {
      const aTime = a.created_at ? Date.parse(a.created_at) : 0
      const bTime = b.created_at ? Date.parse(b.created_at) : 0
      if (aTime === bTime) return b.id.localeCompare(a.id)
      return bTime - aTime
    })
  }, [runs, search, configFilters])

  // Resize handlers
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const stopResizing = useCallback(() => {
    setIsResizing(false)
  }, [])

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      // Calculate relative to parent
      const newWidth = e.clientX - 48 // Account for sidebar padding/collapse button area
      if (newWidth >= 150 && newWidth <= 400) {
        setRunColumnWidth(newWidth)
      }
    }
  }, [isResizing])

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize)
      window.addEventListener('mouseup', stopResizing)
    }
    return () => {
      window.removeEventListener('mousemove', resize)
      window.removeEventListener('mouseup', stopResizing)
    }
  }, [isResizing, resize, stopResizing])

  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-400">
        <div className="animate-pulse">Loading runs...</div>
      </div>
    )
  }

  const activeFilterCount = Object.keys(configFilters).length
  const hasConfigColumns = configDisplayKeys.length > 0

  return (
    <div className="flex flex-col h-full relative">
      {/* Column headers */}
      <div className="flex border-b border-gray-200 bg-gray-100 text-xs flex-shrink-0">
        <div 
          className={clsx(
            "px-2 py-1.5 font-medium text-gray-600",
            hasConfigColumns ? "flex-shrink-0" : "flex-1"
          )}
          style={hasConfigColumns ? { width: runColumnWidth } : undefined}
        >
          Run
        </div>
        {hasConfigColumns && (
          <>
            {/* Resize handle */}
            <div
              className="w-1 bg-gray-200 cursor-col-resize hover:bg-amber-400 flex items-center justify-center"
              onMouseDown={startResizing}
            >
              <GripVertical size={10} className="text-gray-400" />
            </div>
            {configDisplayKeys.map(key => (
              <div 
                key={key} 
                className="flex-1 min-w-[60px] px-1 py-1.5 font-medium text-gray-600 text-center border-l border-gray-200 flex items-center justify-between"
                title={key}
              >
                <span className="truncate flex-1 text-xs">{shortKey(key)}</span>
                <button
                  onClick={() => removeConfigDisplayKey(key)}
                  className="p-0.5 text-gray-400 hover:text-red-500 flex-shrink-0"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Search */}
      <div className={clsx(
        "p-2 border-b flex-shrink-0",
        darkMode ? "border-gray-700" : "border-gray-200"
      )}>
        <div className="relative">
          <Search size={14} className={clsx(
            "absolute left-2 top-1/2 -translate-y-1/2",
            darkMode ? "text-gray-500" : "text-gray-400"
          )} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search runs..."
            className={clsx(
              "w-full border rounded pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:border-amber-500",
              darkMode 
                ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500" 
                : "bg-white border-gray-200 text-gray-900 placeholder-gray-400"
            )}
          />
        </div>
        <div className="flex justify-between items-center mt-1.5 text-xs">
          <span className={darkMode ? "text-gray-400" : "text-gray-500"}>{filteredRuns.length} runs</span>
          <div className="flex gap-2">
            {activeFilterCount > 0 && (
              <span className="text-amber-600">{activeFilterCount} filters</span>
            )}
            {selectedRunIds.length > 0 && (
              <button onClick={clearSelection} className={clsx(
                "hover:text-red-500",
                darkMode ? "text-gray-500" : "text-gray-400"
              )}>
                Clear ({selectedRunIds.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk actions */}
      <div className={clsx(
        "px-2 py-1 border-b flex items-center justify-between gap-2 text-xs flex-shrink-0",
        darkMode ? "border-gray-700" : "border-gray-200"
      )}>
        <div className="flex items-center gap-2">
          {selectedRunIds.length > 0 && (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className={clsx(
                "px-2 py-1 rounded hover:bg-red-50 hover:text-red-600 transition-colors",
                darkMode ? "text-gray-400 hover:bg-red-900/20" : "text-red-600"
              )}
            >
              Delete {selectedRunIds.length} run{selectedRunIds.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-gray-500">
          <button
            onClick={() => selectRuns(filteredRuns.slice(0, 5).map(r => r.id))}
            className="hover:text-amber-600"
          >
            First 5
          </button>
          <button
            onClick={() => selectRuns(filteredRuns.map(r => r.id))}
            className="hover:text-amber-600"
          >
            All
          </button>
        </div>
      </div>

      {/* Run list */}
      <div className="flex-1 overflow-y-auto overflow-x-auto">
        <div className={clsx(
          "divide-y",
          darkMode ? "divide-gray-700" : "divide-gray-100"
        )}>
          {filteredRuns.map((run) => {
            const isSelected = selectedRunIds.includes(run.id)
            
            return (
              <div
                key={run.id}
                className={clsx(
                  'flex transition-colors group/row',
                  hasConfigColumns && 'min-w-max',
                  isSelected 
                    ? (darkMode ? 'bg-amber-900/30' : 'bg-amber-50')
                    : (darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'),
                  hoveredRunId === run.id && 'ring-2 ring-inset ring-amber-300'
                )}
                onMouseEnter={() => isSelected && setHoveredRunId(run.id)}
                onMouseLeave={() => setHoveredRunId(null)}
              >
                {/* Run info */}
                <div
                  className={clsx(
                    "flex items-center gap-1.5 px-2 py-1.5 relative",
                    hasConfigColumns ? "flex-shrink-0" : "flex-1"
                  )}
                  style={hasConfigColumns ? { width: runColumnWidth } : undefined}
                >
                  {/* Fixed color dot for all runs - like online wandb */}
                  <div className="relative flex-shrink-0">
                    <button
                      type="button"
                      data-color-dot
                      className="w-2.5 h-2.5 rounded-full cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
                      style={{ backgroundColor: getRunColor(run.id, runColors) }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setColorPickerRunId(colorPickerRunId === run.id ? null : run.id)
                      }}
                      title="Click to change color"
                    />
                    {colorPickerRunId === run.id && (
                      <div 
                        ref={colorPickerRef}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ColorPicker
                          currentColor={getRunColor(run.id, runColors)}
                          onSelectColor={(color) => {
                            setRunColor(run.id, color)
                            setColorPickerRunId(null)
                          }}
                          darkMode={darkMode}
                        />
                      </div>
                    )}
                  </div>
                  
                  <button
                    onClick={() => toggleRunSelection(run.id)}
                    className={clsx(
                      'w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
                      isSelected
                        ? 'bg-amber-500 border-amber-500'
                        : darkMode 
                          ? 'border-gray-500 hover:border-gray-400'
                          : 'border-gray-300 hover:border-gray-400'
                    )}
                  >
                    {isSelected && <Check size={10} className="text-white" />}
                  </button>

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const selection = window.getSelection()?.toString() || ''
                      if (selection) return
                      toggleRunSelection(run.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleRunSelection(run.id)
                      }
                    }}
                    className="flex-1 min-w-0 flex items-center gap-1 text-left cursor-pointer"
                  >
                    {/* Display name - full width */}
                    <p className={clsx(
                      'text-xs truncate flex-1 select-text',
                      darkMode
                        ? (isSelected ? 'text-gray-100' : 'text-gray-300')
                        : (isSelected ? 'text-gray-900' : 'text-gray-600')
                    )} title={run.display_name}>
                      {run.display_name}
                    </p>
                    
                    {/* Video badge */}
                    {run.has_videos && (
                      <span className={clsx(
                        "text-[9px] px-0.5 rounded flex-shrink-0",
                        darkMode ? "bg-blue-900 text-blue-400" : "bg-blue-100 text-blue-600"
                      )}>
                        vid
                      </span>
                    )}
                  </div>

                  {/* Delete button - appears on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteConfirm({ id: run.id, name: run.display_name })
                    }}
                    className="p-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover/row:opacity-100 transition-all flex-shrink-0"
                    title="Delete run"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* Config value columns */}
                {hasConfigColumns && (
                  <>
                    <div className={clsx(
                      "w-px",
                      isSelected
                        ? (darkMode ? "bg-amber-900/30" : "bg-amber-50")
                        : (darkMode ? "bg-gray-700" : "bg-gray-200"),
                      darkMode ? "group-hover/row:bg-gray-700" : "group-hover/row:bg-gray-200"
                    )} />
                    {configDisplayKeys.map(key => {
                      const value = getNestedValue(run.config, key)
                      return (
                        <div 
                          key={key}
                          className={clsx(
                            "flex-1 min-w-[60px] px-1 py-1.5 text-xs text-center border-l flex items-center justify-center bg-transparent",
                            darkMode ? "border-gray-700" : "border-gray-100",
                            darkMode ? "group-hover/row:bg-gray-700" : "group-hover/row:bg-gray-50",
                            isSelected
                              ? (darkMode ? "bg-amber-900/30" : "bg-amber-50")
                              : "",
                            darkMode
                              ? (isSelected ? "text-gray-100" : "text-gray-300")
                              : (isSelected ? "text-gray-900" : "text-gray-600")
                          )}
                          title={`${key}: ${value}`}
                        >
                          {formatValue(value)}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {filteredRuns.length === 0 && (
          <div className="p-4 text-center text-gray-400 text-sm">
            No runs found
          </div>
        )}
      </div>

      {/* Resize overlay */}
      {isResizing && (
        <div className="fixed inset-0 cursor-col-resize z-50" />
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Delete Run?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to permanently delete this run?
            </p>
            <p className="text-xs text-gray-500 bg-gray-100 rounded p-2 mb-4 truncate" title={deleteConfirm.name}>
              {deleteConfirm.name}
            </p>
            <p className="text-xs text-red-600 mb-4">
              This action cannot be undone. The entire run folder will be deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteRun(deleteConfirm.id)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Bulk delete confirmation dialog */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Delete {selectedRunIds.length} Run{selectedRunIds.length !== 1 ? 's' : ''}?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to permanently delete {selectedRunIds.length} selected run{selectedRunIds.length !== 1 ? 's' : ''}?
            </p>
            <p className="text-xs text-red-600 mb-4">
              This action cannot be undone. The entire run folders will be deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setBulkDeleteConfirm(false)}
                disabled={isBulkDeleting}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {isBulkDeleting ? 'Deleting...' : `Delete ${selectedRunIds.length} Run${selectedRunIds.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
