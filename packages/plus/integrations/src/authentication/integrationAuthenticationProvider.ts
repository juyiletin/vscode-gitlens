import { trace } from '@gitlens/utils/decorators/log.js';
import type { Disposable } from '@gitlens/utils/disposable.js';
import type { Event } from '@gitlens/utils/event.js';
import { Emitter } from '@gitlens/utils/event.js';
import type { IntegrationIds } from '../constants.js';
import type { Sources } from '../telemetry.js';
import { areDomainsOnSameHost, hostFromDomain } from '../utils/domain.utils.js';
import { isSelfManagedHostIntegrationId } from '../utils/integration.utils.js';
import type { ConfiguredIntegrationService } from './configuredIntegrationService.js';
import type { IntegrationAuthenticationService } from './integrationAuthenticationService.js';
import type { ProviderAuthenticationSession } from './models.js';

export interface IntegrationAuthenticationProviderDescriptor {
	id: IntegrationIds;
	scopes: string[];
}

export interface IntegrationAuthenticationSessionDescriptor {
	domain: string;
	scopes: string[];
	/** When set, reads/deletes only the matching storage variant. */
	cloud?: boolean;
	/**
	 * Targets a specific connection when a provider has multiple accounts connected. When omitted,
	 * operations resolve to the provider's primary connection (see
	 * {@link ConfiguredIntegrationService.resolveConnectionId}).
	 */
	connectionId?: string;
	[key: string]: unknown;
}

/**
 * Options for {@link IntegrationAuthenticationProvider.getSession}. The two variants keep `sync` exclusive
 * with the interactive flags: a sync resolves the provider's existing credentials, so it must never open a connect
 * window.
 *
 * `refreshRejectedToken` marks the stored token as known-refused by the provider (an `AuthenticationError` on
 * a previous read), which forces the host to resolve credentials even when the token's expiry still claims
 * it is valid — the case a purely time-based refresh cannot see.
 *
 * `refetch` (sync only) fetches a fresh token instead of serving the stored one, WITHOUT deleting the stored one
 * first: it is replaced only once the fetch returns a session. A forced re-sync used to delete it up front, so a
 * fetch that failed transiently left the connection with no token at all, and every read
 * until the next good sync reported it as gone (gitkraken/kepler#3546).
 */
export type GetSessionOptions =
	| {
			createIfNeeded?: boolean;
			forceNewSession?: boolean;
			sync?: never;
			refetch?: never;
			refreshRejectedToken?: boolean;
			source?: Sources;
	  }
	| {
			createIfNeeded?: never;
			forceNewSession?: never;
			sync: boolean;
			refetch?: boolean;
			refreshRejectedToken?: boolean;
			source?: Sources;
	  };

/**
 * What {@link IntegrationAuthenticationProviderBase.getSession} passes down once it has decided the stored
 * session can't be served as-is. `refreshIfExpired` is its own conclusion, not a caller's option.
 */
type GetNewSessionOptions = GetSessionOptions & { refreshIfExpired?: boolean };

export interface IntegrationAuthenticationProvider extends Disposable {
	/** Let the integration service persist credentials returned by this interactive resolver. */
	readonly persistSessions?: boolean;
	/** Revalidates persisted credentials owned by an external session manager before reuse. */
	validateSession?(
		session: ProviderAuthenticationSession,
		descriptor: IntegrationAuthenticationSessionDescriptor,
	): Promise<ProviderAuthenticationSession | undefined>;
	/**
	 * Clears the stored secret for one connection only (never the whole provider). Unlike
	 * {@link deleteAllSessions}, this by default leaves the descriptor in `integrations:configured` — its
	 * primary caller is a forced re-sync, which needs `getConfigured()` to keep reporting the connection
	 * while a fresh session is fetched to replace the deleted secret. Implementers should not treat this as
	 * a full disconnect. Pass `preserveConfigured: false` to also drop the descriptor (e.g. when the
	 * re-sync's replacement fetch failed and the connection should no longer be reported as connected).
	 */
	deleteSession(
		descriptor: IntegrationAuthenticationSessionDescriptor,
		options?: { preserveConfigured?: boolean },
	): Promise<void>;
	deleteAllSessions(descriptor?: IntegrationAuthenticationSessionDescriptor): Promise<void>;
	/**
	 * Resolves the session for `descriptor`, from storage when it is still usable and from the host
	 * otherwise. See {@link GetSessionOptions}.
	 */
	getSession(
		descriptor: IntegrationAuthenticationSessionDescriptor,
		options?: GetSessionOptions,
	): Promise<ProviderAuthenticationSession | undefined>;
	get onDidChange(): Event<void>;
}

abstract class IntegrationAuthenticationProviderBase<
	ID extends IntegrationIds = IntegrationIds,
