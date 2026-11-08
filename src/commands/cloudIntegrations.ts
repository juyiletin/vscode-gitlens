import { l10n, window } from 'vscode';
import { supportedCloudIntegrationDescriptors } from '@gitlens/integrations/constants.js';
import type { SupportedCloudIntegrationIds } from '@gitlens/integrations/constants.js';
import type { Source } from '../constants.telemetry.js';
import type { Container } from '../container.js';
import { command } from '../system/-webview/command.js';
import { GlCommandBase } from './commandBase.js';

export interface ManageCloudIntegrationsCommandArgs {
	source?: Source;
}

export interface ConnectCloudIntegrationsCommandArgs {
	integrationIds?: SupportedCloudIntegrationIds[];
	source?: Source;
}

@command()
export class ManageCloudIntegrationsCommand extends GlCommandBase {
	constructor(private readonly container: Container) {
		super('gitlens.plus.cloudIntegrations.manage');
	}

	async execute(args?: ManageCloudIntegrationsCommandArgs): Promise<void> {
		await this.container.integrations.manageCloudIntegrations(args?.source);
	}
}

@command()
export class ConnectCloudIntegrationsCommand extends GlCommandBase {
	constructor(private readonly container: Container) {
		super('gitlens.plus.cloudIntegrations.connect');
	}

	async execute(args?: ConnectCloudIntegrationsCommandArgs): Promise<void> {
		let integrationIds = args?.integrationIds;
		if (!integrationIds?.length) {
			const selection = await window.showQuickPick(
				supportedCloudIntegrationDescriptors.map(item => ({ label: item.name, id: item.id })),
				{ title: l10n.t('Connect integrations like GitHub, GitLab, Azure DevOps, Jira, and more') },
			);
			if (selection == null) return;

			integrationIds = [selection.id];
		}

		await this.container.integrations.connectCloudIntegrations({ integrationIds: integrationIds }, args?.source);
	}
}
