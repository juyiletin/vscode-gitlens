import * as assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as process from 'node:process';
import { fetchAgents } from '../agentFetcher.js';

suite('Local agent discovery', () => {
	test('discovers executables on PATH without starting an agent or installer', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'gitlens-agents-'));
		const previousPath = process.env.PATH;
		const marker = join(directory, 'executed');
		const executable = join(directory, process.platform === 'win32' ? 'codex.cmd' : 'codex');
		try {
			await writeFile(
				executable,
				process.platform === 'win32' ? `echo ran > "${marker}"` : `#!/bin/sh\necho ran > '${marker}'\n`,
			);
			await chmod(executable, 0o755);
			await mkdir(join(directory, 'claude'));
			process.env.PATH = directory;
			const agents = await fetchAgents();
			assert.strictEqual(agents.find(agent => agent.name === 'codex')?.executable, executable);
			assert.strictEqual(agents.find(agent => agent.name === 'codex')?.detected, true);
			assert.strictEqual(agents.find(agent => agent.name === 'claude-cli')?.detected, false);
			assert.ok(agents.every(agent => !agent.mcpSupported && !agent.hooksSupported));
			await assert.rejects(readFile(marker), { code: 'ENOENT' });
		} finally {
			if (previousPath == null) {
				delete process.env.PATH;
			} else {
				process.env.PATH = previousPath;
			}

			await rm(directory, { recursive: true, force: true });
		}
	});
});
