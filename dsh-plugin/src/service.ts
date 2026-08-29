/**
 * Flovart service (Node/Cordis half). Owns the CLI facade and the last known
 * runtime/registry state; is provided on `ctx.flovart` for later profile
 * layers and the doctor script. The browser half never reads this service or
 * its token; the host exposes a narrow same-origin Workspace proxy instead.
 */

import type { Context } from '@deepseek-ai/cordis'
import { normalizeConfig, type FlovartPluginConfig } from './config.ts'
import { runCliSync, type CliOutcome } from './cli.ts'

export interface CommandMeta {
  summary: string
  args: Record<string, string>
  availability: string
}

export interface FlovartServiceState {
  /** Whether the CLI launcher resolved and spoke the registry at last probe. */
  cliReady: boolean
  cliError: string | null
  /** Canonical command registry snapshot (command.list data). */
  commands: Record<string, CommandMeta> | null
  /** Registry content hash, when the CLI reports one. */
  registryHash: string | null
}

export class FlovartService {
  readonly config: FlovartPluginConfig
  state: FlovartServiceState = { cliReady: false, cliError: null, commands: null, registryHash: null }

  constructor(_ctx: Context, config: Partial<FlovartPluginConfig> | undefined) {
    this.config = normalizeConfig(config)
  }

  /** Probe the CLI and refresh the registry snapshot. Returns the outcome. */
  probe(): CliOutcome {
    const outcome = runCliSync(this.config, 'command.list', {})
    if (outcome.ok) {
      const data = outcome.data as { commands?: Record<string, CommandMeta>; registryHash?: string | null } | null
      this.state.commands = data?.commands ?? null
      this.state.registryHash = data?.registryHash ?? null
      this.state.cliReady = this.state.commands !== null
      this.state.cliError = null
    } else {
      this.state.cliReady = false
      this.state.cliError = outcome.error?.message ?? '未知 CLI 错误'
    }
    return outcome
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    flovart: FlovartService
  }
}
