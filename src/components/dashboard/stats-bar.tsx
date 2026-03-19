'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useSmartPoll } from '@/lib/use-smart-poll'
import { Button } from '@/components/ui/button'

const INTERVAL_OPTIONS = [
  { label: '2s', value: 2000 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '30s', value: 30000 },
  { label: '60s', value: 60000 },
]

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00'
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}

export function StatsBar() {
  const [agentsInFlight, setAgentsInFlight] = useState(0)
  const [totalFlightsToday, setTotalFlightsToday] = useState(0)
  const [fuelBurnedToday, setFuelBurnedToday] = useState(0)
  const [uptime, setUptime] = useState('0s')
  const [pollInterval, setPollInterval] = useState(10000)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const mountTimeRef = useRef(Date.now())
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Update uptime every second
  useEffect(() => {
    const timer = setInterval(() => {
      setUptime(formatUptime(Date.now() - mountTimeRef.current))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const [spawnRes, flightsRes] = await Promise.all([
        fetch('/api/spawn/local').then(r => r.ok ? r.json() : { processes: [] }),
        fetch('/api/flights?status=&search=&limit=50&offset=0').then(r => r.ok ? r.json() : { flights: [], total: 0 }),
      ])

      setAgentsInFlight(spawnRes.processes?.length ?? 0)
      setTotalFlightsToday(flightsRes.total ?? 0)

      // Sum up estimated_cost from flights
      const flights = flightsRes.flights ?? []
      const todayCost = flights.reduce((sum: number, f: any) => {
        return sum + (f.estimated_cost ?? 0)
      }, 0)
      setFuelBurnedToday(todayCost)
    } catch {
      // Silently fail - stats are non-critical
    }
  }, [])

  useSmartPoll(fetchStats, pollInterval, { enabled: autoRefresh })

  return (
    <div className="bg-card border-b border-border px-4 py-2 flex items-center justify-between gap-6">
      <div className="flex items-center gap-6 min-w-0">
        {/* Agents In Flight */}
        <div className="flex items-center gap-2 min-w-0">
          {agentsInFlight > 0 && (
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-muted-foreground text-2xs leading-none">Agents In Flight</div>
            <div className="text-foreground text-sm font-mono-tight font-medium leading-tight">{agentsInFlight}</div>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border flex-shrink-0" />

        {/* Total Flights Today */}
        <div className="min-w-0">
          <div className="text-muted-foreground text-2xs leading-none">Total Flights Today</div>
          <div className="text-foreground text-sm font-mono-tight font-medium leading-tight">{totalFlightsToday}</div>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border flex-shrink-0" />

        {/* Fuel Burned Today */}
        <div className="min-w-0">
          <div className="text-muted-foreground text-2xs leading-none">Fuel Burned Today</div>
          <div className="text-foreground text-sm font-mono-tight font-medium leading-tight">{formatCost(fuelBurnedToday)}</div>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-border flex-shrink-0" />

        {/* Uptime */}
        <div className="min-w-0">
          <div className="text-muted-foreground text-2xs leading-none">Uptime</div>
          <div className="text-foreground text-sm font-mono-tight font-medium leading-tight">{uptime}</div>
        </div>
      </div>

      {/* Refresh controls */}
      <div className="relative flex-shrink-0" ref={dropdownRef}>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setDropdownOpen(prev => !prev)}
          className="text-2xs text-muted-foreground gap-1"
        >
          {autoRefresh ? `Auto ${INTERVAL_OPTIONS.find(o => o.value === pollInterval)?.label ?? '10s'}` : 'Paused'}
          <span className="text-[10px]">{dropdownOpen ? '\u25B2' : '\u25BC'}</span>
        </Button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[140px]">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => { setAutoRefresh(prev => !prev); setDropdownOpen(false) }}
              className="w-full text-left px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors flex items-center justify-between"
            >
              <span>Auto-refresh</span>
              <span className={`text-2xs font-medium ${autoRefresh ? 'text-green-500' : 'text-muted-foreground'}`}>
                {autoRefresh ? 'ON' : 'OFF'}
              </span>
            </button>

            <div className="h-px bg-border my-1" />

            {/* Interval options */}
            {INTERVAL_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setPollInterval(opt.value); setAutoRefresh(true); setDropdownOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors ${
                  pollInterval === opt.value && autoRefresh
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
