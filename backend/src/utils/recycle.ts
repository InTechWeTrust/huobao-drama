import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** Send files/folders to the Windows Recycle Bin (recoverable); elsewhere remove them. */
export async function recycle(paths: string[]): Promise<string[]> {
  const existing: string[] = []
  for (const p of new Set(paths)) {
    try { await fs.lstat(p); existing.push(p) } catch { /* already gone */ }
  }
  if (!existing.length) return []
  if (process.platform !== 'win32') {
    await Promise.all(existing.map(p => fs.rm(p, { recursive: true, force: true })))
    return existing
  }
  // Paths travel in a UTF-8 file, so Thai/Chinese names survive the command line.
  const list = path.join(os.tmpdir(), `huobao-recycle-${randomUUID()}.json`)
  await fs.writeFile(list, JSON.stringify(existing), 'utf8')
  const script = `Add-Type -AssemblyName Microsoft.VisualBasic
$ErrorActionPreference = 'Stop'
foreach ($p in (Get-Content -LiteralPath '${list.replace(/'/g, "''")}' -Raw -Encoding UTF8 | ConvertFrom-Json)) {
  if (Test-Path -LiteralPath $p -PathType Container) {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p, 'OnlyErrorDialogs', 'SendToRecycleBin')
  } elseif (Test-Path -LiteralPath $p) {
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin')
  }
}`
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
      let err = ''
      child.stderr.on('data', d => { err += d })
      child.on('error', reject)
      child.on('close', code => code === 0 ? resolve() : reject(new Error(`Recycle Bin move failed: ${err.trim().slice(0, 300)}`)))
    })
  } finally { await fs.rm(list, { force: true }) }
  return existing
}
