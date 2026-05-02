import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import { watch as fsWatch, existsSync, type FSWatcher } from 'node:fs'
import path from 'node:path'

function getAppVersion(): string {
  try {
    const tag = execSync('git describe --tags --abbrev=0', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    const [maj, min, patch] = tag.replace(/^v/, '').split('.').map(Number)
    const count = parseInt(
      execSync(`git rev-list --count ${tag}..HEAD`, {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim(),
      10,
    )
    return `${maj}.${min}.${patch + count}`
  } catch {
    return '0.0.0'
  }
}

function findGitDir(): string | null {
  let dir = process.cwd()
  while (true) {
    const candidate = path.join(dir, '.git')
    if (existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function appVersionPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:app-version'
  const RESOLVED_ID = '\0' + VIRTUAL_ID

  return {
    name: 'app-version',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id === RESOLVED_ID) {
        return `export const appVersion = ${JSON.stringify(getAppVersion())}`
      }
    },
    configureServer(server: ViteDevServer) {
      const gitDir = findGitDir()
      if (!gitDir) return

      const reload = () => {
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }

      const watchers: FSWatcher[] = []
      const targets = [
        path.join(gitDir, 'HEAD'),
        path.join(gitDir, 'refs'),
        path.join(gitDir, 'packed-refs'),
      ]
      for (const target of targets) {
        if (!existsSync(target)) continue
        try {
          watchers.push(fsWatch(target, { recursive: true }, reload))
        } catch {
          // ignore watch failures on platforms that don't support recursive
        }
      }

      server.httpServer?.once('close', () => {
        for (const w of watchers) w.close()
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), appVersionPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
