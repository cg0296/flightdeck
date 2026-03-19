import fs from 'node:fs'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { config } from '@/lib/config'
import { requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/sessions/[id]/stream
 * SSE endpoint that streams log file content for a running flight session.
 * Polls the log file every 2 seconds and sends new lines as SSE events.
 * Auto-closes when the flight status is no longer 'running'.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params

  // Look up the spawn in flight_history
  const db = getDatabase()
  const flight = db.prepare('SELECT id, status, repo_path FROM flight_history WHERE id = ?').get(id) as
    | { id: string; status: string; repo_path: string }
    | undefined

  if (!flight) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const logPath = path.join(config.dataDir, 'flights', `${id}.log`)
  const encoder = new TextEncoder()

  let cleanup: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      let offset = 0
      let watcher: fs.FSWatcher | null = null

      // Send any existing content first, then poll for new content
      function sendNewLines() {
        try {
          if (!fs.existsSync(logPath)) return

          const stat = fs.statSync(logPath)
          if (stat.size <= offset) return

          const fd = fs.openSync(logPath, 'r')
          try {
            const buf = Buffer.alloc(stat.size - offset)
            fs.readSync(fd, buf, 0, buf.length, offset)
            offset = stat.size

            const chunk = buf.toString('utf-8')
            const lines = chunk.split('\n')
            for (const line of lines) {
              if (line.trim()) {
                controller.enqueue(encoder.encode(`data: ${line}\n\n`))
              }
            }
          } finally {
            fs.closeSync(fd)
          }
        } catch {
          // File may not exist yet or be temporarily locked
        }
      }

      // Check if the flight is still running
      function isStillRunning(): boolean {
        try {
          const row = db.prepare('SELECT status FROM flight_history WHERE id = ?').get(id) as
            | { status: string }
            | undefined
          return row?.status === 'running'
        } catch {
          return false
        }
      }

      // Send initial content
      sendNewLines()

      // Try to set up a file watcher for immediate notifications
      try {
        const dir = path.dirname(logPath)
        if (fs.existsSync(dir)) {
          watcher = fs.watch(dir, (eventType, filename) => {
            if (filename === `${id}.log`) {
              sendNewLines()
            }
          })
          watcher.on('error', () => {
            // Watcher failed, polling will still work
          })
        }
      } catch {
        // fs.watch not available or directory doesn't exist yet; rely on polling
      }

      // Poll every 2 seconds for new content and check status
      const interval = setInterval(() => {
        sendNewLines()

        if (!isStillRunning()) {
          // Send any final content
          sendNewLines()
          try {
            controller.enqueue(encoder.encode(`data: {"type":"done"}\n\n`))
            controller.close()
          } catch {
            // Already closed
          }
          if (cleanup) {
            cleanup()
            cleanup = null
          }
        }
      }, 2000)

      cleanup = () => {
        clearInterval(interval)
        if (watcher) {
          try { watcher.close() } catch { /* noop */ }
          watcher = null
        }
      }
    },

    cancel() {
      if (cleanup) {
        cleanup()
        cleanup = null
      }
    },
  })

  // Clean up on client disconnect
  request.signal.addEventListener('abort', () => {
    if (cleanup) {
      cleanup()
      cleanup = null
    }
  }, { once: true })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