> implements IntegrationAuthenticationProvider {
	protected readonly disposables: Disposable[] = [];

	constructor(
		protected readonly authenticationService: IntegrationAuthenticationService,
		protected readonly configuredIntegrationService: ConfiguredIntegrationService,
		protected readonly host?: IntegrationAuthenticationProvider,
	) {}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}

	private readonly _onDidChange = new Emitter<void>();
	get onDidChange(): Event<void> {
		return this._onDidChange.event;
	}

	protected abstract get authProviderId(): ID;

	@trace()
	async deleteSession(
		descriptor: IntegrationAuthenticationSessionDescriptor,
		options?: { preserveConfigured?: boolean },
	): Promise<void> {
		if (descriptor.cloud == null && this.authenticationService.ctx.hooks?.getConnections != null) {
			descriptor = { ...descriptor, cloud: true };
		}

		const domain = isSelfManagedHostIntegrationId(this.authProviderId) ? descriptor?.domain : undefined;
		const configured = this.configuredIntegrationService.getConfigured(this.authProviderId, {
			domain: domain,
		});

		// Scope the descriptor to cloud so resolveConnectionId targets the cloud variant's id: this is a
		// cloud-only delete, and a mixed local+cloud connection whose local descriptor is primary would
		// otherwise resolve the local id and leave the cloud secret intact.
		await this.configuredIntegrationService.deleteStoredSessions(
			this.authProviderId,
			descriptor,
			descriptor.cloud,
			{
				preserveConfigured: options?.preserveConfigured ?? true,
			},
		);

		if (configured?.length) {
			this.fireChange();
		}
	}

	@trace()
	async deleteAllSessions(descriptor?: IntegrationAuthenticationSessionDescriptor): Promise<void> {
		// Self-managed providers group every host under one provider id, so scope the clear to this
		// descriptor's host when given; for cloud providers the domain stays undefined here, clearing every account.
		const domain = isSelfManagedHostIntegrationId(this.authProviderId) ? descriptor?.domain : undefined;
		const configured = this.configuredIntegrationService.getConfigured(this.authProviderId, {
			domain: domain,
		});

		await this.configuredIntegrationService.deleteAllStoredSessions(this.authProviderId, undefined, domain);

		if (configured?.length) {
			this.fireChange();
		}
	}

	@trace()
	async getSession(
		descriptor: IntegrationAuthenticationSessionDescriptor,
		options?: GetSessionOptions,
	): Promise<ProviderAuthenticationSession | undefined> {
		if (options?.sync && descriptor.cloud == null && this.authenticationService.ctx.hooks?.getConnections != null) {
			descriptor = { ...descriptor, cloud: true };
		}

		if (descriptor.connectionId && descriptor.cloud == null) {
			const configured = this.configuredIntegrationService.getConfigured(this.authProviderId, {
				domain: isSelfManagedHostIntegrationId(this.authProviderId) ? descriptor.domain : undefined,
			});
			const selected =
				configured.find(item => item.id === descriptor.connectionId && item.cloud) ??
				configured.find(item => item.id === descriptor.connectionId);
			descriptor = { ...descriptor, cloud: selected?.cloud ?? true };
		}

		let session;
		let previousToken;
		let refetched: ProviderAuthenticationSession | undefined;
		let signOutMark: number;
		if (options?.forceNewSession) {
			if (isSelfManagedHostIntegrationId(this.authProviderId)) {
				const connectionId =
					descriptor.connectionId ||
					this.configuredIntegrationService.resolveConnectionId(this.authProviderId, descriptor);
				if (
					!this.configuredIntegrationService.isConnectionConfiguredForHost(
						this.authProviderId,
						connectionId,
						descriptor.domain,
					)
				) {
					return undefined;
				}

				descriptor = { ...descriptor, connectionId: connectionId };
			}
			// Cloud-only delete (see deleteSession): scope to cloud so the cloud variant's id is cleared even
			// when a mixed local+cloud connection's local descriptor is primary. A sign-out, so a token fetched before
			// it is not stored back; the mark is taken after it, so this session's own fetch is not refused.
			await this.configuredIntegrationService.deleteStoredSessions(
				this.authProviderId,
				descriptor,
				descriptor.cloud,
				{
					signOut: true,
					preserveConfigured: isSelfManagedHostIntegrationId(this.authProviderId),
				},
			);
			signOutMark = this.configuredIntegrationService.getSignOutMark();
		} else {
			// Taken before the stored-token read (a sign-out landing during the read is ordered after it by the storage
			// lock, so it counts either way).
			signOutMark = this.configuredIntegrationService.getSignOutMark();
			let stored = await this.configuredIntegrationService.getStoredSession(this.authProviderId, descriptor);
			previousToken = stored?.accessToken;
			if (stored != null && this.host?.validateSession != null) {
				const validated = await this.host.validateSession(stored, descriptor);
				if (
					validated != null &&
					validated !== stored &&
					!(await this.configuredIntegrationService.storeSession(this.authProviderId, validated, {
						signOutMark: signOutMark,
					}))
				) {
					stored = undefined;
				} else {
					stored = validated;
				}
			}

			if (options?.sync && options.refetch) {
				refetched = stored;
			} else {
				session = stored;
			}
		}

		const isExpiredSession = session?.expiresAt != null && new Date(session.expiresAt).getTime() < Date.now();
		// A rejected token has to re-resolve even when the stored session looks perfectly healthy: that is
		// the whole point — the provider refused it while its expiry still says valid. Without this the
		// stored session short-circuits here and the refresh below is never reached.
		const refreshRejectedToken = options?.refreshRejectedToken === true && session != null;
		if (session == null || isExpiredSession || refreshRejectedToken) {
			session = await this.getNewSession(descriptor, {
				...options,
				refreshIfExpired: isExpiredSession,
				refreshRejectedToken: refreshRejectedToken,
			});
			// Stored only when no sign-out landed since the mark (checked and written under the storage lock): a token
			// read or fetched across a disconnect, a reauthentication or the connection's removal is not reconnected.
			if (
				session != null &&
				!(await this.configuredIntegrationService.storeSession(this.authProviderId, session, {
					signOutMark: signOutMark,
				}))
			) {
				session = undefined;
			}

			if (session != null) {
				// The replacement belongs to a different connection (the cloud's primary moved to another
				// account), so it was stored beside the one it replaces rather than over it. Drop the old token
				// as the up-front delete used to, or an unscoped read would keep resolving it until the next sync.
				if (refetched?.id != null && refetched.id !== session.id) {
					await this.configuredIntegrationService.deleteStoredSessions(
						this.authProviderId,
						{ ...descriptor, connectionId: refetched.id, cloud: refetched.cloud },
						refetched.cloud,
						{ preserveConfigured: true },
					);
				}
			}
		}

		if (previousToken !== session?.accessToken) {
			this.fireChange();
		}

		return session;
	}

	protected abstract getNewSession(
		descriptor: IntegrationAuthenticationSessionDescriptor,
		options?: GetNewSessionOptions,
	): Promise<ProviderAuthenticationSession | undefined>;

	protected fireChange(): void {
		queueMicrotask(() => this._onDidChange.fire());
	}
}

