import { RUN_COLORS } from '../stores/appStore'
import clsx from 'clsx'

interface Props {
  currentColor: string
  onSelectColor: (color: string) => void
  darkMode?: boolean
}

export default function ColorPicker({ currentColor, onSelectColor, darkMode = false }: Props) {
  return (
    <div 
      className={clsx(
        "absolute z-50 p-2 rounded-lg shadow-xl border backdrop-blur-sm",
        darkMode ? "bg-gray-800/95 border-gray-600" : "bg-white/95 border-gray-300"
      )} 
      style={{ top: '100%', left: 0, marginTop: '4px', minWidth: '150px' }}
      onMouseDown={(e) => e.preventDefault()} // Prevent click from closing
    >
      <div className="grid grid-cols-6 gap-1.5">
        {RUN_COLORS.map((color) => (
          <button
            key={color}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSelectColor(color)
            }}
            className={clsx(
              "w-5 h-5 rounded-md border-2 transition-all hover:scale-110 hover:shadow-md cursor-pointer",
              currentColor === color 
                ? "border-gray-900 ring-1 ring-offset-1 ring-gray-400 shadow-md" 
                : darkMode ? "border-gray-600 hover:border-gray-400" : "border-gray-300 hover:border-gray-500"
            )}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
    </div>
  )
}
