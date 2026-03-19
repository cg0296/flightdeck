'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { useSmartPoll } from '@/lib/use-smart-poll'

interface Flight {
  id: string
  agent_label: string
  repo_path: string
  task_prompt: string
  started_at: string
  ended_at: string | null
  status: string
  exit_code: number | null
  output_summary: string | null
  tokens_used: number | null
  estimated_cost: number | null
  commits_made: number | null
  files_changed: number | null
  model: string | null
  pid: number | null
}

const statusColors: Record<string, string> = {
  completed: 'text-green-400',
  failed: 'text-red-400',
  killed: 'text-muted-foreground',
  running: 'text-yellow-400',
}

const statusBgColors: Record<string, string> = {
  completed: 'bg-green-500/10 border-green-500/20',
  failed: 'bg-red-500/10 border-red-500/20',
  killed: 'bg-muted/50 border-border',
  running: 'bg-yellow-500/10 border-yellow-500/20',
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const diffMs = end - start
  if (diffMs < 0) return '0s'
  const totalSec = Math.floor(diffMs / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min < 60) return `${min}m ${sec}s`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return `${hr}h ${remMin}m`
}

function formatCost(cost: number | null): string {
  if (cost == null) return '--'
  return `$${cost.toFixed(2)}`
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`
  return `${Math.floor(diffSec / 86400)} days ago`
}

function repoName(repoPath: string | null): string {
  if (!repoPath) return '--'
  const parts = repoPath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || repoPath
}

export function FlightHistoryPanel() {
  const [flights, setFlights] = useState<Flight[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const limit = 50

  const fetchFlights = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      if (search) params.append('search', search)
      params.append('limit', limit.toString())
      params.append('offset', (page * limit).toString())

      const res = await fetch(`/api/flights?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setFlights(data.flights || [])
      setTotal(data.total || 0)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [statusFilter, search, page])

  useEffect(() => { fetchFlights() }, [fetchFlights])
  useSmartPoll(fetchFlights, 30000, { pauseWhenDisconnected: true })

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Flight Log</h2>
          <p className="text-xs text-muted-foreground mt-0.5">History of all agent runs</p>
        </div>
        <Button
          onClick={() => { setPage(0); fetchFlights() }}
          variant="ghost"
          size="xs"
        >
          Refresh
        </Button>
      </div>

      {/* Search and filters */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="Search prompts and labels..."
          className="h-8 px-2.5 text-xs rounded-md bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary flex-1 max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(0) }}
          className="h-8 px-2 text-xs rounded-md bg-secondary border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All statuses</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="killed">Killed</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-10 rounded-lg shimmer" />
          ))}
        </div>
      ) : flights.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-xs text-muted-foreground">No flights recorded yet</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Label</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Repo</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Duration</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cost</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {flights.map(flight => (
                <FlightRow
                  key={flight.id}
                  flight={flight}
                  expanded={expandedId === flight.id}
                  onToggle={() => setExpandedId(expandedId === flight.id ? null : flight.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            variant="ghost"
            size="xs"
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            variant="ghost"
            size="xs"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

function FlightRow({ flight, expanded, onToggle }: { flight: Flight; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-border/50 hover:bg-secondary/30 cursor-pointer transition-smooth"
      >
        <td className="px-3 py-2.5 text-foreground font-medium truncate max-w-[160px]">
          {flight.agent_label || '--'}
        </td>
        <td className="px-3 py-2.5 text-muted-foreground font-mono-tight truncate max-w-[120px]">
          {repoName(flight.repo_path)}
        </td>
        <td className="px-3 py-2.5 text-muted-foreground font-mono-tight">
          {formatDuration(flight.started_at, flight.ended_at)}
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-block px-1.5 py-0.5 rounded text-2xs font-medium border ${statusBgColors[flight.status] || 'bg-secondary border-border'} ${statusColors[flight.status] || 'text-muted-foreground'}`}>
            {flight.status}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right text-muted-foreground font-mono-tight">
          {formatCost(flight.estimated_cost)}
        </td>
        <td className="px-3 py-2.5 text-right text-muted-foreground">
          {formatRelativeTime(flight.started_at)}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/50">
          <td colSpan={6} className="px-4 py-3 bg-secondary/20">
            <div className="space-y-3 text-xs">
              {flight.task_prompt && (
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Task Prompt</p>
                  <p className="text-foreground whitespace-pre-wrap bg-secondary/50 rounded-md px-3 py-2 border border-border">
                    {flight.task_prompt}
                  </p>
                </div>
              )}
              {flight.output_summary && (
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Output Summary</p>
                  <p className="text-foreground whitespace-pre-wrap bg-secondary/50 rounded-md px-3 py-2 border border-border">
                    {flight.output_summary}
                  </p>
                </div>
              )}
              <div className="flex gap-4 text-muted-foreground">
                {flight.model && <span>Model: <span className="text-foreground">{flight.model}</span></span>}
                {flight.tokens_used != null && <span>Tokens: <span className="text-foreground">{flight.tokens_used.toLocaleString()}</span></span>}
                {flight.commits_made != null && <span>Commits: <span className="text-foreground">{flight.commits_made}</span></span>}
                {flight.files_changed != null && <span>Files changed: <span className="text-foreground">{flight.files_changed}</span></span>}
                {flight.exit_code != null && <span>Exit code: <span className="text-foreground">{flight.exit_code}</span></span>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
