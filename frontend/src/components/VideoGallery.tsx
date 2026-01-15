import { useState, useMemo } from 'react'
import { useRuns, Video } from '../hooks/useRuns'
import { useQuery } from '@tanstack/react-query'
import { Play, Pause, ChevronLeft, ChevronRight, Minus, Plus, Move, ChevronDown, ChevronUp, Maximize2, X } from 'lucide-react'
import clsx from 'clsx'
import { RUN_COLORS } from '../stores/appStore'

interface Props {
  runIds: string[]
  darkMode?: boolean
}

// Use shared colors from store
const COLORS = RUN_COLORS

function VideoCard({ 
  runId, 
  video, 
  color,
  size,
  displayName,
  fullName,
  onResizeStart,
  onExpand,
}: { 
  runId: string
  video: Video
  color: string
  size: number
  displayName: string
  fullName: string
  onResizeStart?: (startSize: number, startX: number) => (deltaX: number) => void
  onExpand?: () => void
}) {
  const [isPlaying, setIsPlaying] = useState(true)
  const mediaUrl = `/api/media/${runId}/${video.relative_path}`

  return (
    <div className="relative group" style={{ width: size }}>
      <div 
        className="absolute inset-0 rounded-lg opacity-10"
        style={{ backgroundColor: color }}
      />
      <div className="relative bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
        <div className="aspect-square relative">
          <img
            src={mediaUrl}
            alt={video.name}
            className={clsx(
              'w-full h-full object-contain bg-gray-50',
              !isPlaying && 'pause-animation'
            )}
            style={{
              animationPlayState: isPlaying ? 'running' : 'paused',
            }}
          />
          
          {/* Play/Pause overlay */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {isPlaying ? (
              <Pause size={24} className="text-white" />
            ) : (
              <Play size={24} className="text-white" />
            )}
          </button>

          {/* Expand button - top-right corner */}
          {onExpand && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onExpand()
              }}
              className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-white hover:text-amber-300 bg-black/40 hover:bg-black/60"
              title="Expand"
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
        
        <div className="px-2 py-1.5 text-xs bg-gray-50">
          <div className="flex items-center gap-2">
            <div 
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-gray-600 truncate" title={fullName}>{displayName}</span>
          </div>
          {video.epoch !== null && (
            <div className="text-gray-500 mt-0.5">
              Epoch {video.epoch}
            </div>
          )}
        </div>

        {/* Per-video resize handle - bottom-right corner */}
        {onResizeStart && (
          <div
            className="absolute bottom-1 right-1 p-1 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-amber-500 bg-white/80 rounded"
            title="Drag to resize"
            onMouseDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const startX = e.clientX
              const handler = onResizeStart(size, startX)
              
              const onMouseMove = (moveEvent: MouseEvent) => {
                handler(moveEvent.clientX - startX)
              }
              
              const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove)
                window.removeEventListener('mouseup', onMouseUp)
              }
              
              window.addEventListener('mousemove', onMouseMove)
              window.addEventListener('mouseup', onMouseUp)
            }}
          >
            <Move size={12} />
          </div>
        )}
      </div>
    </div>
  )
}

// Custom hook to fetch videos for multiple runs at once
function useMultipleRunVideos(runIds: string[]) {
  return useQuery({
    queryKey: ['all-videos', runIds],
    queryFn: async () => {
      const results: { runId: string; videos: Video[] }[] = []
      
      await Promise.all(
        runIds.map(async (runId) => {
          try {
            const res = await fetch(`/api/runs/${runId}/videos`)
            if (res.ok) {
              const videos = await res.json()
              results.push({ runId, videos })
            } else {
              results.push({ runId, videos: [] })
            }
          } catch {
            results.push({ runId, videos: [] })
          }
        })
      )
      
      // Sort to maintain consistent order
      results.sort((a, b) => runIds.indexOf(a.runId) - runIds.indexOf(b.runId))
      return results
    },
    enabled: runIds.length > 0,
  })
}

