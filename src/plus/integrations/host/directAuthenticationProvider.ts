import type { Disposable } from 'vscode';
import { authentication, l10n, window } from 'vscode';
import type {
	GetSessionOptions,
	IntegrationAuthenticationProvider,
	IntegrationAuthenticationSessionDescriptor,
} from '@gitlens/integrations/authentication/integrationAuthenticationProvider.js';
import type { ProviderAuthenticationSession } from '@gitlens/integrations/authentication/models.js';
import type { IntegrationIds } from '@gitlens/integrations/constants.js';
import { providersMetadata } from '@gitlens/integrations/providers/models.js';
import { Emitter } from '@gitlens/utils/event.js';
import type { Container } from '../../../container.js';
import { getBuiltInIntegrationSession } from '../../gk/utils/-webview/integrationAuthentication.utils.js';

/** Resolves credentials directly; the package's host-auth wrapper owns persistent storage and disconnects. */
export class DirectAuthenticationProvider implements IntegrationAuthenticationProvider {
	readonly persistSessions = true;
	private readonly emitter = new Emitter<void>();
	private readonly sessionListener: Disposable;
	readonly onDidChange = this.emitter.event;

	constructor(
		private readonly container: Container,
		private readonly id: IntegrationIds,
	) {
		this.sessionListener = authentication.onDidChangeSessions(e => {
			if (e.provider.id === this.id) {
				this.emitter.fire();
			}
		});
	}

	dispose(): void {
		this.sessionListener.dispose();
		this.emitter.dispose();
	}

	async validateSession(
		session: ProviderAuthenticationSession,
		descriptor: IntegrationAuthenticationSessionDescriptor,
	): Promise<ProviderAuthenticationSession | undefined> {
		if (session.cloud || session.type != null) return session;

		const current = await getBuiltInIntegrationSession(this.container, this.id, descriptor, {
			silent: true,
			account: session.account,
		});
		if (current == null || current.account.id !== session.account.id) return undefined;

		return { ...current, id: session.id };
	}

	async getSession(
		descriptor: IntegrationAuthenticationSessionDescriptor,
		options?: GetSessionOptions,
	): Promise<ProviderAuthenticationSession | undefined> {
		const interactive = !options?.sync && (options?.createIfNeeded === true || options?.forceNewSession === true);
		if (!descriptor.connectionId) {
			const session = await getBuiltInIntegrationSession(
				this.container,
				this.id,
				descriptor,
				options?.forceNewSession
					? { forceNewSession: true }
					: interactive
						? { createIfNeeded: true }
						: { silent: true },
			);
			if (session != null) return session;
		}

		if (!interactive) return undefined;

		const name = providersMetadata[this.id].name;
		let appKey: string | undefined;
		if (this.id === 'trello') {
			appKey = await window.showInputBox({
				password: true,
				ignoreFocusOut: true,
				prompt: l10n.t('Enter the {provider} API key', { provider: name }),
			});
			if (!appKey?.trim()) return undefined;
		}

		const accessToken = await window.showInputBox({
			password: true,
			ignoreFocusOut: true,
			title: l10n.t('Connect to {0}', name),
			prompt: l10n.t('Enter an access token for {0}.', name),
			validateInput: value => (value.trim() ? undefined : l10n.t('An access token is required.')),
		});
		if (!accessToken?.trim()) return undefined;

		const connectionId = descriptor.connectionId || crypto.randomUUID();
		return {
			id: connectionId,
			accessToken: accessToken.trim(),
			account: { id: connectionId, label: descriptor.domain || name },
			scopes: descriptor.scopes,
			cloud: false,
			type: this.id === 'jira' || this.id === 'trello' ? 'oauth' : 'pat',
			domain: descriptor.domain,
			baseUrl: typeof descriptor.baseUrl === 'string' ? descriptor.baseUrl : descriptor.domain,
			appKey: appKey?.trim(),
		};
	}

	// Owned sessions are deleted by HostIntegrationAuthenticationProvider; VS Code sessions are shared with other extensions.
	deleteSession(): Promise<void> {
		return Promise.resolve();
	}
	deleteAllSessions(): Promise<void> {
		return Promise.resolve();
	}
}
