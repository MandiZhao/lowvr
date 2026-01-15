import { useMemo, useState } from 'react'
import { useMultiRunMetrics, useRuns } from '../hooks/useRuns'
import { useAppStore, RUN_COLORS } from '../stores/appStore'
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

// Use shared colors from store
const COLORS = RUN_COLORS

interface ChartSize {
  height: number
  colSpan: number // how many grid columns to span (1 = default)
}

interface YLimits {
  min: number | 'auto'
  max: number | 'auto'
  logScale: boolean
}

export default function ComparisonCharts({ runIds, darkMode = false }: Props) {
  const { activeMetrics, hoveredRunId } = useAppStore()
  const { data: runs } = useRuns()
  const { data: metricsData, isLoading } = useMultiRunMetrics(runIds, activeMetrics.length > 0 ? activeMetrics : undefined)
  
  // Global chart size controls
  const [defaultHeight, setDefaultHeight] = useState(256)
  const [columns, setColumns] = useState(5)
  
  // Per-chart size overrides (height and width)
  const [chartSizes, setChartSizes] = useState<Record<string, ChartSize>>({})
  
  // Per-chart Y-axis limits
  const [chartYLimits, setChartYLimits] = useState<Record<string, YLimits>>({})
  
  // Which chart is expanded (modal view with settings)
  const [expandedChart, setExpandedChart] = useState<string | null>(null)
  
  // X-axis selection
  const [xAxisKey, setXAxisKey] = useState('_step')

  // Get size for a specific chart
  const getChartSize = (metric: string): ChartSize => 
    chartSizes[metric] ?? { height: defaultHeight, colSpan: 1 }
  
  // Set size for a specific chart
  const setChartSize = (metric: string, size: Partial<ChartSize>) => {
    setChartSizes(prev => ({
      ...prev,
      [metric]: { ...getChartSize(metric), ...size }
    }))
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
  const { runNamesShort, runNamesFull } = useMemo(() => {
    const short: Record<string, string> = {}
    const full: Record<string, string> = {}
    runs?.forEach(run => {
      const name = run.display_name || run.id
      full[run.id] = name
      short[run.id] = name.length > 30 ? name.slice(0, 27) + '...' : name
    })
    return { runNamesShort: short, runNamesFull: full }
  }, [runs])

  // Get available x-axis options from the data
  const xAxisOptions = useMemo(() => {
    if (!metricsData || metricsData.size === 0) return ['_step']
    
    const options = new Set<string>(['_step'])
    
    const firstRunData = metricsData.values().next().value
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
  }, [metricsData])

  // Transform data for each metric chart
  const chartDataByMetric = useMemo(() => {
    if (!metricsData) return {}

    const result: Record<string, { xValue: number; [key: string]: number | null }[]> = {}

    for (const metric of activeMetrics) {
      if (metric === xAxisKey) continue
      
      let maxLen = 0
      runIds.forEach(runId => {
        const data = metricsData.get(runId)
        if (data?.[metric]) {
          maxLen = Math.max(maxLen, data[metric].length)
        }
      })

      const chartData: { xValue: number; [key: string]: number | null }[] = []
      for (let i = 0; i < maxLen; i++) {
        let xValue = i
        const firstRunWithX = runIds.find(runId => {
          const data = metricsData.get(runId)
          return data?.[xAxisKey]?.[i] !== undefined
        })
        if (firstRunWithX) {
          const data = metricsData.get(firstRunWithX)
          xValue = data?.[xAxisKey]?.[i] ?? i
        }
        
        const point: { xValue: number; [key: string]: number | null } = { xValue }
        runIds.forEach(runId => {
          const data = metricsData.get(runId)
          point[runId] = data?.[metric]?.[i] ?? null
        })
        chartData.push(point)
      }

      result[metric] = chartData
    }

    return result
  }, [metricsData, runIds, activeMetrics, xAxisKey])

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

  if (isLoading) {
    return (
      <div className="text-center text-gray-400 py-8">
        <div className="animate-pulse">Loading metrics data...</div>
      </div>
    )
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: '1rem',
  }

  const xAxisLabel = xAxisKey === '_step' ? 'step' : xAxisKey.split('/').pop() || xAxisKey

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
                {entry.value !== null ? entry.value.toFixed(4) : 'N/A'}
              </span>
            </div>
          )
        })}
      </div>
    )
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
          <div className="bg-white border-2 border-amber-400 rounded-xl shadow-lg w-full mb-4">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-amber-50 rounded-t-xl">
              <h3 className="text-lg font-semibold text-gray-900" title={metric}>
                {metric}
              </h3>
              <button
                onClick={() => setExpandedChart(null)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-amber-100"
              >
                <X size={20} />
              </button>
            </div>

            {/* Settings panel */}
            <div className="flex items-center gap-6 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Y Min:</span>
                <input
                  type="number"
                  step="any"
                  value={yLimits.min === 'auto' ? '' : yLimits.min}
                  onChange={(e) => setYLimits(metric, { 
                    min: e.target.value === '' ? 'auto' : parseFloat(e.target.value) 
                  })}
                  placeholder={dataRange ? dataRange.min.toFixed(2) : 'auto'}
                  className="w-24 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Y Max:</span>
                <input
                  type="number"
                  step="any"
                  value={yLimits.max === 'auto' ? '' : yLimits.max}
                  onChange={(e) => setYLimits(metric, { 
                    max: e.target.value === '' ? 'auto' : parseFloat(e.target.value) 
                  })}
                  placeholder={dataRange ? dataRange.max.toFixed(2) : 'auto'}
                  className="w-24 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={yLimits.logScale}
                  onChange={(e) => setYLimits(metric, { logScale: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-gray-600">Log scale</span>
              </label>
              <button
                onClick={() => setYLimits(metric, { min: 'auto', max: 'auto', logScale: false })}
                className="text-gray-400 hover:text-amber-600 text-sm ml-auto"
              >
                Reset to auto
              </button>
            </div>

            {/* Large chart - explicit height for ResponsiveContainer */}
            <div className="p-4" style={{ height: 500 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
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
                    width={80}
                    domain={yDomain}
                    scale={yLimits.logScale ? 'log' : 'auto'}
                    tickFormatter={(value) => 
                      typeof value === 'number' 
                        ? value.toFixed(value < 1 ? 4 : 2) 
                        : value
                    }
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px' }}
                    formatter={(value, _entry, index) => {
                      const fullName = runNamesFull[value] || `Run ${index + 1}`
                      return <span title={fullName}>{fullName}</span>
                    }}
                  />
                  {runIds.map((runId, idx) => {
                    const isHovered = hoveredRunId === runId
                    const isDimmed = hoveredRunId !== null && !isHovered
                    return (
                      <Line
                        key={runId}
                        type="monotone"
                        dataKey={runId}
                        name={runId}
                        stroke={COLORS[idx % COLORS.length]}
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

      <div style={gridStyle}>
        {activeMetrics.map((metric) => {
          if (metric === xAxisKey) return null
          // Hide the chart that is currently expanded
          if (metric === expandedChart) return null
          
          const data = chartDataByMetric[metric]
          if (!data || data.length === 0) return null

          const size = getChartSize(metric)
          const yLimits = getYLimits(metric)
          
          // Compute actual Y domain
          const yDomain: [number | 'auto', number | 'auto'] = [
            yLimits.min === 'auto' ? 'auto' : yLimits.min,
            yLimits.max === 'auto' ? 'auto' : yLimits.max
          ]

          return (
            <div
              key={metric}
              className={clsx(
                "rounded-lg p-4 shadow-sm relative group border",
                darkMode 
                  ? "bg-gray-800 border-gray-700" 
                  : "bg-white border-gray-200"
              )}
              style={{ gridColumn: `span ${Math.min(size.colSpan, columns)}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className={clsx(
                  "text-sm font-medium truncate flex-1",
                  darkMode ? "text-gray-200" : "text-gray-700"
                )} title={metric}>
                  {metric}
                </h3>
                <button
                  onClick={() => setExpandedChart(metric)}
                  className={clsx(
                    "p-1 rounded transition-colors flex-shrink-0",
                    darkMode 
                      ? "text-gray-500 hover:text-gray-300 hover:bg-gray-700" 
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  )}
                  title="Expand & settings"
                >
                  <Settings size={14} />
                </button>
              </div>

              <div style={{ height: size.height }}>
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
                      width={60}
                      domain={yDomain}
                      scale={yLimits.logScale ? 'log' : 'auto'}
                      tickFormatter={(value) => 
                        typeof value === 'number' 
                          ? value.toFixed(value < 1 ? 3 : 1) 
                          : value
                      }
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '10px' }}
                      formatter={(value, _entry, index) => {
                        const fullName = runNamesFull[value] || `Run ${index + 1}`
                        const shortName = runNamesShort[value] || `Run ${index + 1}`
                        return (
                          <span title={fullName}>
                            {shortName}
                          </span>
                        )
                      }}
                    />
                    {runIds.map((runId, idx) => {
                      const isHovered = hoveredRunId === runId
                      const isDimmed = hoveredRunId !== null && !isHovered
                      return (
                        <Line
                          key={runId}
                          type="monotone"
                          dataKey={runId}
                          name={runId}
                          stroke={COLORS[idx % COLORS.length]}
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

              {/* Per-chart resize handle - supports both dimensions */}
              <div
                className="absolute bottom-1 right-1 p-1 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-amber-500 bg-white/80 rounded"
                title="Drag to resize (height & columns)"
                onMouseDown={(e) => {
                  e.preventDefault()
                  const startX = e.clientX
                  const startY = e.clientY
                  const startHeight = size.height
                  const startColSpan = size.colSpan
                  
                  const onMouseMove = (moveEvent: MouseEvent) => {
                    const deltaY = moveEvent.clientY - startY
                    const deltaX = moveEvent.clientX - startX
                    
                    const newHeight = Math.max(100, Math.min(600, startHeight + deltaY))
                    // Change column span based on drag distance (every 100px = 1 column)
                    const colDelta = Math.round(deltaX / 100)
                    const newColSpan = Math.max(1, Math.min(columns, startColSpan + colDelta))
                    
                    setChartSize(metric, { height: newHeight, colSpan: newColSpan })
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
    </div>
  )
}
