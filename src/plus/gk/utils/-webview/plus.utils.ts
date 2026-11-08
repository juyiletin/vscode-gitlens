import type { MessageItem } from 'vscode';
import { l10n, window } from 'vscode';
import type { Source } from '../../../../constants.telemetry.js';
import type { Container } from '../../../../container.js';
import { configuration } from '../../../../system/-webview/configuration.js';
import { getContext } from '../../../../system/-webview/context.js';
import { isSubscriptionPaidPlan } from '../subscription.utils.js';

export function arePlusFeaturesEnabled(): boolean {
	const enabled = configuration.get('plusFeatures.enabled', undefined, true);
	return enabled ? true : !getContext('gitlens:plus:disabled');
}

export async function ensurePlusFeaturesEnabled(): Promise<boolean> {
	if (arePlusFeaturesEnabled()) return true;

	const confirm: MessageItem = { title: l10n.t('Enable') };
	const cancel: MessageItem = { title: l10n.t('Cancel'), isCloseAffordance: true };
	const result = await window.showInformationMessage(
		l10n.t('Pro features are currently disabled. Would you like to enable them?'),
		{ modal: true },
		confirm,
		cancel,
	);

	if (result !== confirm) return false;

	await configuration.updateEffective('plusFeatures.enabled', true);
	return true;
}

export async function ensurePaidPlan(container: Container, _title: string, _source: Source): Promise<boolean> {
	return isSubscriptionPaidPlan((await container.subscription.getSubscription()).plan.effective.id);
}