/** Wraps a consumer-owned provider with the package's local secret storage and connection descriptors. */
export class HostIntegrationAuthenticationProvider<
	ID extends IntegrationIds = IntegrationIds,
> extends IntegrationAuthenticationProviderBase<ID> {
	constructor(
		authenticationService: IntegrationAuthenticationService,
		configuredIntegrationService: ConfiguredIntegrationService,
		private readonly _authProviderId: ID,
		host?: IntegrationAuthenticationProvider,
	) {
		super(authenticationService, configuredIntegrationService, host);
		if (host == null) return;

		this.disposables.push(
			host.onDidChange(() => this.fireChange()),
			{ dispose: () => host.dispose() },
		);
	}

	protected get authProviderId(): ID {
		return this._authProviderId;
	}

	protected async getNewSession(
		descriptor: IntegrationAuthenticationSessionDescriptor,
		options?: GetNewSessionOptions,
	): Promise<ProviderAuthenticationSession | undefined> {
		if (this.host == null) return undefined;

		if (
			!options?.sync &&
			!options?.createIfNeeded &&
			!options?.forceNewSession &&
			!options?.refreshIfExpired &&
			!options?.refreshRejectedToken
		) {
			return undefined;
		}

		const hostOptions: GetSessionOptions = options?.forceNewSession
			? { forceNewSession: true }
			: options?.createIfNeeded
				? { createIfNeeded: true }
				: { sync: true, refetch: true, refreshRejectedToken: options?.refreshRejectedToken };
		let session = await this.host.getSession(descriptor, hostOptions);
		if (session == null || !isSelfManagedHostIntegrationId(this.authProviderId)) return session;

		const connectionId =
			descriptor.connectionId ||
			this.configuredIntegrationService.resolveConnectionId(this.authProviderId, descriptor);
		const configured = this.configuredIntegrationService
			.getConfigured(this.authProviderId)
			.find(item => item.id === connectionId);
		if (!session.domain) {
			if (
				!this.configuredIntegrationService.isConnectionConfiguredForHost(
					this.authProviderId,
					connectionId,
					descriptor.domain,
				)
			) {
				return undefined;
			}

			session = {
				...session,
				domain: descriptor.domain,
				baseUrl: session.baseUrl || configured?.baseUrl || configured?.domain,
			};
		}

		if (!areDomainsOnSameHost(session.domain, descriptor.domain)) return undefined;

		return {
			...session,
			domain: hostFromDomain(session.domain) ?? descriptor.domain,
			baseUrl: session.baseUrl || configured?.baseUrl || session.domain,
		};
	}
}
