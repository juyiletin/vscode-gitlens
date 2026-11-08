import * as assert from 'assert';
import * as sinon from 'sinon';
import { authentication, extensions, window } from 'vscode';
import type { ProviderAuthenticationSession } from '@gitlens/integrations/authentication/models.js';
import { GitCloudHostIntegrationId, IssuesCloudHostIntegrationId } from '@gitlens/integrations/constants.js';
import type { Container } from '../../../../container.js';
import { DirectAuthenticationProvider } from '../directAuthenticationProvider.js';

suite('Direct integration credentials', () => {
	const descriptor = { domain: 'trello.com', scopes: [] };
	let sandbox: sinon.SinonSandbox;
	setup(() => {
		sandbox = sinon.createSandbox();
	});
	teardown(() => sandbox.restore());

	function createProvider(): DirectAuthenticationProvider {
		const container = { integrations: { ignoreSSLErrors: () => false } } as unknown as Container;
		return new DirectAuthenticationProvider(container, IssuesCloudHostIntegrationId.Trello);
	}

	function nativeSession(): ProviderAuthenticationSession {
		return {
			id: 'native-connection',
			accessToken: 'old-native-token',
			account: { id: 'native-account', label: 'Native Account' },
			scopes: ['repo'],
			cloud: false,
			type: undefined,
			domain: 'github.com',
		};
	}

	function createNativeProvider(): DirectAuthenticationProvider {
		sandbox.stub(extensions, 'getExtension').returns({} as ReturnType<typeof extensions.getExtension>);
		return new DirectAuthenticationProvider(
			{ integrations: { ignoreSSLErrors: () => false } } as unknown as Container,
			GitCloudHostIntegrationId.GitHub,
		);
	}

	test('refreshes native credentials silently for the original account and preserves the connection ID', async () => {
		const stored = nativeSession();
		const getSession = sandbox.stub(authentication, 'getSession').resolves({
			...stored,
			id: 'rotated-native-session',
			accessToken: 'new-native-token',
		});
		const prompt = sandbox.stub(window, 'showInputBox').rejects(new Error('Must stay silent'));
		const provider = createNativeProvider();
		try {
			const session = await provider.validateSession(stored, { domain: stored.domain, scopes: ['repo'] });
			assert.strictEqual(session?.id, stored.id);
			assert.strictEqual(session?.accessToken, 'new-native-token');
			assert.strictEqual(getSession.firstCall.args[2]?.silent, true);
			assert.deepStrictEqual(getSession.firstCall.args[2]?.account, stored.account);
			assert.strictEqual(prompt.callCount, 0);
		} finally {
			provider.dispose();
		}
	});

	test('does not reuse saved native credentials after signing out', async () => {
		sandbox.stub(authentication, 'getSession').resolves(undefined);
		const provider = createNativeProvider();
		try {
			const stored = nativeSession();
			assert.strictEqual(
				await provider.validateSession(stored, { domain: stored.domain, scopes: ['repo'] }),
				undefined,
			);
		} finally {
			provider.dispose();
		}
	});

	test('refuses a native session returned for a different account', async () => {
		const stored = nativeSession();
		sandbox.stub(authentication, 'getSession').resolves({
			...stored,
			account: { id: 'another-account', label: 'Another Account' },
		});
		const provider = createNativeProvider();
		try {
			assert.strictEqual(
				await provider.validateSession(stored, { domain: stored.domain, scopes: ['repo'] }),
				undefined,
			);
		} finally {
			provider.dispose();
		}
	});

	test('keeps manually supplied credentials independent of native sign-in', async () => {
		const getSession = sandbox.stub(authentication, 'getSession').rejects(new Error('Manual credential'));
		const stored: ProviderAuthenticationSession = { ...nativeSession(), type: 'pat' };
		const provider = createProvider();
		try {
			assert.strictEqual(
				await provider.validateSession(stored, { domain: stored.domain, scopes: ['repo'] }),
				stored,
			);
			assert.strictEqual(getSession.callCount, 0);
		} finally {
			provider.dispose();
		}
	});

	test('background resolution never prompts for credentials', async () => {
		const prompt = sandbox
			.stub(window, 'showInputBox')
			.rejects(new Error('Background authentication must be silent'));
		const provider = createProvider();
		try {
			assert.strictEqual(await provider.getSession(descriptor, { sync: true }), undefined);
			assert.strictEqual(prompt.callCount, 0);
		} finally {
			provider.dispose();
		}
	});

	test('Trello keeps its application key and token separate and masks both inputs', async () => {
		const prompt = sandbox.stub(window, 'showInputBox');
		prompt.onFirstCall().resolves(' app-key ');
		prompt.onSecondCall().resolves(' access-token ');
		const provider = createProvider();
		try {
			const session = await provider.getSession(descriptor, { createIfNeeded: true });
			assert.strictEqual(session?.appKey, 'app-key');
			assert.strictEqual(session?.accessToken, 'access-token');
			assert.strictEqual(session?.domain, descriptor.domain);
			assert.strictEqual(session?.cloud, false);
			assert.strictEqual(prompt.callCount, 2);
			assert.ok(prompt.getCalls().every(call => call.args[0]?.password === true));
		} finally {
			provider.dispose();
		}
	});

	test('cancelling the application key stops the connection before asking for a token', async () => {
		const prompt = sandbox.stub(window, 'showInputBox').resolves(undefined);
		const provider = createProvider();
		try {
			assert.strictEqual(await provider.getSession(descriptor, { createIfNeeded: true }), undefined);
			assert.strictEqual(prompt.callCount, 1);
		} finally {
			provider.dispose();
		}
	});
});
