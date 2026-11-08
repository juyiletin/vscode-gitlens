import type { Cache } from '@gitlens/git/cache.js';
import type { GitProvider } from '@gitlens/git/providers/provider.js';
import type { GitResult, GitRunOptions } from '@gitlens/git/run.types.js';
import type { UnifiedDisposable } from '@gitlens/utils/disposable.js';
import type { AgentSessionProvider } from '../../agents/provider.js';
import type { Container } from '../../container.js';
// Force import of GitHub since dynamic imports are not supported in the WebWorker ExtensionHost
// oxlint-disable-next-line typescript/consistent-type-imports
import { GlGitProvider } from '../../git/gitProvider.js';
import type { RepositoryLocationProvider } from '../../git/location/repositorylocationProvider.js';
import { GlGitHubGitProvider } from '../../plus/integrations/host/providers/githubGitProvider.js';
import type { SharedGkStorageLocationProvider } from '../../plus/repos/sharedGkStorageLocationProvider.js';
import type { TelemetryService } from '../../telemetry/telemetry.js';

export function git(
	_container: Container,
	_options: GitRunOptions,
	..._args: any[]
): Promise<GitResult<string | Buffer>> {
	// No git CLI exists in this environment, so nothing ran. Reporting a clean empty exit would tell callers
	// the command succeeded and found nothing — say it never started instead.
	return Promise.resolve({
		stdout: '',
		completion: {
			status: 'failed',
			reason: 'unstarted',
			error: new Error('git is unavailable in this environment'),
		},
	});
}

export function getSupportedGitProviders(
	container: Container,
	cache: Cache,
	register: (provider: GitProvider, canHandle: (repoPath: string) => boolean) => UnifiedDisposable,
): Promise<GlGitProvider[]> {
	return Promise.resolve([new GlGitHubGitProvider(container, cache, register)]);
}

export function getSharedGKStorageLocationProvider(_container: Container): SharedGkStorageLocationProvider | undefined {
	return undefined;
}

export function getSupportedRepositoryLocationProvider(
	_container: Container,
	_sharedStorage: SharedGkStorageLocationProvider | undefined,
): RepositoryLocationProvider | undefined {
	return undefined;
}

export function getAgentSessionProviders(_container: Container): AgentSessionProvider[] {
	return [];
}

let _telemetryService: TelemetryService | undefined;
export function getTelementryService(): TelemetryService | undefined {
	return _telemetryService;
}

export function setTelemetryService(service: TelemetryService): void {
	_telemetryService = service;
}
