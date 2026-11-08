import { RequestRateLimitError } from '@gitlens/git/errors.js';
import { Emitter } from '@gitlens/utils/event.js';
import type {
	GetSessionOptions,
	IntegrationAuthenticationSessionDescriptor,
} from '../authentication/integrationAuthenticationProvider.js';
import type {
	CloudIntegrationConnection,
	CloudIntegrationType,
	ProviderAuthenticationSession,
} from '../authentication/models.js';
import { toCloudIntegrationType } from '../authentication/models.js';
import type { IntegrationIds } from '../constants.js';
import type { IntegrationServiceHooks } from '../context.js';
import { hostFromDomain } from '../utils/domain.utils.js';
import { isSelfManagedHostIntegrationId } from '../utils/integration.utils.js';
import type { FakeRuntime } from './fakeRuntime.js';

type Credential = {
	tokenId?: string;
	provider: CloudIntegrationType;
	type: 'oauth' | 'pat';
	domain?: string;
	accountName?: string;
	accessToken: string;
	expiresIn?: number;
	scopes?: string;
	appKey?: string;
	secondaries?: Credential[];
};

/** Adapt the existing mocked credential issuer to the provider-owned auth contract.
 * The provider read assertions and concurrency tests continue to exercise the real integration service.
 * This adapter is test-only: the production package contains no credential-issuer HTTP client. */
export function createMockCredentialSource(runtime: FakeRuntime): IntegrationServiceHooks {
	let inventory: CloudIntegrationConnection[] = [];

	async function readToken(id: IntegrationIds, path: string, refreshToken?: string): Promise<Credential | undefined> {
		const response = await runtime.account.fetchGkApi(
			path,
			refreshToken ? { method: 'POST', body: JSON.stringify({ access_token: refreshToken }) } : { method: 'GET' },
		);
		if (!response.ok) {
			runtime.hooks?.connection?.onConnectionFetchFailed?.({
				id: id,
				code: response.status,
				refreshing: refreshToken != null,
			});
			if ([400, 404, 410, 422].includes(response.status)) return undefined;

			const error = new Error(`Credential source failed: ${response.status}`);
			throw response.status === 429 ? new RequestRateLimitError(error, undefined, undefined) : error;
		}

		return ((await response.json()) as { data?: Credential }).data;
	}

	async function resolve(
		id: IntegrationIds,
		descriptor: IntegrationAuthenticationSessionDescriptor,
		options?: GetSessionOptions,
	): Promise<ProviderAuthenticationSession | undefined> {
		if ((await runtime.account.getAccount()) == null) return undefined;

		if (options?.forceNewSession && !(await runtime.account.connect({ integrationIds: [id] }))) return undefined;

		const type = toCloudIntegrationType[id];
		if (type == null) return undefined;

		const matches = inventory.filter(
			connection =>
				connection.provider === type &&
				(!isSelfManagedHostIntegrationId(id) ||
					hostFromDomain(connection.domain) === hostFromDomain(descriptor.domain)),
		);
		const known = descriptor.connectionId
			? matches.find(connection => connection.id === descriptor.connectionId)
			: (matches.find(connection => connection.primary) ?? matches[0]);

		const connectionId = descriptor.connectionId || known?.id;
		const path = connectionId
			? `v1/provider-tokens/tokens/${encodeURIComponent(connectionId)}`
			: `v1/provider-tokens/${type}`;
		let credential = await readToken(id, path);
		if (credential == null) return undefined;

		if (options?.refreshRejectedToken) {
			try {
				credential = await readToken(id, `${path}/refresh`, credential.accessToken);
				credential ??= await readToken(id, path);
			} catch {
				credential = await readToken(id, path);
			}

			if (credential == null) return undefined;
		}

		const domain = credential.domain || known?.domain || descriptor.domain;
		return {
			id: credential.tokenId || connectionId || descriptor.domain,
			accessToken: credential.accessToken,
			account: { id: '', label: '' },
			scopes: credential.scopes?.split(',').filter(Boolean) ?? [],
			cloud: true,
			type: credential.type,
			domain: isSelfManagedHostIntegrationId(id)
				? credential.domain
					? (hostFromDomain(credential.domain) ?? '')
					: ''
				: descriptor.domain,
			baseUrl: credential.domain || undefined,
			expiresAt: new Date(Date.now() + (credential.expiresIn || 2 ** 30 - 1) * 1000),
			appKey: credential.appKey,
		};
	}

	return {
		getConnections: async () => {
			if ((await runtime.account.getAccount()) == null) return [];

			const response = await runtime.account.fetchGkApi('v1/provider-tokens', { method: 'GET' });
			if (!response.ok) {
				runtime.hooks?.connection?.onConnectionsFetchFailed?.({ code: response.status });
				return undefined;
			}

			const data = ((await response.json()) as { data?: Credential[] }).data;
			inventory = [];
			for (const item of Array.isArray(data) ? data : []) {
				inventory.push({
					id: item.tokenId,
					provider: item.provider,
					type: item.type,
					domain: item.domain ?? '',
					primary: true,
					accountName: item.accountName,
				});
				for (const secondary of item.secondaries ?? []) {
					inventory.push({
						id: secondary.tokenId,
						provider: secondary.provider ?? item.provider,
						type: secondary.type,
						domain: secondary.domain || item.domain || '',
						primary: false,
						accountName: secondary.accountName,
					});
				}
			}

			return inventory;
		},
		createAuthenticationProvider: async ({ id }) => {
			const emitter = new Emitter<void>();
			return {
				persistSessions: true,
				onDidChange: emitter.event,
				getSession: (descriptor, options) => resolve(id, descriptor, options),
				deleteSession: () => Promise.resolve(),
				deleteAllSessions: () => Promise.resolve(),
				dispose: () => emitter.dispose(),
			};
		},
	};
}
