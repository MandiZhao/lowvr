import { useState } from 'react'
import { Run } from '../hooks/useRuns'
import { useAppStore, RunSet } from '../stores/appStore'
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react'

interface Props {
  runs: Run[]
  darkMode?: boolean
}

export default function RunSetsPanel({ runs, darkMode: _darkMode = false }: Props) {
  const { 
    runSets, 
    addRunSet, 
    updateRunSet, 
    deleteRunSet,
    selectedRunIds,
    selectRuns 
  } = useAppStore()
  
  const [newSetName, setNewSetName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleCreateSet = () => {
    if (newSetName.trim() && selectedRunIds.length > 0) {
      addRunSet(newSetName.trim(), selectedRunIds)
      setNewSetName('')
    }
  }

  const handleStartEdit = (set: RunSet) => {
    setEditingId(set.id)
    setEditName(set.name)
  }

  const handleSaveEdit = (id: string) => {
    if (editName.trim()) {
      updateRunSet(id, { name: editName.trim() })
    }
    setEditingId(null)
  }

  const handleLoadSet = (set: RunSet) => {
    selectRuns(set.runIds)
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700">Run Sets</h3>
        
        {/* Create new set */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newSetName}
            onChange={(e) => setNewSetName(e.target.value)}
            placeholder="New set name..."
            className="bg-white border border-gray-200 rounded px-2 py-1 text-sm text-gray-900 placeholder-gray-400 w-40 focus:outline-none focus:border-amber-500"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateSet()}
          />
          <button
            onClick={handleCreateSet}
            disabled={!newSetName.trim() || selectedRunIds.length === 0}
            className="p-1.5 rounded bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title={selectedRunIds.length === 0 ? 'Select runs first' : 'Create set from selected runs'}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {runSets.length === 0 ? (
        <p className="text-sm text-gray-500">
          No run sets yet. Select runs and create a set to save them for later.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {runSets.map((set) => {
            const isEditing = editingId === set.id
            const validRuns = set.runIds.filter(id => runs.some(r => r.id === id))

            return (
              <div
                key={set.id}
                className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: set.color }}
                />

                {isEditing ? (
                  <>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="bg-transparent border-b border-gray-300 text-sm text-gray-900 w-24 focus:outline-none focus:border-amber-500"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(set.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                    <button
                      onClick={() => handleSaveEdit(set.id)}
                      className="p-1 text-green-500 hover:text-green-600"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleLoadSet(set)}
                      className="text-sm text-gray-700 hover:text-gray-900 transition-colors"
                    >
                      {set.name}
                    </button>
                    <span className="text-xs text-gray-400">
                      ({validRuns.length})
                    </span>
                    <button
                      onClick={() => handleStartEdit(set)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => deleteRunSet(set.id)}
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedRunIds.length > 0 && (
        <p className="text-xs text-gray-500 mt-3">
          {selectedRunIds.length} runs selected — enter a name and click + to save as a set
        </p>
      )}
    </div>
  )
}
