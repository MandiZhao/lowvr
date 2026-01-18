import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface RunSet {
  id: string
  name: string
  runIds: string[]
  color: string
}

interface AppState {
  // Selected runs for comparison
  selectedRunIds: string[]
  toggleRunSelection: (runId: string) => void
  clearSelection: () => void
  selectRuns: (runIds: string[]) => void

  // Run sets for grouping
  runSets: RunSet[]
  addRunSet: (name: string, runIds: string[]) => void
  updateRunSet: (id: string, updates: Partial<RunSet>) => void
  deleteRunSet: (id: string) => void

  // Active metrics to display
  activeMetrics: string[]
  setActiveMetrics: (metrics: string[]) => void
  toggleMetric: (metric: string) => void

  // Config filters
  configFilters: Record<string, string>
  setConfigFilter: (key: string, value: string | undefined) => void
  clearConfigFilters: () => void

  // Config columns to display
  configDisplayKeys: string[]
  addConfigDisplayKey: (key: string) => void
  removeConfigDisplayKey: (key: string) => void
  clearConfigDisplayKeys: () => void

  // UI state
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  
  // View mode
  viewMode: 'charts' | 'videos' | 'both'
  setViewMode: (mode: 'charts' | 'videos' | 'both') => void
  
  // Hovered run for highlighting in charts
  hoveredRunId: string | null
  setHoveredRunId: (runId: string | null) => void
  
  // Dark mode
  darkMode: boolean
  toggleDarkMode: () => void

  // Run colors (fixed per run ID)
  runColors: Record<string, string>
  setRunColor: (runId: string, color: string) => void
}

// Export COLORS - WandB-style elegant palette
export const RUN_COLORS = [
  '#E91E63', // pink
  '#9C27B0', // purple
  '#673AB7', // deep purple
  '#3F51B5', // indigo
  '#2196F3', // blue
  '#00BCD4', // cyan
  '#009688', // teal
  '#4CAF50', // green
  '#8BC34A', // light green
  '#CDDC39', // lime
  '#FFEB3B', // yellow
  '#FFC107', // amber
  '#FF9800', // orange
  '#FF5722', // deep orange
  '#795548', // brown
  '#9E9E9E', // grey
  '#607D8B', // blue grey
]

// Helper to generate a deterministic color for a run based on its ID
// This ensures each run gets a consistent color
export function generateColorForRun(runId: string): string {
  // Simple hash function to get consistent color from run ID
  let hash = 0
  for (let i = 0; i < runId.length; i++) {
    hash = runId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return RUN_COLORS[Math.abs(hash) % RUN_COLORS.length]
}

// Helper to get color for a run (checks stored color first, then generates)
export function getRunColor(runId: string, runColors: Record<string, string>): string {
  return runColors[runId] || generateColorForRun(runId)
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedRunIds: [],
      toggleRunSelection: (runId) =>
        set((state) => ({
          selectedRunIds: state.selectedRunIds.includes(runId)
            ? state.selectedRunIds.filter((id) => id !== runId)
            : [...state.selectedRunIds, runId],
        })),
      clearSelection: () => set({ selectedRunIds: [] }),
      selectRuns: (runIds) => set({ selectedRunIds: runIds }),

      runSets: [],
      addRunSet: (name, runIds) =>
        set((state) => ({
          runSets: [
            ...state.runSets,
            {
              id: crypto.randomUUID(),
              name,
              runIds,
              color: RUN_COLORS[state.runSets.length % RUN_COLORS.length],
            },
          ],
        })),
      updateRunSet: (id, updates) =>
        set((state) => ({
          runSets: state.runSets.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),
      deleteRunSet: (id) =>
        set((state) => ({
          runSets: state.runSets.filter((s) => s.id !== id),
        })),

      activeMetrics: [],
      setActiveMetrics: (metrics) => set({ activeMetrics: metrics }),
      toggleMetric: (metric) =>
        set((state) => ({
          activeMetrics: state.activeMetrics.includes(metric)
            ? state.activeMetrics.filter((m) => m !== metric)
            : [...state.activeMetrics, metric],
        })),

      configFilters: {},
      setConfigFilter: (key, value) =>
        set((state) => {
          const newFilters = { ...state.configFilters }
          if (value === undefined || value === '') {
            delete newFilters[key]
          } else {
            newFilters[key] = value
          }
          return { configFilters: newFilters }
        }),
      clearConfigFilters: () => set({ configFilters: {} }),

      configDisplayKeys: [],
      addConfigDisplayKey: (key) =>
        set((state) => ({
          configDisplayKeys: state.configDisplayKeys.includes(key)
            ? state.configDisplayKeys
            : [...state.configDisplayKeys, key],
        })),
      removeConfigDisplayKey: (key) =>
        set((state) => ({
          configDisplayKeys: state.configDisplayKeys.filter((k) => k !== key),
        })),
      clearConfigDisplayKeys: () => set({ configDisplayKeys: [] }),

      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      viewMode: 'both',
      setViewMode: (mode) => set({ viewMode: mode }),
      
      hoveredRunId: null,
      setHoveredRunId: (runId) => set({ hoveredRunId: runId }),
      
      darkMode: false,
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),

      runColors: {},
      setRunColor: (runId, color) =>
        set((state) => ({
          runColors: { ...state.runColors, [runId]: color },
        })),
    }),
    {
      name: 'lowvr-storage',
      partialize: (state) => ({
        runSets: state.runSets,
        activeMetrics: state.activeMetrics,
        sidebarCollapsed: state.sidebarCollapsed,
        viewMode: state.viewMode,
        darkMode: state.darkMode,
        runColors: state.runColors,
      }),
    }
  )
)
