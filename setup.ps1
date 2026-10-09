# SeniorRouter setup for Windows (PowerShell 5.1+). Safe to re-run: installs only what is missing.
# Usage:  powershell -ExecutionPolicy Bypass -File .\setup.ps1 [-SkipFreePool]
param([switch]$SkipFreePool)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }
function WingetInstall($id, $cmd) {
  if (Have $cmd) { Write-Host "ok: $cmd"; return }
  if (-not (Have 'winget')) { Write-Warning "$cmd missing and winget unavailable: install $id manually"; return }
  winget install --id $id -e --source winget --silent --disable-interactivity
}

Step 'Prerequisites'
$missing = @()
if (-not (Have 'node')) { $missing += 'Node.js >= 18 (https://nodejs.org)' }
if (-not (Have 'git')) { $missing += 'Git (https://git-scm.com)' }
if (-not (Have 'uv')) { $missing += 'uv (winget install astral-sh.uv)' }
if ($missing) { $missing | ForEach-Object { Write-Warning "missing: $_" }; exit 1 }
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 18) { Write-Warning "Node $nodeMajor found, need >= 18"; exit 1 }

Step 'CLIs from official channels (pinned where it matters)'
npm install -g ecc-universal@2.2.3 @openai/codex   # ECC catalog (skills/agents/rules) + Codex CLI
WingetInstall 'Gitleaks.Gitleaks' 'gitleaks'          # secret gate before anything leaves the machine
WingetInstall 'BurntSushi.ripgrep.MSVC' 'rg'
if (-not (Have 'graphify')) { uv tool install graphifyy }
graphify install --platform claude                    # /graphify skill for Claude Code
if (-not $SkipFreePool) {
  # never 1.82.7 / 1.82.8 (compromised releases); 1.102.1 includes the 2026 CVE fixes
  uv tool install "litellm[proxy]==1.102.1"
}

Step 'Install SeniorRouter into ~/.claude (manifest-tracked, undo: node router/router.mjs uninstall)'
node "$root\router\router.mjs" install

Step 'Health check'
node "$root\router\router.mjs" doctor

Write-Host @"

Next (manual, once):
  1. codex login                      # ChatGPT account (subscription)
  2. Antigravity CLI (optional, Google account): https://antigravity.google  -> run 'agy' once to sign in
  3. Free API keys (optional): see .env.example, set each with  setx NAME "value"  (never commit them)
  4. node "$root\router\router.mjs" doctor --probe     # real test of codex + agy
     node "$root\router\router.mjs" free check         # real test of every free model you have a key for
Then in any project: open it in Claude Code and type /router-init
"@
