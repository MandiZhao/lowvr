import { useMemo, useRef, useState } from 'react'
import { useMultiRunMetrics, useRuns } from '../hooks/useRuns'
import { useAppStore, getRunColor } from '../stores/appStore'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Minus, Plus, Move, Settings, X } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  runIds: string[]
  darkMode?: boolean
}

interface RowSize {
  height: number
  widths: number[]
  singleWidth?: number
}

interface YLimits {
  min: number | 'auto'
  max: number | 'auto'
  logScale: boolean
}

export default function ComparisonCharts({ runIds, darkMode = false }: Props) {
  const { activeMetrics, hoveredRunId, runColors, toggleMetric } = useAppStore()
  const { data: runs } = useRuns()
  const { data: metricsData, isLoading } = useMultiRunMetrics(runIds, activeMetrics.length > 0 ? activeMetrics : undefined)
  const lastMetricsDataRef = useRef<Map<string, Record<string, (number | null)[]>> | null>(null)
  if (metricsData && metricsData.size > 0) {
    lastMetricsDataRef.current = metricsData
  }
  const stableMetricsData = (metricsData && metricsData.size > 0)
    ? metricsData
    : lastMetricsDataRef.current
  
  // Global chart size controls
  const [defaultHeight, setDefaultHeight] = useState(256)
  const [columns, setColumns] = useState(5)
  
  // Per-row size overrides (height and width weights)
  const [rowSizes, setRowSizes] = useState<Record<string, RowSize>>({})
  const [chartWidths, setChartWidths] = useState<Record<string, number>>({})
  const chartWidthObservers = useRef(new Map<string, ResizeObserver>())
  
  // Per-chart Y-axis limits
  const [chartYLimits, setChartYLimits] = useState<Record<string, YLimits>>({})
  
  // Which chart is expanded (modal view with settings)
  const [expandedChart, setExpandedChart] = useState<string | null>(null)
  
  // X-axis selection
  const [xAxisKey, setXAxisKey] = useState('_step')

  const normalizeRowSize = (size: RowSize | undefined, count: number): RowSize => {
    const widths = size?.widths && size.widths.length === count
      ? size.widths
      : Array(count).fill(1)
    return { height: size?.height ?? defaultHeight, widths, singleWidth: size?.singleWidth }
  }

  const registerChartWidth = (metric: string) => (el: HTMLDivElement | null) => {
    const observers = chartWidthObservers.current
    const existing = observers.get(metric)
    if (existing) {
      existing.disconnect()
      observers.delete(metric)
    }
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const width = entry.contentRect.width
      setChartWidths((prev) => (prev[metric] === width ? prev : { ...prev, [metric]: width }))
    })
    observer.observe(el)
    observers.set(metric, observer)
  }
  
  // Get Y limits for a chart
  const getYLimits = (metric: string): YLimits =>
    chartYLimits[metric] ?? { min: 'auto', max: 'auto', logScale: false }
  
  // Set Y limits for a chart
  const setYLimits = (metric: string, limits: Partial<YLimits>) => {
    setChartYLimits(prev => ({
      ...prev,
      [metric]: { ...getYLimits(metric), ...limits }
    }))
  }

  // Get display names for runs - both full and truncated
  const { runNamesFull } = useMemo(() => {
    const full: Record<string, string> = {}
    runs?.forEach(run => {
      const name = run.display_name || run.id
      full[run.id] = name
    })
    return { runNamesFull: full }
  }, [runs])

  // Get available x-axis options from the data
  const xAxisOptions = useMemo(() => {
    if (!stableMetricsData || stableMetricsData.size === 0) return ['_step']
    
    const options = new Set<string>(['_step'])
    
    const firstRunData = stableMetricsData.values().next().value
    if (firstRunData) {
      Object.keys(firstRunData).forEach(key => {
        if (key.includes('step') || key.includes('iter') || key.includes('epoch') || key.includes('time')) {
          options.add(key)
        }
      })
      if (firstRunData['info/epochs']) {
        options.add('info/epochs')
      }
      if (firstRunData['iter']) {
        options.add('iter')
      }
    }
    
    return Array.from(options).sort()
  }, [stableMetricsData])

  // Transform data for each metric chart
  const chartDataByMetric = useMemo(() => {
    if (!stableMetricsData) return {}

    const result: Record<string, { xValue: number; [key: string]: number | null }[]> = {}

    for (const metric of activeMetrics) {
      if (metric === xAxisKey) continue
      
      let maxLen = 0
      runIds.forEach(runId => {
        const data = stableMetricsData.get(runId)
        if (data?.[metric]) {
          maxLen = Math.max(maxLen, data[metric].length)
        }
      })

      const chartData: { xValue: number; [key: string]: number | null }[] = []
      for (let i = 0; i < maxLen; i++) {
        let xValue = i
        const firstRunWithX = runIds.find(runId => {
          const data = stableMetricsData.get(runId)
          return data?.[xAxisKey]?.[i] !== undefined
        })
        if (firstRunWithX) {
          const data = stableMetricsData.get(firstRunWithX)
          xValue = data?.[xAxisKey]?.[i] ?? i
        }
        
        const point: { xValue: number; [key: string]: number | null } = { xValue }
        runIds.forEach(runId => {
          const data = stableMetricsData.get(runId)
          point[runId] = data?.[metric]?.[i] ?? null
        })
        chartData.push(point)
      }

      result[metric] = chartData
    }

    return result
  }, [stableMetricsData, runIds, activeMetrics, xAxisKey])

  // Compute data range for each metric
  const dataRanges = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {}
    
    for (const [metric, data] of Object.entries(chartDataByMetric)) {
      let min = Infinity
      let max = -Infinity
      
      for (const point of data) {
        for (const [key, value] of Object.entries(point)) {
          if (key !== 'xValue' && typeof value === 'number') {
            min = Math.min(min, value)
            max = Math.max(max, value)
          }
        }
      }
      
      if (min !== Infinity && max !== -Infinity) {
        ranges[metric] = { min, max }
      }
    }
    
    return ranges
  }, [chartDataByMetric])

  if (activeMetrics.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        <p>Select metrics from the sidebar to display charts</p>
      </div>
    )
  }

  if (isLoading && (!stableMetricsData || stableMetricsData.size === 0)) {
    return (
      <div className="text-center text-gray-400 py-8">
        <div className="animate-pulse">Loading metrics data...</div>
      </div>
    )
  }

  const xAxisLabel = xAxisKey === '_step' ? 'step' : xAxisKey.split('/').pop() || xAxisKey

  const formatTooltipValue = (value: unknown) => {
    if (value === null || value === undefined) return 'N/A'
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return String(value)
      const abs = Math.abs(value)
      if (abs > 0 && abs < 1e-4) return value.toExponential(2)
      return value.toFixed(4)
    }
    const numeric = Number(value)
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      const abs = Math.abs(numeric)
      if (abs > 0 && abs < 1e-4) return numeric.toExponential(2)
      return numeric.toFixed(4)
    }
    return String(value)
  }

  const formatAxisTick = (value: unknown, smallPrecision: number, normalPrecision: number): string => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return String(value)
    const abs = Math.abs(value)
    if (abs > 0 && abs < 1e-4) return value.toExponential(1)
    if (abs < 1) return value.toFixed(smallPrecision)
    return value.toFixed(normalPrecision)
  }

  const getLegendLabel = (metric: string, runId: string, index: number) => {
    const fullName = runNamesFull[runId] || `Run ${index + 1}`
    const width = chartWidths[metric]
    const maxChars = width ? Math.max(8, Math.min(40, Math.floor(width / 9))) : 30
    const displayName = fullName.length > maxChars
      ? fullName.slice(0, Math.max(0, maxChars - 3)) + '...'
      : fullName
    return { fullName, displayName }
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null
    
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-xs">
        <p className="text-gray-500 mb-2">{xAxisLabel}: {label}</p>
        {payload.map((entry: any, index: number) => {
          const displayName = runNamesFull[entry.dataKey] || `Run ${index + 1}`
          return (
            <div key={index} className="flex items-center gap-2 py-0.5">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-700 flex-1" title={displayName}>
                {displayName.length > 40 ? displayName.slice(0, 37) + '...' : displayName}
              </span>
              <span className="font-mono text-gray-900">
                {formatTooltipValue(entry.value)}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  const visibleMetrics = activeMetrics.filter((metric) => {
    if (metric === xAxisKey) return false
    if (metric === expandedChart) return false
    const data = chartDataByMetric[metric]
    return data && data.length > 0
  })

  const rowGapPx = 16
  const defaultColumnWidth = columns > 0
    ? `calc((100% - ${(columns - 1) * rowGapPx}px) / ${columns})`
    : '100%'

  const rows: string[][] = []
  for (let i = 0; i < visibleMetrics.length; i += columns) {
    rows.push(visibleMetrics.slice(i, i + columns))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className={clsx(
          "text-lg font-semibold flex items-center gap-2",
          darkMode ? "text-gray-100" : "text-gray-900"
        )}>
          Charts
          <span className={clsx(
            "text-sm font-normal",
            darkMode ? "text-gray-400" : "text-gray-500"
          )}>
            {runIds.length} runs · {activeMetrics.length} metrics
          </span>
        </h2>

        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={clsx("text-xs", darkMode ? "text-gray-400" : "text-gray-500")}>X-axis:</span>
            <select
              value={xAxisKey}
              onChange={(e) => setXAxisKey(e.target.value)}
              className={clsx(
                "border rounded px-2 py-1 text-xs focus:outline-none focus:border-amber-500",
                darkMode 
                  ? "bg-gray-700 border-gray-600 text-gray-200" 
                  : "bg-white border-gray-200 text-gray-700"
              )}
            >
              {xAxisOptions.map((key) => (
                <option key={key} value={key}>
                  {key === '_step' ? 'step' : key}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Default H:</span>
            <button
              onClick={() => setDefaultHeight(Math.max(150, defaultHeight - 50))}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <Minus size={16} />
            </button>
            <input
              type="range"
              min="150"
              max="500"
              step="50"
              value={defaultHeight}
              onChange={(e) => setDefaultHeight(Number(e.target.value))}
              className="w-16"
            />
            <button
              onClick={() => setDefaultHeight(Math.min(500, defaultHeight + 50))}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <Plus size={16} />
            </button>
            <span className="text-xs text-gray-400 w-10">{defaultHeight}px</span>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 mr-1">Cols:</span>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setColumns(n)}
                className={`w-6 h-6 rounded text-xs transition-colors ${
                  columns === n
                    ? 'bg-amber-100 text-amber-700'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Expanded chart - inline full-width view (appears before grid) */}
      {expandedChart && chartDataByMetric[expandedChart] && (() => {
        const metric = expandedChart
        const data = chartDataByMetric[metric]
        const yLimits = getYLimits(metric)
        const dataRange = dataRanges[metric]
        
        const yDomain: [number | 'auto', number | 'auto'] = [
          yLimits.min === 'auto' ? 'auto' : yLimits.min,
          yLimits.max === 'auto' ? 'auto' : yLimits.max
        ]

        return (
          <div
            className={clsx(
              "border-2 rounded-xl shadow-lg w-full mb-4",
              darkMode ? "bg-gray-900 border-amber-500/60" : "bg-white border-amber-400"
            )}
          >
            {/* Header */}
            <div className={clsx(
              "flex items-center justify-between p-4 border-b rounded-t-xl",
              darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-amber-50"
            )}>
              <h3 className={clsx("text-lg font-semibold", darkMode ? "text-gray-100" : "text-gray-900")} title={metric}>
                {metric}
              </h3>
              <button
                onClick={() => setExpandedChart(null)}
                className={clsx(
                  "p-2 rounded-lg text-gray-400",
                  darkMode ? "hover:text-gray-200 hover:bg-gray-700" : "hover:text-gray-600 hover:bg-amber-100"
                )}
              >
                <X size={20} />
              </button>
            </div>

            {/* Settings panel */}
            <div className={clsx(
              "flex items-center gap-6 px-4 py-3 border-b text-sm",
              darkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"
            )}>
              <div className="flex items-center gap-2">
                <span className={clsx(darkMode ? "text-gray-300" : "text-gray-500")}>Y Min:</span>
                <input
                  type="number"
                  step="any"
                  value={yLimits.min === 'auto' ? '' : yLimits.min}
                  onChange={(e) => setYLimits(metric, { 
                    min: e.target.value === '' ? 'auto' : parseFloat(e.target.value) 
                  })}
                  placeholder={dataRange ? dataRange.min.toFixed(2) : 'auto'}
                  className={clsx(
                    "w-24 border rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-500",
                    darkMode ? "border-gray-600 bg-gray-900 text-gray-200" : "border-gray-200 bg-white text-gray-800"
                  )}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className={clsx(darkMode ? "text-gray-300" : "text-gray-500")}>Y Max:</span>
                <input
                  type="number"
                  step="any"
                  value={yLimits.max === 'auto' ? '' : yLimits.max}
                  onChange={(e) => setYLimits(metric, { 
                    max: e.target.value === '' ? 'auto' : parseFloat(e.target.value) 
                  })}
                  placeholder={dataRange ? dataRange.max.toFixed(2) : 'auto'}
                  className={clsx(
                    "w-24 border rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-500",
                    darkMode ? "border-gray-600 bg-gray-900 text-gray-200" : "border-gray-200 bg-white text-gray-800"
                  )}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={yLimits.logScale}
                  onChange={(e) => setYLimits(metric, { logScale: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                />
                <span className={clsx(darkMode ? "text-gray-300" : "text-gray-600")}>Log scale</span>
              </label>
              <button
                onClick={() => setYLimits(metric, { min: 'auto', max: 'auto', logScale: false })}
                className={clsx(
                  "text-sm ml-auto",
                  darkMode ? "text-gray-400 hover:text-amber-400" : "text-gray-400 hover:text-amber-600"
                )}
              >
                Reset to auto
              </button>
            </div>

            {/* Large chart - explicit height for ResponsiveContainer */}
            <div className="p-4" style={{ height: 500 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#374151" : "#e5e7eb"} />
                  <XAxis
                    dataKey="xValue"
                    stroke="#9ca3af"
                    fontSize={12}
                    tickLine={false}
                    label={{ 
                      value: xAxisLabel, 
                      position: 'insideBottom', 
                      offset: -5,
                      fontSize: 12,
                      fill: '#9ca3af'
                    }}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    fontSize={12}
                    tickLine={false}
                    width={56}
                    domain={yDomain}
                    scale={yLimits.logScale ? 'log' : 'auto'}
                    tickFormatter={(value) => formatAxisTick(value, 4, 2)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px' }}
                    formatter={(value, _entry, index) => {
                      const { fullName, displayName } = getLegendLabel(metric, value, index)
                      return <span title={fullName}>{displayName}</span>
                    }}
                  />
                  {runIds.map((runId) => {
                    const isHovered = hoveredRunId === runId
                    const isDimmed = hoveredRunId !== null && !isHovered
                    return (
                      <Line
                        key={runId}
                        type="monotone"
                        dataKey={runId}
                        name={runId}
                        stroke={getRunColor(runId, runColors)}
                        strokeWidth={isHovered ? 4 : isDimmed ? 1 : 2}
                        strokeOpacity={isDimmed ? 0.3 : 1}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                      />
                    )
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })()}

      <div className="space-y-4">
        {rows.map((row, rowIndex) => {
          const rowKey = row.join('||')
          const rowSize = normalizeRowSize(rowSizes[rowKey], row.length)
          const totalWeight = rowSize.widths.reduce((sum, w) => sum + w, 0)

          return (
            <div key={`${rowKey}-${rowIndex}`} className="flex gap-4 items-start" data-row={rowKey}>
              {row.map((metric, index) => {
                const data = chartDataByMetric[metric]
                if (!data || data.length === 0) return null

                const yLimits = getYLimits(metric)
                const widthWeight = rowSize.widths[index] ?? 1

                // Compute actual Y domain
                const yDomain: [number | 'auto', number | 'auto'] = [
                  yLimits.min === 'auto' ? 'auto' : yLimits.min,
                  yLimits.max === 'auto' ? 'auto' : yLimits.max
                ]

                const singleWidth = row.length === 1
                  ? (rowSize.singleWidth ? `${rowSize.singleWidth}px` : defaultColumnWidth)
                  : undefined

                return (
                  <div
                    key={metric}
                    className={clsx(
                      "rounded-lg p-4 shadow-sm relative group border",
                      darkMode 
                        ? "bg-gray-800 border-gray-700" 
                        : "bg-white border-gray-200"
                    )}
                    style={{
                      flex: row.length === 1 ? `0 0 ${singleWidth}` : `${widthWeight} 1 0`,
                      maxWidth: row.length === 1 ? singleWidth : undefined,
                      minWidth: 0,
                    }}
                    data-panel
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className={clsx(
                        "text-sm font-medium truncate flex-1",
                        darkMode ? "text-gray-200" : "text-gray-700"
                      )} title={metric}>
                        {metric}
                      </h3>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => toggleMetric(metric)}
                          className={clsx(
                            "p-1 rounded transition-colors",
                            darkMode
                              ? "text-gray-500 hover:text-red-300 hover:bg-gray-700"
                              : "text-gray-400 hover:text-red-500 hover:bg-gray-100"
                          )}
                          title="Remove metric"
                          aria-label={`Remove ${metric}`}
                        >
                          <X size={12} />
                        </button>
                        <button
                          onClick={() => setExpandedChart(metric)}
                          className={clsx(
                            "p-1 rounded transition-colors",
                            darkMode 
                              ? "text-gray-500 hover:text-gray-300 hover:bg-gray-700" 
                              : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                          )}
                          title="Expand & settings"
                        >
                          <Settings size={14} />
                        </button>
                      </div>
                    </div>

                    <div ref={registerChartWidth(metric)} style={{ height: rowSize.height }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data}>
                          <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? "#374151" : "#e5e7eb"} />
                          <XAxis
                            dataKey="xValue"
                            stroke="#9ca3af"
                            fontSize={11}
                            tickLine={false}
                            label={{ 
                              value: xAxisLabel, 
                              position: 'insideBottom', 
                              offset: -5,
                              fontSize: 10,
                              fill: '#9ca3af'
                            }}
                          />
                          <YAxis
                            stroke="#9ca3af"
                            fontSize={11}
                            tickLine={false}
                            width={48}
                            domain={yDomain}
                            scale={yLimits.logScale ? 'log' : 'auto'}
                            tickFormatter={(value) => formatAxisTick(value, 3, 1)}
                          />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend
                            wrapperStyle={{ fontSize: '10px' }}
                            formatter={(value, _entry, index) => {
                              const { fullName, displayName } = getLegendLabel(metric, value, index)
                              return (
                                <span title={fullName}>
                                  {displayName}
                                </span>
                              )
                            }}
                          />
                          {runIds.map((runId) => {
                            const isHovered = hoveredRunId === runId
                            const isDimmed = hoveredRunId !== null && !isHovered
                            return (
                              <Line
                                key={runId}
                                type="monotone"
                                dataKey={runId}
                                name={runId}
                                stroke={getRunColor(runId, runColors)}
                                strokeWidth={isHovered ? 3 : isDimmed ? 0.75 : 1.5}
                                strokeOpacity={isDimmed ? 0.3 : 1}
                                dot={false}
                                connectNulls
                                isAnimationActive={false}
                              />
                            )
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Per-row resize handle - supports both dimensions */}
                    <div
                      className="absolute bottom-1 right-1 p-1 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-amber-500 bg-white/80 rounded"
                      title="Drag to resize row (height & widths)"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        const startX = e.clientX
                        const startY = e.clientY
                        const startHeight = rowSize.height
                        const startWidths = rowSize.widths.slice()
                        const rowElement = e.currentTarget.closest('[data-row]') as HTMLElement | null
                        const panelElement = e.currentTarget.closest('[data-panel]') as HTMLElement | null
                        const rowWidth = rowElement?.getBoundingClientRect().width || 1
                        const startPanelWidth = panelElement?.getBoundingClientRect().width || 0
                        const minWeight = 0.5
                        const maxWeight = totalWeight - minWeight * (row.length - 1)
                        const minPanelWidth = 220
                        const maxPanelWidth = rowWidth
                        
                        const onMouseMove = (moveEvent: MouseEvent) => {
                          const deltaY = moveEvent.clientY - startY
                          const deltaX = moveEvent.clientX - startX
                          
                          const newHeight = Math.max(120, Math.min(600, startHeight + deltaY))
                          if (row.length === 1) {
                            const nextWidth = Math.max(
                              minPanelWidth,
                              Math.min(maxPanelWidth, startPanelWidth + deltaX)
                            )
                            setRowSizes((prev) => ({
                              ...prev,
                              [rowKey]: { height: newHeight, widths: startWidths, singleWidth: nextWidth },
                            }))
                          } else {
                            const deltaWeight = (deltaX / rowWidth) * totalWeight
                            const nextWeight = Math.min(
                              Math.max(startWidths[index] + deltaWeight, minWeight),
                              maxWeight
                            )

                            const remainingStart = totalWeight - startWidths[index]
                            const remainingNext = totalWeight - nextWeight
                            let nextWidths = startWidths.slice()
                            if (remainingStart <= 0) {
                              const even = remainingNext / (row.length - 1)
                              nextWidths = nextWidths.map((_, i) => (i === index ? nextWeight : even))
                            } else {
                              nextWidths = nextWidths.map((w, i) => {
                                if (i === index) return nextWeight
                                return (w / remainingStart) * remainingNext
                              })
                            }
                            
                            setRowSizes((prev) => ({
                              ...prev,
                              [rowKey]: { height: newHeight, widths: nextWidths },
                            }))
                          }
                        }
                        
                        const onMouseUp = () => {
                          window.removeEventListener('mousemove', onMouseMove)
                          window.removeEventListener('mouseup', onMouseUp)
                        }
                        
                        window.addEventListener('mousemove', onMouseMove)
                        window.addEventListener('mouseup', onMouseUp)
                      }}
                    >
                      <Move size={14} />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