interface ExpandedVideoInfo {
  runId: string
  video: Video
  color: string
  fullName: string
}

export default function VideoGallery({ runIds, darkMode: _darkMode = false }: Props) {
  const { data: runs } = useRuns()
  const { data: allVideosData, isLoading } = useMultipleRunVideos(runIds)
  const [currentEpochIdx, setCurrentEpochIdx] = useState(0)
  const [defaultSize, setDefaultSize] = useState(200)
  
  // Per-run video size overrides
  const [videoSizes, setVideoSizes] = useState<Record<string, number>>({})
  
  // Per-run expanded state for "All Epochs" section (collapsed by default)
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set())
  
  // Expanded video modal
  const [expandedVideo, setExpandedVideo] = useState<ExpandedVideoInfo | null>(null)
  
  const toggleRunExpanded = (runId: string) => {
    setExpandedRuns(prev => {
      const next = new Set(prev)
      if (next.has(runId)) {
        next.delete(runId)
      } else {
        next.add(runId)
      }
      return next
    })
  }

  // Get unique epochs across all runs
  const epochs = useMemo(() => {
    if (!allVideosData) return []
    const epochSet = new Set<number>()
    allVideosData.forEach(({ videos }) => {
      videos.forEach(v => {
        if (v.epoch !== null) epochSet.add(v.epoch)
      })
    })
    return Array.from(epochSet).sort((a, b) => a - b)
  }, [allVideosData])

  // Get size for a specific run's video
  const getVideoSize = (runId: string) => videoSizes[runId] ?? defaultSize
  
  // Resize handler for individual videos (returns a function that handles the drag delta)
  const createResizeHandler = (runId: string) => (startSize: number, _startX: number) => (deltaX: number) => {
    const newSize = Math.max(100, Math.min(500, startSize + deltaX))
    setVideoSizes(prev => ({ ...prev, [runId]: newSize }))
  }

  if (isLoading) {
    return (
      <div className="text-center text-gray-400 py-8">
        <div className="animate-pulse">Loading videos...</div>
      </div>
    )
  }

  if (!allVideosData || allVideosData.every(({ videos }) => videos.length === 0)) {
    return (
      <div className="text-center text-gray-400 py-8">
        <p>No videos found for selected runs</p>
      </div>
    )
  }

  const currentEpoch = epochs[currentEpochIdx]

  // Get display names for runs (short and full)
  const getNames = (runId: string) => {
    const run = runs?.find(r => r.id === runId)
    const fullName = run?.display_name || runId
    const displayName = fullName.length > 25 ? fullName.slice(0, 22) + '...' : fullName
    return { displayName, fullName }
  }

  // Get videos for current epoch from each run
  const currentVideos = allVideosData.map(({ runId, videos }, idx) => {
    const video = videos.find(v => v.epoch === currentEpoch)
    const { displayName, fullName } = getNames(runId)
    return { runId, video, color: COLORS[idx % COLORS.length], displayName, fullName }
  }).filter(({ video }) => video !== undefined)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Videos
          <span className="text-sm font-normal text-gray-500 ml-2">
            {runIds.length} runs
          </span>
        </h2>

        <div className="flex items-center gap-4">
          {/* Default size control */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Default:</span>
            <button
              onClick={() => setDefaultSize(Math.max(100, defaultSize - 50))}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title="Smaller"
            >
              <Minus size={16} />
            </button>
            <input
              type="range"
              min="100"
              max="500"
              step="50"
              value={defaultSize}
              onChange={(e) => setDefaultSize(Number(e.target.value))}
              className="w-20"
            />
            <button
              onClick={() => setDefaultSize(Math.min(500, defaultSize + 50))}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title="Larger"
            >
              <Plus size={16} />
            </button>
            <span className="text-xs text-gray-400 w-10">{defaultSize}px</span>
          </div>

          {/* Epoch navigation */}
          {epochs.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentEpochIdx(Math.max(0, currentEpochIdx - 1))}
                disabled={currentEpochIdx === 0}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              
              <select
                value={currentEpoch}
                onChange={(e) => {
                  const idx = epochs.indexOf(Number(e.target.value))
                  if (idx >= 0) setCurrentEpochIdx(idx)
                }}
                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-amber-500"
              >
                {epochs.map((epoch) => (
                  <option key={epoch} value={epoch}>
                    Epoch {epoch}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setCurrentEpochIdx(Math.min(epochs.length - 1, currentEpochIdx + 1))}
                disabled={currentEpochIdx === epochs.length - 1}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={18} />
              </button>

              <span className="text-xs text-gray-400 ml-2">
                {currentEpochIdx + 1} / {epochs.length}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded video - inline full-width view (appears before grid) */}
      {expandedVideo && (
        <div className="bg-white border-2 border-amber-400 rounded-xl shadow-lg w-full mb-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 p-4 border-b border-gray-200 bg-amber-50 rounded-t-xl">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0 mt-1.5"
                style={{ backgroundColor: expandedVideo.color }}
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold text-gray-900 break-words">
                  {expandedVideo.fullName}
                </h3>
                {expandedVideo.video.epoch !== null && (
                  <span className="text-sm text-gray-500">
                    Epoch {expandedVideo.video.epoch}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setExpandedVideo(null)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-amber-100 flex-shrink-0"
            >
              <X size={20} />
            </button>
          </div>

          {/* Large video */}
          <div className="p-4 flex items-center justify-center bg-gray-50">
            <img
              src={`/api/media/${expandedVideo.runId}/${expandedVideo.video.relative_path}`}
              alt={expandedVideo.video.name}
              className="max-w-full max-h-[600px] object-contain"
            />
          </div>

          {/* Footer with video info */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-600 rounded-b-xl">
            <span>{expandedVideo.video.name}</span>
          </div>
        </div>
      )}

      {/* Side by side video comparison */}
      <div className="flex flex-wrap gap-4">
        {currentVideos
          .filter(({ runId, video }) => 
            // Hide the video that is currently expanded
            !(expandedVideo && expandedVideo.runId === runId && expandedVideo.video.path === video!.path)
          )
          .map(({ runId, video, color, displayName, fullName }) => (
          <VideoCard
            key={runId}
            runId={runId}
            video={video!}
            color={color}
            size={getVideoSize(runId)}
            displayName={displayName}
            fullName={fullName}
            onResizeStart={createResizeHandler(runId)}
            onExpand={() => setExpandedVideo({ runId, video: video!, color, fullName })}
          />
        ))}
      </div>

      {/* Timeline view - all epochs for all runs (collapsible per run) */}
      <div className="mt-8">
        <h3 className="text-sm font-medium text-gray-500 mb-4">All Epochs by Run</h3>
        <div className="space-y-2">
          {allVideosData.map(({ runId, videos }, idx) => {
            if (videos.length === 0) return null
            const color = COLORS[idx % COLORS.length]
            const runInfo = runs?.find(r => r.id === runId)
            const isExpanded = expandedRuns.has(runId)
            
            return (
              <div key={runId} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Collapsible header */}
                <button
                  onClick={() => toggleRunExpanded(runId)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                >
                  {isExpanded ? (
                    <ChevronUp size={16} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={16} className="text-gray-400" />
                  )}
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-sm text-gray-700 truncate flex-1" title={runInfo?.display_name}>
                    {runInfo?.display_name || runId}
                  </span>
                  <span className="text-xs text-gray-400">
                    {videos.length} videos
                  </span>
                </button>
                
                {/* Collapsible content */}
                {isExpanded && (
                  <div className="p-3 bg-white">
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {videos.map((video) => {
                        const { displayName, fullName } = getNames(runId)
                        return (
                          <VideoCard
                            key={video.path}
                            runId={runId}
                            video={video}
                            color={color}
                            size={120}
                            displayName={displayName}
                            fullName={fullName}
                          />
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
