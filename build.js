/**
 * Build de distribuição local — gera dist/ com servidor Next standalone.
 * Uso: node build.js  (ou npm run build:dist)
 *
 * Diferente dos dashboards Sankhya (HTML único em dist/): aqui dist/ é um
 * servidor Node que precisa das variáveis em .env.local (API routes + Espião).
 */
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = __dirname
const distDir = path.join(root, 'dist')

function limparDist() {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true })
  }
}

function copiar(origem, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.cpSync(origem, destino, { recursive: true })
}

console.log('[build] next build (standalone)...')
execSync('npm run build', { cwd: root, stdio: 'inherit', shell: true })

const standalone = path.join(root, '.next', 'standalone')
const serverJs = path.join(standalone, 'server.js')
if (!fs.existsSync(serverJs)) {
  console.error('[build] Não encontrou .next/standalone/server.js')
  console.error('        Confira output: "standalone" em next.config.mjs')
  process.exit(1)
}

console.log('[build] montando dist/...')
limparDist()
copiar(standalone, distDir)

const staticSrc = path.join(root, '.next', 'static')
if (fs.existsSync(staticSrc)) {
  copiar(staticSrc, path.join(distDir, '.next', 'static'))
}

const publicSrc = path.join(root, 'public')
if (fs.existsSync(publicSrc)) {
  copiar(publicSrc, path.join(distDir, 'public'))
}

fs.writeFileSync(
  path.join(distDir, 'BUILD.json'),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      port: 3001,
      hint: 'Duplo clique em abrir-dist.bat ou: npm run start:dist',
    },
    null,
    2
  )
)

fs.writeFileSync(
  path.join(distDir, 'README.txt'),
  [
    'Pasta gerada por: npm run build:dist',
    '',
    'Servidor Next standalone (porta 3001). Precisa de .env.local — use abrir-dist.bat.',
    'Dev com hot-reload: abrir-dash.bat (porta 3000).',
    '',
  ].join('\n')
)

console.log('[build] dist/ pronto.')
console.log('[build] Abra: abrir-dist.bat  ou  npm run start:dist')
