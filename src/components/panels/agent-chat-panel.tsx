'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'

interface AgentChatPanelProps {
  spawnId: string
  onClose?: () => void
}

export function AgentChatPanel({ spawnId, onClose }: AgentChatPanelProps) {
  const [lines, setLines] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource(`/api/sessions/${encodeURIComponent(spawnId)}/stream`)
    eventSourceRef.current = es

    es.onopen = () => {
      setConnected(true)
      setError(null)
    }

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data)
        if (parsed.type === 'done') {
          setDone(true)
          es.close()
          return
        }
      } catch {
        // Not JSON, treat as text output
      }
      setLines(prev => [...prev, event.data])
    }

    es.onerror = () => {
      setConnected(false)
      // EventSource auto-reconnects, but if we're done, close it
      if (done) {
        es.close()
      }
    }

    return es
  }, [spawnId, done])

  useEffect(() => {
    const es = connect()
    return () => {
      es.close()
    }
  }, [connect])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const handleClear = () => {
    setLines([])
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full ${done ? 'bg-muted-foreground' : connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-xs font-mono-tight text-muted-foreground truncate">{spawnId}</span>
          {done && <span className="text-2xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">Done</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={handleClear}>Clear</Button>
          {onClose && <Button variant="ghost" size="xs" onClick={onClose}>Close</Button>}
        </div>
      </div>

      {/* Terminal output */}
      <div className="flex-1 overflow-auto bg-[#0d1117] p-4 font-mono text-xs leading-relaxed">
        {error && (
          <div className="text-red-400 mb-2">[Error: {error}]</div>
        )}
        {lines.length === 0 && !done && (
          <div className="text-muted-foreground/50">Waiting for output...</div>
        )}
        {lines.map((line, i) => (
          <div key={i} className="text-green-400 whitespace-pre-wrap break-all">
            {formatLine(line)}
          </div>
        ))}
        {done && (
          <div className="text-muted-foreground mt-2">--- Process exited ---</div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function formatLine(line: string): string {
  // Try to parse JSON and pretty-print it
  try {
    const parsed = JSON.parse(line)
    if (typeof parsed === 'object' && parsed !== null) {
      // If it has a 'result' or 'content' field, show that
      if (parsed.result) return String(parsed.result)
      if (parsed.content) return String(parsed.content)
      if (parsed.message) return String(parsed.message)
    }
  } catch {
    // Not JSON
  }
  return line
}

/**
 * Standalone wrapper that renders the chat panel for a given spawn ID
 * Can be used as a full panel or embedded in a modal
 */
export function AgentChatFullPanel({ spawnId }: { spawnId: string }) {
  return (
    <div className="h-[500px] rounded-lg border border-border overflow-hidden">
      <AgentChatPanel spawnId={spawnId} />
    </div>
  )
}
