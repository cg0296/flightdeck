import { NextRequest, NextResponse } from 'next/server'
import { spawn, ChildProcess } from 'child_process'
import { z } from 'zod'
import { requireRole } from '@/lib/auth'
import { validateBody } from '@/lib/validation'
import { getDatabase, logAuditEvent } from '@/lib/db'
import { logger } from '@/lib/logger'

const localSpawnSchema = z.object({
  task: z.string().min(1, 'Task is required'),
  cwd: z.string().min(1, 'Working directory is required'),
  model: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  dangerouslySkipPermissions: z.boolean().optional(),
})

const CLAUDE_CLI_PATH = process.env.CLAUDE_CLI_PATH
  || 'C:\\Users\\Curt\\.vscode\\extensions\\anthropic.claude-code-2.1.78-win32-x64\\resources\\native-binary\\claude.exe'

// Track active processes in memory
const activeProcesses = new Map<string, { pid: number; label?: string; cwd: string; startedAt: string }>()

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const result = await validateBody(request, localSpawnSchema)
    if ('error' in result) return result.error
    const { task, cwd, model, label, dangerouslySkipPermissions } = result.data

    const spawnId = `spawn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const startedAt = new Date().toISOString()

    // Build CLI args
    const args: string[] = ['--print', '--output-format', 'json']
    if (dangerouslySkipPermissions) {
      args.push('--dangerously-skip-permissions')
    }
    if (model) {
      args.push('--model', model)
    }

    // Insert initial row into flight_history
    const db = getDatabase()
    db.prepare(`
      INSERT INTO flight_history (id, agent_label, repo_path, task_prompt, started_at, status, model)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(spawnId, label ?? null, cwd, task, startedAt, 'running', model ?? null)

    // Spawn the Claude CLI process
    let child: ChildProcess
    try {
      child = spawn(CLAUDE_CLI_PATH, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      })
    } catch (err: any) {
      db.prepare(`UPDATE flight_history SET status = ?, ended_at = ?, output_summary = ? WHERE id = ?`)
        .run('error', new Date().toISOString(), `Failed to spawn: ${err.message}`, spawnId)
      logger.error({ err, spawnId }, 'Failed to spawn Claude CLI process')
      return NextResponse.json({ error: 'Failed to spawn Claude CLI', detail: err.message }, { status: 500 })
    }

    const pid = child.pid ?? 0

    // Update flight_history with pid
    db.prepare(`UPDATE flight_history SET pid = ? WHERE id = ?`).run(pid, spawnId)

    // Track in memory
    activeProcesses.set(spawnId, { pid, label, cwd, startedAt })

    // Pipe task as stdin
    if (child.stdin) {
      child.stdin.write(task)
      child.stdin.end()
    }

    // Collect output in background
    let stdout = ''
    let stderr = ''

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
        // Cap buffer to prevent memory issues
        if (stdout.length > 50000) {
          stdout = stdout.slice(-50000)
        }
      })
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
        if (stderr.length > 50000) {
          stderr = stderr.slice(-50000)
        }
      })
    }

    // Handle process exit in background
    child.on('close', (exitCode) => {
      const endedAt = new Date().toISOString()
      const combinedOutput = stdout + (stderr ? `\n--- stderr ---\n${stderr}` : '')
      const outputSummary = combinedOutput.slice(-2000)
      const status = exitCode === 0 ? 'completed' : 'failed'

      try {
        const db = getDatabase()
        db.prepare(`
          UPDATE flight_history
          SET exit_code = ?, ended_at = ?, output_summary = ?, status = ?
          WHERE id = ?
        `).run(exitCode ?? -1, endedAt, outputSummary, status, spawnId)
      } catch (dbErr) {
        logger.error({ err: dbErr, spawnId }, 'Failed to update flight_history on process exit')
      }

      activeProcesses.delete(spawnId)
      logger.info({ spawnId, pid, exitCode, status }, 'Local spawn process exited')
    })

    child.on('error', (err) => {
      const endedAt = new Date().toISOString()
      try {
        const db = getDatabase()
        db.prepare(`
          UPDATE flight_history
          SET exit_code = ?, ended_at = ?, output_summary = ?, status = ?
          WHERE id = ?
        `).run(-1, endedAt, `Process error: ${err.message}`.slice(-2000), 'error', spawnId)
      } catch (dbErr) {
        logger.error({ err: dbErr, spawnId }, 'Failed to update flight_history on process error')
      }

      activeProcesses.delete(spawnId)
      logger.error({ err, spawnId, pid }, 'Local spawn process error')
    })

    // Audit log
    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    logAuditEvent({
      action: 'local_spawn',
      actor: auth.user.username,
      actor_id: auth.user.id,
      detail: {
        spawnId,
        pid,
        model: model ?? null,
        label: label ?? null,
        cwd,
        task_summary: task.length > 120 ? task.slice(0, 120) + '...' : task,
        dangerouslySkipPermissions: !!dangerouslySkipPermissions,
      },
      ip_address: ipAddress,
    })

    logger.info({ spawnId, pid, cwd, model, label }, 'Local Claude CLI process spawned')

    return NextResponse.json({ spawnId, pid, status: 'launched' })
  } catch (error) {
    logger.error({ err: error }, 'Local spawn API error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const processes = Array.from(activeProcesses.entries()).map(([id, info]) => ({
    spawnId: id,
    ...info,
  }))

  return NextResponse.json({ processes })
}
