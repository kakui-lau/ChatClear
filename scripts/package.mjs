import { spawnSync } from 'node:child_process'
import process from 'node:process'

const builderArgs = process.argv.slice(2)
if (builderArgs[0] === '--') builderArgs.shift()
const environment = { ...process.env }
const signingVariables = [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_ID',
  'APPLE_APP_SPECIFIC_PASSWORD',
  'APPLE_TEAM_ID'
]

for (const variable of signingVariables) {
  if (!environment[variable]?.trim()) delete environment[variable]
}

const targetsMac = builderArgs.some(
  (argument) => argument === '--mac' || argument === '-m' || argument.startsWith('--mac=')
)
const targetsAnotherPlatform = builderArgs.some(
  (argument) =>
    argument === '--win' ||
    argument === '-w' ||
    argument.startsWith('--win=') ||
    argument === '--linux' ||
    argument === '-l' ||
    argument.startsWith('--linux=')
)
const buildsForMac = targetsMac || (!targetsAnotherPlatform && process.platform === 'darwin')
const hasSigningIdentity = Boolean(environment.CSC_LINK || environment.CSC_NAME)
const hasIdentityOverride = builderArgs.some(
  (argument) =>
    argument.startsWith('-c.mac.identity=') || argument.startsWith('--config.mac.identity=')
)

if (buildsForMac && !hasSigningIdentity && !hasIdentityOverride) {
  environment.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  builderArgs.push(
    '-c.mac.identity=-',
    '-c.mac.entitlements=build/entitlements.adhoc.mac.plist',
    '-c.mac.entitlementsInherit=build/entitlements.adhoc.mac.plist'
  )
  process.stdout.write(
    'No macOS Developer ID was configured; creating a complete ad-hoc signed build.\n'
  )
}

const pnpmCli = environment.npm_execpath
const command = pnpmCli ? process.execPath : process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const commandArgs = pnpmCli
  ? [pnpmCli, 'exec', 'electron-builder', ...builderArgs]
  : ['exec', 'electron-builder', ...builderArgs]
const result = spawnSync(command, commandArgs, { env: environment, stdio: 'inherit' })

if (result.error) throw result.error
if (result.signal) {
  process.kill(process.pid, result.signal)
}

process.exit(result.status ?? 1)
