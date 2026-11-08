import * as l10n from '@vscode/l10n';
import type { SettingsCategory } from '../model.js';

export const setupCategories: SettingsCategory[] = [
	{
		id: 'account',
		name: l10n.t('Features'),
		group: 'Setup',
		icon: 'account',
		hint: l10n.t('Local Pro access is enabled for this fork.'),
		controls: [
			{
				kind: 'account',
				// Search text — the rendered panel comes from the shared subscription RPC service
				label: l10n.t('Features'),
				hint: l10n.t('Local Pro access is enabled for this fork.'),
			},
		],
	},
	{
		id: 'setup',
		name: l10n.t('Get Started'),
		group: 'Setup',
		icon: 'checklist',
		hint: l10n.t('Connect your services and choose an AI provider and model.'),
		learnMoreUrl: 'https://help.gitkraken.com/gitlens/gitlens-start-here/',
		controls: [
			{
				kind: 'setup',
				// Search text — the rendered cards come from the shared RPC services
				label: l10n.t('Get started with GitLens'),
				hint: l10n.t('Connect integrations, choose an AI provider and model, set up agents'),
			},
		],
	},
];
