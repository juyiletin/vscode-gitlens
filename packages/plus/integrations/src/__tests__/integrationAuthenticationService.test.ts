import * as assert from 'node:assert/strict';
import { suite, test } from 'mocha';
import { Emitter } from '@gitlens/utils/event.js';
import { ConfiguredIntegrationService } from '../authentication/configuredIntegrationService.js';
import { HostIntegrationAuthenticationProvider } from '../authentication/integrationAuthenticationProvider.js';
import { IntegrationAuthenticationService } from '../authentication/integrationAuthenticationService.js';
import { createManualTokenAuthProvider } from '../authentication/manualTokenProvider.js';
import type { ProviderAuthenticationSession } from '../authentication/models.js';
import {
	GitCloudHostIntegrationId,
	GitSelfManagedHostIntegrationId,
	IssuesCloudHostIntegrationId,
} from '../constants.js';
import type { IntegrationService } from '../integrationService.js';
import { createFakeRuntime } from './fakeRuntime.js';

suite('Persisted provider session validation', () => {
	test('revalidates an owned session before reuse and stops serving it after external sign-out', async () => {
		const ctx = createFakeRuntime();
		const configured = new ConfiguredIntegrationService(ctx);
		const auth = new IntegrationAuthenticationService(configured, ctx, () => {
			throw new Error('Validation must not require the integration service');
		});
		const stored: ProviderAuthenticationSession = {
			id: 'native-session',
			accessToken: 'old-token',
			account: { id: 'native-account', label: 'Native Account' },
			scopes: ['repo'],
			cloud: false,
			type: undefined,
			domain: 'github.com',
		};
		await configured.storeSession(GitCloudHostIntegrationId.GitHub, stored);
		let current: ProviderAuthenticationSession | undefined = { ...stored, accessToken: 'new-token' };
		let validations = 0;
		const changed = new Emitter<void>();
		const provider = new HostIntegrationAuthenticationProvider(auth, configured, GitCloudHostIntegrationId.GitHub, {
			onDidChange: changed.event,
			validateSession: async session => {
				assert.strictEqual(session.account.id, stored.account.id);
				validations++;
				return current;
			},
			getSession: async () => undefined,
			deleteSession: async () => {},
			deleteAllSessions: async () => {},
			dispose: () => changed.dispose(),
		});
		const descriptor = { domain: stored.domain, scopes: ['repo'], connectionId: stored.id, cloud: false };
		try {
			assert.strictEqual((await provider.getSession(descriptor))?.accessToken, 'new-token');
			assert.strictEqual(
				(await configured.getStoredSession(GitCloudHostIntegrationId.GitHub, descriptor))?.accessToken,
				'new-token',
			);
			current = undefined;
			assert.strictEqual(await provider.getSession(descriptor), undefined);
			assert.strictEqual(validations, 2);
		} finally {
			provider.dispose();
			auth.dispose();
			configured.dispose();
		}
	});
});

/**
 * Verifies IntegrationAuthenticationService.supports (#5438): it gates whether a disconnect offers to sign
 * out of the cloud token, so every provider that registers a cloud auth provider must report true — Trello
 * and Linear included (previously omitted, leaving their backend token + connection intact on disable).
 */

function createAuthService(): IntegrationAuthenticationService {
	const ctx = createFakeRuntime();
	const configured = new ConfiguredIntegrationService(ctx);
	// supports() reads none of these collaborators, so a throwaway service getter is fine.
	return new IntegrationAuthenticationService(configured, ctx, () => undefined as unknown as IntegrationService);
}

suite('IntegrationAuthenticationService.supports (#5438)', () => {
	test('reports true for the cloud-backed issue trackers, including Trello and Linear', () => {
		const auth = createAuthService();

		assert.equal(auth.supports(IssuesCloudHostIntegrationId.Jira), true);
		assert.equal(auth.supports(IssuesCloudHostIntegrationId.Linear), true, 'Linear offers cloud sign-out');
		assert.equal(auth.supports(IssuesCloudHostIntegrationId.Trello), true, 'Trello offers cloud sign-out');
	});

	test('still reports true for the git hosts', () => {
		const auth = createAuthService();

		assert.equal(auth.supports(GitCloudHostIntegrationId.GitHub), true);
		assert.equal(auth.supports(GitCloudHostIntegrationId.GitLab), true);
		assert.equal(auth.supports(GitCloudHostIntegrationId.Bitbucket), true);
		assert.equal(auth.supports(GitCloudHostIntegrationId.AzureDevOps), true);
		assert.equal(auth.supports(GitSelfManagedHostIntegrationId.AzureDevOpsServer), true);
	});

	test('reports false for an unknown provider id', () => {
		const auth = createAuthService();

		assert.equal(auth.supports('not-a-provider'), false);
	});

	test('manual token auth preserves the optional appKey on the session', async () => {
		const provider = createManualTokenAuthProvider({
			id: IssuesCloudHostIntegrationId.Trello,
			token: 'tok',
			account: { id: 'me', label: 'CLI Token' },
			domain: 'trello.com',
			appKey: 'trello-app-key',
		});

		const session = await provider.getSession({ domain: 'trello.com', scopes: [] });

		assert.equal(session?.appKey, 'trello-app-key');
		provider.dispose();
	});

	test('manual token auth rejects a specific connection selector', async () => {
		const provider = createManualTokenAuthProvider({
			id: GitCloudHostIntegrationId.GitHub,
			token: 'tok',
			account: { id: 'me', label: 'CLI Token' },
			domain: 'github.com',
		});

		const session = await provider.getSession({
			domain: 'github.com',
			scopes: [],
			connectionId: 'invented-connection',
		});

		assert.equal(session, undefined);
		provider.dispose();
	});
});
