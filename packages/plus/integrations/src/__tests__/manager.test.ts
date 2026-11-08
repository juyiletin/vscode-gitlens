import * as assert from 'node:assert/strict';
import { suite, test } from 'mocha';
import { Emitter } from '@gitlens/utils/event.js';
import { ConfiguredIntegrationService } from '../authentication/configuredIntegrationService.js';
import type { ProviderAuthenticationSession } from '../authentication/models.js';
import { GitCloudHostIntegrationId } from '../constants.js';
import { createIntegrationService as createIntegrationManager } from '../integrationService.js';
import { createFakeRuntime } from './fakeRuntime.js';

function cloudSession(id: string): ProviderAuthenticationSession {
	return {
		id: id,
		accessToken: `token-${id}`,
		account: { id: `acct-${id}`, label: id },
		scopes: ['repo'],
		cloud: true,
		type: 'oauth',
		domain: 'github.com',
	};
}

suite('createIntegrationManager — vertical-slice smoke', () => {
	test('constructs and disposes cleanly with a fake runtime', () => {
		const runtime = createFakeRuntime();
		const manager = createIntegrationManager(runtime);

		// Manager exposes the expected surface
		assert.ok(typeof manager.get === 'function', 'manager.get exists');
		assert.ok(typeof manager.dispose === 'function', 'manager.dispose exists');
		assert.ok(typeof manager.connectCloudIntegrations === 'function');
		assert.ok(typeof manager.connectSecondary === 'function');

		// Disposing should not throw
		manager.dispose();
	});

	test('connectSecondary asks for a new credential even when the provider is connected', async () => {
		const runtime = createFakeRuntime();
		await new ConfiguredIntegrationService(runtime).storeSession(
			GitCloudHostIntegrationId.GitHub,
			cloudSession('tok1'),
		);
		const hooks = runtime.hooks!;
		const changed = new Emitter<void>();
		let prompts = 0;
		hooks.createAuthenticationProvider = async () => ({
			persistSessions: true,
			onDidChange: changed.event,
			getSession: async (_descriptor, options) => {
				if (options?.createIfNeeded) {
					prompts++;
				}

				return undefined;
			},
			deleteSession: async () => {},
			deleteAllSessions: async () => {},
			dispose: () => changed.dispose(),
		});
		const manager = createIntegrationManager(runtime);
		assert.equal(await manager.connectSecondary(GitCloudHostIntegrationId.GitHub, { source: 'test' }), false);
		assert.equal(prompts, 1);
		assert.deepEqual(
			manager.getConfigured(GitCloudHostIntegrationId.GitHub).map(connection => connection.id),
			['tok1'],
		);
		manager.dispose();
	});

	test('connectSecondary persists a second direct connection while keeping its primary', async () => {
		const runtime = createFakeRuntime();
		await new ConfiguredIntegrationService(runtime).storeSession(
			GitCloudHostIntegrationId.GitHub,
			cloudSession('tok1'),
		);
		const hooks = runtime.hooks!;
		const changed = new Emitter<void>();
		hooks.createAuthenticationProvider = async () => ({
			persistSessions: true,
			onDidChange: changed.event,
			getSession: async () => cloudSession('tok2'),
			deleteSession: async () => {},
			deleteAllSessions: async () => {},
			dispose: () => changed.dispose(),
		});
		const manager = createIntegrationManager(runtime);
		assert.equal(await manager.connectSecondary(GitCloudHostIntegrationId.GitHub, { source: 'test' }), true);
		assert.deepEqual(
			manager
				.getConfigured(GitCloudHostIntegrationId.GitHub)
				.map(connection => connection.id)
				.sort(),
			['tok1', 'tok2'],
		);
		assert.equal(
			manager.getConfigured(GitCloudHostIntegrationId.GitHub).find(connection => connection.primary)?.id,
			'tok1',
		);
		manager.dispose();
	});

	test('connectSecondary reports a replacement connection without reviving the retired account', async () => {
		const runtime = createFakeRuntime();
		await new ConfiguredIntegrationService(runtime).storeSession(
			GitCloudHostIntegrationId.GitHub,
			cloudSession('tok1'),
		);
		const hooks = runtime.hooks!;
		const changed = new Emitter<void>();
		let manager: ReturnType<typeof createIntegrationManager>;
		hooks.createAuthenticationProvider = async () => ({
			persistSessions: true,
			onDidChange: changed.event,
			getSession: async () => {
				await manager.deleteConnection(GitCloudHostIntegrationId.GitHub, 'tok1');
				return cloudSession('tok2');
			},
			deleteSession: async () => {},
			deleteAllSessions: async () => {},
			dispose: () => changed.dispose(),
		});
		manager = createIntegrationManager(runtime);
		assert.equal(await manager.connectSecondary(GitCloudHostIntegrationId.GitHub, { source: 'test' }), true);
		assert.deepEqual(
			manager.getConfigured(GitCloudHostIntegrationId.GitHub).map(connection => connection.id),
			['tok2'],
		);
		manager.dispose();
	});

	test('emits integration.connection.started telemetry on connectCloudIntegrations', async () => {
		const runtime = createFakeRuntime();
		// Short-circuit the host connect flow so the orchestration returns immediately (onStarted still fires).
		runtime.account.connect = async () => false;
		const manager = createIntegrationManager(runtime);

		await manager.connectCloudIntegrations(
			{ integrationIds: [GitCloudHostIntegrationId.GitHub] },
			{ source: 'test' },
		);

		const startEvents = runtime.emittedEvents.filter(e => e.event === 'integration.connection.started');
		assert.ok(startEvents.length >= 1, 'started event should fire at least once');
		assert.deepEqual(startEvents[0].source, { source: 'test' });
	});

	test('connection state changes route through typed telemetry hooks', () => {
		const runtime = createFakeRuntime();
		const manager = createIntegrationManager(runtime);

		// Triggering subscription/auth events shouldn't crash the manager and
		// shouldn't emit any package events (those fire on actual state changes).
		runtime.fireSubscriptionChange();
		runtime.fireSubscriptionCheckIn();
		runtime.fireAuthenticationSessionChange('github');

		assert.equal(
			runtime.emittedEvents.filter(e => e.event === 'integration.connection.hosting.changed').length,
			0,
			'no spurious hosting.changed events from idle transitions',
		);

		manager.dispose();
	});

	test('auth session change refreshes only the matching integration', async () => {
		const runtime = createFakeRuntime();
		const manager = createIntegrationManager(runtime);

		// Instantiating caches each integration in the manager's `_integrations` map, which is what the
		// authentication-session handler iterates over.
		const gh = await manager.get(GitCloudHostIntegrationId.GitHub);
		const gl = await manager.get(GitCloudHostIntegrationId.GitLab);

		let ghRefreshed = 0;
		let glRefreshed = 0;
		gh.refresh = () => void ghRefreshed++; // `refresh()` is synchronous `void` — a counter stub is enough
		gl.refresh = () => void glRefreshed++;

		runtime.fireAuthenticationSessionChange(gh.authProvider.id);
		assert.equal(ghRefreshed, 1, 'matching integration refreshed');
		assert.equal(glRefreshed, 0, 'non-matching integration untouched');

		runtime.fireAuthenticationSessionChange('not-a-real-provider');
		assert.equal(ghRefreshed, 1, 'unknown provider id refreshes nothing');

		manager.dispose();
	});

	test('manager disposes cleanly and idempotently', () => {
		const runtime = createFakeRuntime();
		const manager = createIntegrationManager(runtime);

		manager.dispose();
		// dispose should be idempotent
		manager.dispose();
	});

	test('package constructs cloud auth providers directly (no host hook)', async () => {
		const runtime = createFakeRuntime();
		const manager = createIntegrationManager(runtime);
		// The package owns cloud auth-provider construction (cloud-only). Resolving any cloud integration's
		// connection state exercises that in-package lookup; a missing provider would throw "No authentication
		// provider registered", so the absence of that rejection proves the package built it itself.
		const integration = await manager.get(GitCloudHostIntegrationId.Bitbucket);
		assert.ok(integration != null, 'cloud integration resolves');
		await assert.doesNotReject(() => integration.isConnected());
		manager.dispose();
	});
});

