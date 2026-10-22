import path from 'node:path'
import process from 'node:process'
import { recordReleaseCommand, sha256File } from '../release-evidence-v2.mjs'

export const WINDOWS_COMMAND_STEPS = [
  'install-locked-dependencies',
  'install-playwright-chromium',
  'renderer-browser-tests',
  'complete-windows-release-gate',
]

export function recordQualificationCommands(evidenceRoot: string, cwd: string) {
  for (const step of WINDOWS_COMMAND_STEPS) {
    recordReleaseCommand({ evidenceRoot, step, command: [process.execPath, '-e', ''], cwd })
  }
}

function base(name: string) {
  return { schemaVersion: 2, accepted: true, observations: [`direct ${name} observation`] }
}

function reference(releaseRoot: string, kind: string, file: string) {
  return {
    kind,
    evidencePath: `qualification/${file}`,
    path: `qualification/${file}`,
    sha256: sha256File(path.join(releaseRoot, 'qualification', file)),
  }
}

export function windowsAcceptanceReceipt(releaseRoot: string, version: string, name: string) {
  const sha256 = sha256File(path.join(releaseRoot, `ai-writer-setup-${version}.exe`))
  const receipts: Record<string, unknown> = {
    install: { ...base(name), kind: 'windows-install', direct: { installerExitCode: 0, installedExecutable: 'C:/AI/AI Writer.exe', installedExecutableExists: true } },
    launch: { ...base(name), kind: 'windows-launch', expectedVersion: version, direct: { executablePath: 'C:/AI/AI Writer.exe', productVersion: version, processId: 101, processStartTimeTicks: '12345', visibleMainWindowCount: 1 } },
    'quiet-window': { ...base(name), kind: 'windows-final-quiet-window', direct: { monitorState: 'step-completed', monitorStep: 'final:quiet', quietWindowSeconds: 5, completedAt: '2026-08-10T12:00:00.000Z' } },
    'error-dialogs': { ...base(name), kind: 'windows-error-dialogs', direct: { monitorState: 'step-completed', monitorStep: 'final:quiet', newProductErrorDialogCount: 0, observedThrough: '2026-08-10T12:00:00.000Z' } },
    uninstall: { ...base(name), kind: 'windows-uninstall', direct: { installedExecutableExists: false, installDirectoryState: 'absent', allowedSystemResiduals: [] } },
    'native-abi': { ...base(name), kind: 'windows-native-abi', direct: { restoreMode: 'monitored', nodeModuleAbi: '127', verificationTest: 'electron/repositories/__tests__/character-repository.test.ts' } },
    'packaged-smoke': { ...base(name), kind: 'windows-packaged-smoke-summary', direct: { evidenceCount: 3, evidenceKinds: ['packaged-vector-smoke', 'packaged-official-homepage-smoke', 'packaged-skin-smoke'] }, evidence: [
      reference(releaseRoot, 'packaged-vector-smoke', 'packaged-vector-smoke.json'),
      reference(releaseRoot, 'packaged-official-homepage-smoke', 'packaged-official-homepage-smoke.json'),
      reference(releaseRoot, 'packaged-skin-smoke', 'packaged-skin-smoke.json'),
    ] },
    signing: { ...base(name), kind: 'windows-signing', direct: { authenticodeStatus: 'NotSigned', installerSha256: sha256 }, status: 'unsigned', validationResult: 'NotSigned', unsignedDistributionImpact: 'Windows may display an unknown-publisher warning.' },
  }
  return receipts[name]
}
