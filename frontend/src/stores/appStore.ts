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
}

// Export COLORS so other components can use the same palette
export const RUN_COLORS = [
  '#f59e0b', // amber
  '#3b82f6', // blue
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#6366f1', // indigo
]

// Helper to get color for a run based on its index in selectedRunIds
export const getRunColor = (runId: string, selectedRunIds: string[]): string => {
  const idx = selectedRunIds.indexOf(runId)
  return idx >= 0 ? RUN_COLORS[idx % RUN_COLORS.length] : '#9ca3af'
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
    }),
    {
      name: 'lowvr-storage',
      partialize: (state) => ({
        runSets: state.runSets,
        activeMetrics: state.activeMetrics,
        sidebarCollapsed: state.sidebarCollapsed,
        viewMode: state.viewMode,
        darkMode: state.darkMode,
      }),
    }
  )
)
