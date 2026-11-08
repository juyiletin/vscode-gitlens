import * as assert from 'node:assert/strict';
import { suite, teardown, test } from 'mocha';
import { Emitter } from '@gitlens/utils/event.js';
import { ConfiguredIntegrationService } from '../authentication/configuredIntegrationService.js';
import { IntegrationAuthenticationService } from '../authentication/integrationAuthenticationService.js';
import type { ProviderAuthenticationSession } from '../authentication/models.js';
import type { IntegrationIds } from '../constants.js';
import { GitSelfManagedHostIntegrationId, IssuesSelfManagedHostIntegrationId } from '../constants.js';
import type { IntegrationService } from '../integrationService.js';
import { createFakeRuntime } from './fakeRuntime.js';

suite('Direct self-managed authentication', () => {
	const disposables: { dispose(): void }[] = [];
	teardown(() => {
		for (const item of disposables.splice(0)) {
			item.dispose();
		}
	});
	function session(host: string): ProviderAuthenticationSession {
		return {
			id: `${host}-token`,
			accessToken: `${host}-pat`,
			domain: `${host}.example.test`,
			scopes: [],
			cloud: false,
			type: 'pat',
			account: { id: host, label: host },
		};
	}
	async function setup(id: IntegrationIds) {
		const runtime = createFakeRuntime();
		const requested: string[] = [];
		const changed = new Emitter<void>();
		const hooks = runtime.hooks;
		if (hooks == null) throw new Error('Test hooks are unavailable');

		hooks.createAuthenticationProvider = async () => ({
			persistSessions: true,
			onDidChange: changed.event,
			getSession: async descriptor => {
				requested.push(descriptor.domain);
				return undefined;
			},
			deleteSession: async () => {},
			deleteAllSessions: async () => {},
			dispose: () => changed.dispose(),
		});
		runtime.account.fetchGkApi = () => {
			throw new Error('Direct authentication must not call GitKraken.');
		};
		const configured = new ConfiguredIntegrationService(runtime);
		for (const host of ['first', 'second']) {
			await configured.storeSession(id, session(host));
		}

		const auth = new IntegrationAuthenticationService(
			configured,
			runtime,
			() => undefined as unknown as IntegrationService,
		);
		disposables.push(auth, configured);
		return { runtime: runtime, configured: configured, provider: await auth.get(id), requested: requested };
	}
	for (const id of [
		GitSelfManagedHostIntegrationId.CloudGitHubEnterprise,
		GitSelfManagedHostIntegrationId.CloudGitLabSelfHosted,
		GitSelfManagedHostIntegrationId.AzureDevOpsServer,
		GitSelfManagedHostIntegrationId.BitbucketServer,
		IssuesSelfManagedHostIntegrationId.JiraServer,
	]) {
		test(`${id} reauthenticates one host without deleting another host's token`, async () => {
			const { runtime, provider, requested } = await setup(id);
			await provider.getSession({ domain: 'second.example.test', scopes: [] }, { forceNewSession: true });
			assert.deepEqual(requested, ['second.example.test']);
			assert.ok(await runtime.storage.getSecret(`integration.auth:${id}|first-token`));
			assert.equal(await runtime.storage.getSecret(`integration.auth:${id}|second-token`), undefined);
		});
		test(`${id} refuses a connection belonging to a different host`, async () => {
			const { runtime, provider, requested } = await setup(id);
			assert.equal(
				await provider.getSession(
					{ domain: 'first.example.test', connectionId: 'second-token', scopes: [] },
					{ forceNewSession: true },
				),
				undefined,
			);
			assert.deepEqual(requested, []);
			assert.ok(await runtime.storage.getSecret(`integration.auth:${id}|first-token`));
			assert.ok(await runtime.storage.getSecret(`integration.auth:${id}|second-token`));
		});
		test(`${id} disconnects a selected host and persists the other connection`, async () => {
			const { runtime, configured, provider } = await setup(id);
			await provider.deleteAllSessions({ domain: 'first.example.test', scopes: [] });
			assert.equal(await runtime.storage.getSecret(`integration.auth:${id}|first-token`), undefined);
			assert.ok(await runtime.storage.getSecret(`integration.auth:${id}|second-token`));
			assert.deepEqual(
				configured.getConfigured(id).map(item => item.id),
				['second-token'],
			);
		});
	}
});
