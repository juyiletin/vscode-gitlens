import type { Event } from 'vscode';
import { Disposable, EventEmitter } from 'vscode';
import { once } from '@gitlens/utils/event.js';
import { SubscriptionState } from '../../constants.subscription.js';
import type { Source } from '../../constants.telemetry.js';
import type { Container } from '../../container.js';
import type { FeaturePreview, FeaturePreviews } from '../../features.js';
import { registerCommand } from '../../system/-webview/command.js';
import { configuration } from '../../system/-webview/configuration.js';
import { setContext } from '../../system/-webview/context.js';
import type { Subscription } from './models/subscription.js';
import { getLocalSubscription } from './utils/subscription.utils.js';

export type FeaturePreviewChangeEvent = FeaturePreview;

export interface SubscriptionChangeEvent {
	readonly current: Subscription;
	readonly previous: Subscription;
	readonly etag: number;
}

export class SubscriptionService implements Disposable {
	private readonly _onDidChange = new EventEmitter<SubscriptionChangeEvent>();
	get onDidChange(): Event<SubscriptionChangeEvent> {
		return this._onDidChange.event;
	}

	private readonly _onDidChangeFeaturePreview = new EventEmitter<FeaturePreviewChangeEvent>();
	get onDidChangeFeaturePreview(): Event<FeaturePreviewChangeEvent> {
		return this._onDidChangeFeaturePreview.event;
	}

	private _disposable: Disposable;
	private readonly _subscription: Subscription = getLocalSubscription();
	private _etag: number = Date.now();

	constructor(private readonly container: Container) {
		this._disposable = Disposable.from(
			this._onDidChange,
			this._onDidChangeFeaturePreview,
			once(container.onReady)(this.onReady, this),
			configuration.onDidChange(e => {
				if (configuration.changed(e, 'plusFeatures')) {
					this.updateContext();
				}
			}),
		);
	}

	dispose(): void {
		this._disposable.dispose();
	}

	get etag(): number {
		return this._etag;
	}

	getSubscription(_cached?: boolean): Promise<Subscription> {
		return Promise.resolve(this._subscription);
	}

	validate(_options?: { force?: boolean }, _source?: Source): Promise<void> {
		this.updateContext();
		return Promise.resolve();
	}

	checkUpdatedSubscription(_source?: Source): Promise<SubscriptionState> {
		return Promise.resolve(SubscriptionState.Paid);
	}

	getFeaturePreview(feature: FeaturePreviews): FeaturePreview {
		return { feature: feature, usages: [] };
	}

	startFeaturePreview(_feature: FeaturePreviews): Promise<void> {
		return Promise.resolve();
	}

	private onReady(): void {
		this._disposable = Disposable.from(
			this._disposable,
			registerCommand('gitlens.plus.hide', () => this.setProFeaturesVisibility(false)),
			registerCommand('gitlens.plus.restore', () => this.setProFeaturesVisibility(true)),
			registerCommand('gitlens.plus.validate', () => this.validate({ force: true })),
		);
		this.updateContext();
	}

	private setProFeaturesVisibility(visible: boolean): void {
		void configuration.updateEffective('plusFeatures.enabled', visible);
	}

	private updateContext(): void {
		const { state } = this._subscription;
		void setContext('gitlens:plus', 'pro');
		void setContext('gitlens:plus:state', state);
		void setContext('gitlens:plus:required', false);
		void setContext('gitlens:plus:disabled', !configuration.get('plusFeatures.enabled', undefined, true));
		void setContext('gitlens:promo', undefined);
	}
}