suite('ConfiguredIntegrationService.purgeStoredConfiguration — retired-id cleanup', () => {
	test('deletes config, secrets, and connected flags for retired ids while leaving live ids intact', async () => {
		const runtime = createFakeRuntime();
		// Seed pre-cloud-only local self-managed state (the retired `github-enterprise` id) plus a live id.
		await runtime.storage.store('integrations:configured', {
			'github-enterprise': [
				{ cloud: false, integrationId: 'github-enterprise', domain: 'gh.example.com', scopes: 'repo' },
			],
			github: [{ cloud: true, integrationId: 'github', domain: 'github.com', scopes: 'repo' }],
		});
		await runtime.storage.storeSecret('integration.auth:github-enterprise|gh.example.com', '{}');
		await runtime.storage.storeSecret('integration.auth.cloud:github-enterprise|gh.example.com', '{}');
		await runtime.storage.storeWorkspace('connected:github-enterprise:gh.example.com', true);

		await new ConfiguredIntegrationService(runtime).purgeStoredConfiguration([
			'github-enterprise',
			'gitlab-self-hosted',
		]);

		const configured = runtime.storage.get<Record<string, unknown>>('integrations:configured') ?? {};
		assert.ok(!('github-enterprise' in configured), 'retired github-enterprise config removed');
		assert.ok('github' in configured, 'live github config retained');
		assert.equal(
			await runtime.storage.getSecret('integration.auth:github-enterprise|gh.example.com'),
			undefined,
			'retired local secret deleted',
		);
		assert.equal(
			await runtime.storage.getSecret('integration.auth.cloud:github-enterprise|gh.example.com'),
			undefined,
			'retired cloud secret deleted',
		);
		assert.equal(
			runtime.storage.getWorkspace('connected:github-enterprise:gh.example.com'),
			undefined,
			'retired connected flag deleted',
		);
	});
});
