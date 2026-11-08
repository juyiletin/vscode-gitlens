import type { GitRemote } from '@gitlens/git/models/remote.js';
import { gate } from '@gitlens/utils/decorators/gate.js';
import { debug } from '@gitlens/utils/decorators/log.js';
import type { Disposable } from '@gitlens/utils/disposable.js';
import type { IntegrationIds, SupportedCloudIntegrationIds } from '../constants.js';
import type { IntegrationServiceContext } from '../context.js';
import type { IntegrationService } from '../integrationService.js';
import type { GitHostIntegration } from '../models/gitHostIntegration.js';
import type { ApiClients } from '../providers/apiClients.js';
import type { Source } from '../telemetry.js';
import { isSelfManagedHostIntegrationId, supportedIntegrationIds } from '../utils/integration.utils.js';
import type { ConfiguredIntegrationService } from './configuredIntegrationService.js';
import type {
	IntegrationAuthenticationProvider,
	IntegrationAuthenticationSessionDescriptor,
} from './integrationAuthenticationProvider.js';
import { HostIntegrationAuthenticationProvider } from './integrationAuthenticationProvider.js';
import { ObservedAuthenticationProvider } from './observedAuthenticationProvider.js';

export class IntegrationAuthenticationService implements Disposable {
	private readonly providers = new Map<IntegrationIds, IntegrationAuthenticationProvider>();

	constructor(
		private readonly configuredIntegrationService: ConfiguredIntegrationService,
		readonly ctx: IntegrationServiceContext,
		/**
		 * Lazy accessor for the owning {@link IntegrationService}. Injected by the composition root
		 * ({@link createIntegrationManager}) to break the auth↔service construction cycle without a
		 * mutable setter or a host round-trip; only resolved at runtime (long after construction).
		 */
		private readonly getIntegrationService: () => IntegrationService,
	) {}

	dispose(): void {
		this.providers.forEach(p => p.dispose());
		this.providers.clear();
	}

	/** Initiates the direct integration connect flow on the owning service. */
	connectCloudIntegrations(
		connect: { integrationIds: SupportedCloudIntegrationIds[]; skipIfConnected?: boolean; skipPreSync?: boolean },
		source?: Source,
	): Promise<boolean> {
		return this.getIntegrationService().connectCloudIntegrations(connect, source);
	}

	/**
	 * Resolves the connected git-host integration for a `GitRemote`, via the owning service. Lets
	 * package-internal callers (e.g. the Bitbucket provider) resolve a remote's integration without a
	 * host round-trip.
	 */
	getByRemote(remote: GitRemote): Promise<GitHostIntegration | undefined> {
		return this.getIntegrationService().getByRemote(remote);
	}

	/** Resolves the per-integration `ignoreSSLErrors` flag via the owning service (host-config-backed). */
	ignoreSSLErrors(integration: GitHostIntegration | { id: IntegrationIds; domain?: string }): boolean | 'force' {
		return this.getIntegrationService().ignoreSSLErrors(integration);
	}

	/** The package-built per-provider API clients, via the owning service (built once + memoized there). */
	get apis(): ApiClients {
		return this.getIntegrationService().apis;
	}

	async get(providerId: IntegrationIds): Promise<IntegrationAuthenticationProvider> {
		return this.ensureProvider(providerId);
	}

	/** The id of the connection a descriptor naming none reads: the primary configured for its host. */
	getPrimaryConnectionId(providerId: IntegrationIds, descriptor: IntegrationAuthenticationSessionDescriptor): string {
		return this.configuredIntegrationService.resolveConnectionId(providerId, descriptor);
	}

	@debug()
	async reset(): Promise<void> {
		// TODO: This really isn't ideal, since it will only work for "cloud" providers as we won't have any more specific descriptors
		await Promise.allSettled(
			supportedIntegrationIds.map(async providerId =>
				(await this.ensureProvider(providerId)).deleteAllSessions(),
			),
		);
	}

	supports(providerId: string): boolean {
		return supportedIntegrationIds.some(id => id === providerId);
	}

	@gate()
	private async ensureProvider(providerId: IntegrationIds): Promise<IntegrationAuthenticationProvider> {
		let provider = this.providers.get(providerId);
		if (provider != null) return provider;

		// The host resolves credentials; persisted providers also use the package's connection storage.
		const hostProvider = await this.ctx.hooks?.createAuthenticationProvider?.({
			id: providerId,
		});
		if (hostProvider != null) {
			provider = hostProvider.persistSessions
				? new HostIntegrationAuthenticationProvider(
						this,
						this.configuredIntegrationService,
						providerId,
						hostProvider,
					)
				: new ObservedAuthenticationProvider(
						hostProvider,
						isSelfManagedHostIntegrationId(providerId),
						(publication, domains) =>
							this.getIntegrationService().onSessionPublishing(providerId, publication, domains),
					);
			this.providers.set(providerId, provider);
			return provider;
		}

		provider = new HostIntegrationAuthenticationProvider(this, this.configuredIntegrationService, providerId);
		this.providers.set(providerId, provider);
		return provider;
	}
}
