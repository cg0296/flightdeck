'use client'

import { useState } from 'react'
import { useFocusTrap } from '@/lib/use-focus-trap'
import { Button } from '@/components/ui/button'

interface LaunchAgentModalProps {
  open: boolean
  onClose: () => void
  onLaunched?: (result: any) => void
}

const REPO_OPTIONS = [
  { label: 'golteris-platform', value: 'C:\\Users\\Curt\\Documents\\GTS\\SAZERAC\\golteris-platform' },
  { label: 'cts-edw', value: 'C:\\Users\\Curt\\Desktop\\CTS Apps\\cts-edw' },
  { label: 'flightdeck', value: 'C:\\Users\\Curt\\Documents\\GTS\\flightdeck' },
  { label: 'Custom path...', value: '__custom__' },
]

const MODEL_OPTIONS = [
  { label: 'Sonnet', value: 'sonnet' },
  { label: 'Opus', value: 'opus' },
  { label: 'Haiku', value: 'haiku' },
]

export function LaunchAgentModal({ open, onClose, onLaunched }: LaunchAgentModalProps) {
  const [selectedRepo, setSelectedRepo] = useState(REPO_OPTIONS[0].value)
  const [customPath, setCustomPath] = useState('')
  const [task, setTask] = useState('')
  const [useBuildPrompt, setUseBuildPrompt] = useState(false)
  const [model, setModel] = useState('sonnet')
  const [skipPermissions, setSkipPermissions] = useState(true)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dialogRef = useFocusTrap(onClose)

  if (!open) return null

  const cwd = selectedRepo === '__custom__' ? customPath : selectedRepo
  const label = REPO_OPTIONS.find(r => r.value === selectedRepo)?.label || 'agent'

  const handleLaunch = async () => {
    if (!task.trim() && !useBuildPrompt) return
    if (!cwd.trim()) return

    setLaunching(true)
    setError(null)

    try {
      const response = await fetch('/api/spawn/local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: task.trim(),
          cwd,
          model,
          label: selectedRepo === '__custom__' ? customPath.split(/[\\/]/).pop() || 'custom' : label,
          dangerouslySkipPermissions: skipPermissions,
          ...(useBuildPrompt ? { useBuildPrompt: true } : {}),
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to launch agent')

      onLaunched?.(data)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch agent')
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-agent-title"
        className="bg-card border border-border rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 id="launch-agent-title" className="text-xl font-bold text-foreground">Launch Agent</h3>
            <Button variant="ghost" size="icon-sm" onClick={onClose} className="text-xl">&times;</Button>
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
              {error}
            </div>
          )}

          {/* Repo / Working Directory */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Repo / Working Directory</label>
            <select
              value={selectedRepo}
              onChange={(e) => setSelectedRepo(e.target.value)}
              className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm"
            >
              {REPO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {selectedRepo === '__custom__' && (
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="Enter full path to working directory"
                className="w-full mt-2 bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm"
                autoFocus
              />
            )}
          </div>

          {/* Task / Prompt */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Task / Prompt</label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="What should the agent do?"
              rows={4}
              className="w-full bg-surface-1 text-foreground border border-border rounded-md px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* Use build prompt toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <button
              type="button"
              onClick={() => setUseBuildPrompt(!useBuildPrompt)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                useBuildPrompt ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                useBuildPrompt ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
            <span className="text-sm text-foreground">Use build prompt file</span>
          </label>
          {useBuildPrompt && (
            <p className="text-xs text-muted-foreground -mt-3 ml-11">
              Will read build-prompt*.txt from selected repo
            </p>
          )}

          {/* Model selector */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Model</label>
            <div className="flex gap-2">
              {MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setModel(opt.value)}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    model === opt.value
                      ? 'bg-primary/20 text-primary border-primary/40'
                      : 'bg-surface-1 text-muted-foreground border-border hover:border-primary/30'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Skip permissions toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={skipPermissions}
              onChange={(e) => setSkipPermissions(e.target.checked)}
              className="h-4 w-4 rounded border-border bg-surface-1 text-primary accent-primary"
            />
            <span className="text-sm text-foreground">Skip Permissions</span>
          </label>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="md" onClick={onClose} disabled={launching}>
              Cancel
            </Button>
            <Button
              size="md"
              onClick={handleLaunch}
              disabled={launching || (!task.trim() && !useBuildPrompt) || !cwd.trim()}
            >
              {launching ? 'Launching...' : 'Launch'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
