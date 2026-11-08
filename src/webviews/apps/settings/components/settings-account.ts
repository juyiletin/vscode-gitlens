import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import * as l10n from '@vscode/l10n';
import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { SubscriptionContextState } from '../../shared/contexts/subscription.js';
import { subscriptionContext } from '../../shared/contexts/subscription.js';
import type { SettingsActions } from '../actions.js';

declare global {
	interface HTMLElementTagNameMap {
		['gl-settings-account']: GlSettingsAccount;
	}
}

@customElement('gl-settings-account')
export class GlSettingsAccount extends SignalWatcher(LitElement) {
	@property({ attribute: false })
	actions?: SettingsActions;

	@consume({ context: subscriptionContext, subscribe: true })
	private _subscription!: SubscriptionContextState;

	override render(): unknown {
		const subscription = this._subscription.subscription.get();
		if (subscription === undefined) return nothing;

		return html`<section role="status">
			<h2>${subscription.plan.effective.name}</h2>
			<p>${l10n.t('Local Pro access is enabled for this fork.')}</p>
		</section>`;
	}
}
