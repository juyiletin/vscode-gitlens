import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import * as process from 'node:process';

export type GkAgent = {
	readonly name: string;
	readonly displayName: string;
	readonly detected: boolean;
	readonly executable?: string;
	readonly mcpSupported: boolean;
	readonly mcpInstalled: boolean;
	readonly hooksSupported: boolean;
	readonly hooksInstalled: boolean;
};

export function isCliExecutableAvailable(executable: string | undefined): boolean {
	return typeof executable === 'string' && executable.length > 0 && existsSync(executable);
}

const agents = [
	{ name: 'claude-cli', executable: 'claude', displayName: 'Claude Code' },
	{ name: 'codex', executable: 'codex', displayName: 'Codex' },
	{ name: 'copilot', executable: 'copilot', displayName: 'GitHub Copilot CLI' },
	{ name: 'gemini', executable: 'gemini', displayName: 'Gemini CLI' },
	{ name: 'opencode', executable: 'opencode', displayName: 'OpenCode' },
] as const;

/** Detect user-installed agents locally without executing a vendor installer or contacting a service. */
export function fetchAgents(_timeoutMs?: number): Promise<GkAgent[]> {
	const directories = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
	const suffixes =
		process.platform === 'win32' ? ['', ...(process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';')] : [''];
	return Promise.resolve(
		agents.map(agent => {
			let executable: string | undefined;
			for (const directory of directories) {
				for (const suffix of suffixes) {
					const candidate = join(directory, `${agent.executable}${suffix}`);
					try {
						if (!statSync(candidate, { throwIfNoEntry: false })?.isFile()) continue;

						accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
						executable = candidate;
						break;
					} catch {
						continue;
					}
				}

				if (executable != null) break;
			}

			return {
				name: agent.name,
				displayName: agent.displayName,
				executable: executable,
				detected: executable != null,
				mcpSupported: false,
				mcpInstalled: false,
				hooksSupported: false,
				hooksInstalled: false,
			};
		}),
	);
}
