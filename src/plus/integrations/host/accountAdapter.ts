import type { AuthenticationSessionsChangeEvent, Disposable } from 'vscode';
import { authentication, commands } from 'vscode';
import type { IntegrationIds } from '@gitlens/integrations/constants.js';
import type { AccountProvider } from '@gitlens/integrations/context.js';
import { Emitter } from '@gitlens/utils/event.js';

/** Local account adapter retained for integrations that share the package service contract. */
export function createAccountAdapter(disposables: Disposable[]): AccountProvider {
	const onDidChange = new Emitter<void>();
	const onDidCheckIn = new Emitter<{ force?: boolean }>();
	const onDidChangeSessions = new Emitter<AuthenticationSessionsChangeEvent>();
	disposables.push(
		onDidChange,
		onDidCheckIn,
		onDidChangeSessions,
		authentication.onDidChangeSessions(e =>
			onDidChangeSessions.fire({ provider: { id: e.provider.id, label: e.provider.label } }),
		),
	);

	const account: AccountProvider = {
		getAccount: () => Promise.resolve(undefined),
		onDidChange: onDidChange.event,
		onDidCheckIn: onDidCheckIn.event,
		onDidChangeSessions: onDidChangeSessions.event,
		isTrialOrPaid: () => Promise.resolve(true),
		connect: (_options: { integrationIds?: IntegrationIds[] }) => Promise.resolve(false),
		openManagement: async () => {
			await commands.executeCommand('workbench.action.openSettings', '@ext:eamodio.gitlens integrations');
			return true;
		},
	};

	return account;
}
