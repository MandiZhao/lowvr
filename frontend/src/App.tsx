import { useState, useEffect, useCallback } from 'react'
import { useRuns } from './hooks/useRuns'
import { useAppStore } from './stores/appStore'
import RunSelector from './components/RunSelector'
import MetricSelector from './components/MetricSelector'
import ComparisonCharts from './components/ComparisonCharts'
import VideoGallery from './components/VideoGallery'
import RunSetsPanel from './components/RunSetsPanel'
import ConfigFilter from './components/ConfigFilter'
import { 
  BarChart3, 
  Video, 
  LayoutGrid, 
  RefreshCw,
  Layers,
  Clock,
  GripVertical,
  Sun,
  Moon
} from 'lucide-react'
import clsx from 'clsx'

export default function App() {
  const { data: runs, isLoading, refetch, isRefetching } = useRuns()
  const { 
    selectedRunIds, 
    viewMode,
    setViewMode,
    darkMode,
    toggleDarkMode
  } = useAppStore()
  const [showRunSets, setShowRunSets] = useState(false)
  const [showConfigFilter, setShowConfigFilter] = useState(false)
  const [showMetrics, setShowMetrics] = useState(false)
  const [metricsHeight] = useState(260)
  
  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(450)
  const [isResizing, setIsResizing] = useState(false)

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(30) // seconds

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(() => {
      refetch()
    }, refreshInterval * 1000)
    
    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, refetch])
  
  // Sidebar resize handlers
  const startResizing = useCallback(() => {
    setIsResizing(true)
  }, [])

  const stopResizing = useCallback(() => {
    setIsResizing(false)
  }, [])

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = e.clientX
      if (newWidth >= 200 && newWidth <= 800) {
        setSidebarWidth(newWidth)
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

  return (
    <div className={clsx(
      "h-screen flex flex-col overflow-hidden transition-colors",
      darkMode ? "bg-gray-900 text-gray-100" : "bg-[#f7f2ea] text-gray-900"
    )}>
      {/* Header */}
      <header className={clsx(
        "flex items-center px-4 pt-3 pb-2 flex-shrink-0 transition-colors",
        darkMode ? "bg-gray-900" : "bg-[#f7f2ea]"
      )}>
        <div className={clsx(
          "flex items-center justify-between w-full rounded-2xl px-4 py-3 shadow-sm",
          darkMode ? "bg-gray-800" : "bg-[#fffdf8]"
        )}>
          <div className="flex items-center gap-3">
            <div className={clsx(
              "flex items-center rounded-lg p-1 shadow-sm h-10",
              darkMode ? "bg-gray-700" : "bg-white"
            )}>
            <button
              onClick={() => setViewMode('charts')}
              className={clsx(
                'px-3 h-8 rounded-md transition-colors flex items-center gap-2 text-sm font-medium',
                viewMode === 'charts' 
                  ? 'bg-amber-100 text-amber-700' 
                  : darkMode
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
              title="Charts only"
            >
              <BarChart3 size={18} />
              <span>Charts</span>
            </button>
            <button
              onClick={() => setViewMode('videos')}
              className={clsx(
                'px-3 h-8 rounded-md transition-colors flex items-center gap-2 text-sm font-medium',
                viewMode === 'videos' 
                  ? 'bg-amber-100 text-amber-700' 
                  : darkMode
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
              title="Videos only"
            >
              <Video size={18} />
              <span>Videos</span>
            </button>
            <button
              onClick={() => setViewMode('both')}
              className={clsx(
                'px-3 h-8 rounded-md transition-colors flex items-center gap-2 text-sm font-medium',
                viewMode === 'both' 
                  ? 'bg-amber-100 text-amber-700' 
                  : darkMode
                    ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-600'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              )}
              title="Both charts and videos"
            >
              <LayoutGrid size={18} />
              <span>Both</span>
            </button>
          </div>
          <button
            onClick={() => setShowRunSets(!showRunSets)}
            className={clsx(
              'px-3 h-10 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium',
              showRunSets
                ? 'bg-amber-100 text-amber-700'
                : darkMode
                  ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white'
            )}
            title="Saved run sets"
          >
            <Layers size={18} />
            <span>Run Sets</span>
          </button>
          </div>

          <div className="flex items-center gap-3">
            <span className={clsx(
              "text-sm px-2 rounded h-10 inline-flex items-center",
              darkMode ? "text-gray-400 bg-gray-700" : "text-gray-500 bg-white"
            )}>
              {runs?.length || 0} runs
            </span>
          {/* Auto-refresh controls */}
          <div className={clsx(
            "flex items-center gap-1 rounded-lg px-2 h-10",
            darkMode ? "bg-gray-700" : "bg-white"
          )}>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={clsx(
                'p-1.5 rounded transition-colors flex items-center gap-1 text-sm h-8 w-8 justify-center',
                autoRefresh
                  ? 'text-green-600'
                  : darkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-700'
              )}
              title={autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
            >
              <Clock size={16} />
            </button>
            {autoRefresh && (
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className={clsx(
                  "bg-transparent text-xs focus:outline-none h-8",
                  darkMode ? "text-gray-300" : "text-gray-600"
                )}
              >
                <option value={10}>10s</option>
                <option value={30}>30s</option>
                <option value={60}>1m</option>
                <option value={300}>5m</option>
              </select>
            )}
          </div>

          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className={clsx(
              "h-10 w-10 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center",
              darkMode 
                ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700" 
                : "text-gray-500 hover:text-gray-700 hover:bg-white"
            )}
            title="Refresh runs"
          >
            <RefreshCw size={18} className={isRefetching ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={toggleDarkMode}
            className={clsx(
              "h-10 w-10 rounded-full transition-all duration-300 relative overflow-hidden flex items-center justify-center",
              darkMode 
                ? "bg-indigo-900 text-yellow-300 hover:bg-indigo-800 shadow-lg shadow-indigo-500/30" 
                : "bg-amber-50 text-amber-500 hover:bg-amber-100 shadow-lg shadow-amber-200/50"
            )}
            title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
          >
            <div className={clsx(
              "transition-transform duration-300",
              darkMode ? "rotate-0" : "rotate-180"
            )}>
              {darkMode ? <Moon size={18} /> : <Sun size={18} />}
            </div>
          </button>
          <div className={clsx(
            "text-2xl font-semibold flex items-center gap-2 h-10",
            darkMode ? "text-gray-100" : "text-gray-900"
          )}>
            <span>lowvr</span>
            <img 
              src="/lowvr-2d.png" 
              alt="lowvr logo" 
              className="w-10 h-10 object-contain translate-y-[2px]"
            />
          </div>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside 
          className={clsx(
            'flex flex-col transition-all duration-200 flex-shrink-0 relative rounded-2xl shadow-sm m-4',
            darkMode ? 'bg-gray-800' : 'bg-[#fffdf8]'
          )}
          style={{ width: sidebarWidth }}
        >
          <>
              <button
                className={clsx(
                  'w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors',
                  darkMode
                    ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                )}
                onClick={() => setShowConfigFilter(!showConfigFilter)}
              >
                <span className="font-medium">Configs</span>
                <span className="text-xs">{showConfigFilter ? '▲' : '▼'}</span>
              </button>
              {/* Config Filter Panel */}
              {showConfigFilter && (
                <div className="max-h-56 overflow-y-auto flex-shrink-0">
                  <ConfigFilter darkMode={darkMode} />
                </div>
              )}
              
              <div className="flex-1 overflow-y-auto">
                <RunSelector runs={runs || []} isLoading={isLoading} darkMode={darkMode} />
              </div>
              
              {selectedRunIds.length > 0 && (
                <div className="flex-shrink-0">
                  {/* Draggable divider between Runs and Metrics */}
                  <div className="pt-2">
                    <button
                      onClick={() => setShowMetrics(!showMetrics)}
                      className={clsx(
                        'w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer',
                        darkMode
                          ? 'text-gray-300 hover:text-gray-100 hover:bg-gray-700'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-white'
                      )}
                    >
                      <span className="font-medium">Metrics</span>
                      <span className="text-xs">{showMetrics ? '▲' : '▼'}</span>
                    </button>
                  </div>
                  {showMetrics && (
                    <div style={{ height: metricsHeight }} className="overflow-y-auto">
                      <MetricSelector runIds={selectedRunIds} darkMode={darkMode} />
                    </div>
                  )}
                </div>
              )}
          </>

          {/* Resize handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-amber-400 transition-colors group flex items-center justify-center"
            onMouseDown={startResizing}
          >
            <div className={clsx(
              'absolute right-0 w-4 h-12 flex items-center justify-center rounded-r bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity',
              isResizing && 'opacity-100 bg-amber-400'
            )}>
              <GripVertical size={12} className="text-gray-500" />
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className={clsx(
          "flex-1 overflow-hidden flex flex-col transition-colors",
          darkMode ? "bg-gray-900" : "bg-[#f7f2ea]"
        )}>
          {showRunSets && (
            <div className={clsx(
              "border-b",
              darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"
            )}>
              <RunSetsPanel runs={runs || []} darkMode={darkMode} />
            </div>
          )}

          {selectedRunIds.length === 0 ? (
            <div className={clsx(
              "flex-1 flex items-center justify-center",
              darkMode ? "text-gray-500" : "text-gray-400"
            )}>
              <div className="text-center">
                <BarChart3 size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg">Select runs to compare</p>
                <p className="text-sm mt-1">Click on runs in the sidebar to add them to comparison</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              {(viewMode === 'charts' || viewMode === 'both') && (
                <div className={viewMode === 'both' ? 'mb-8' : ''}>
                  <ComparisonCharts runIds={selectedRunIds} darkMode={darkMode} />
                </div>
              )}
              
              {(viewMode === 'videos' || viewMode === 'both') && (
                <VideoGallery runIds={selectedRunIds} darkMode={darkMode} />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Resize overlay */}
      {isResizing && (
        <div className="fixed inset-0 cursor-col-resize z-50" />
      )}
    </div>
  )
}
