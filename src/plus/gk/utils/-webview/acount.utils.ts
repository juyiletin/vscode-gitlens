import type { Uri } from 'vscode';
import { l10n, window } from 'vscode';
import type { Source } from '../../../../constants.telemetry.js';
import type { Container } from '../../../../container.js';
import type { PlusFeatures } from '../../../../features.js';

export function ensureAccount(_container: Container, _title: string, _source: Source): Promise<boolean> {
	return Promise.resolve(true);
}

export function ensureAccountQuickPick(
	_container: Container,
	_descriptionItem: unknown,
	_source: Source,
	_silent?: boolean,
): Promise<boolean> {
	return Promise.resolve(true);
}

export async function ensureFeatureAccess(
	container: Container,
	title: string,
	feature: PlusFeatures,
	_source: Source,
	repoPath?: string | Uri,
): Promise<boolean> {
	const access = await container.git.access(feature, repoPath);
	if (access.allowed) return true;

	await window.showWarningMessage(title, {
		modal: true,
		detail: l10n.t('This feature is not available for the current repository.'),
	});
	return false;
}
