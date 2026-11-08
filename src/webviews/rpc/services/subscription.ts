import { Signal } from 'signal-polyfill';
import { Disposable } from 'vscode';
import type { Container } from '../../../container.js';
import type { Subscription } from '../../../plus/gk/models/subscription.js';
import { serialize } from '../../../system/serialize.js';
import type { EventVisibilityBuffer, SubscriptionTracker } from '../eventVisibilityBuffer.js';
import { createRpcEvent } from '../eventVisibilityBuffer.js';
import type { OrgSettings, RpcEventSubscription } from './types.js';

export class SubscriptionService implements Disposable {
	readonly #container: Container;
	readonly #disposable: Disposable;

	readonly subscriptionState = new Signal.State<Subscription | undefined>(undefined);
	readonly hasAccountState = new Signal.State<boolean>(false);
	readonly avatarState = new Signal.State<string | undefined>(undefined);
	readonly organizationsCountState = new Signal.State<number>(0);
	readonly orgSettingsState = new Signal.State<OrgSettings>({ ai: true, drafts: false });
	readonly onSubscriptionChanged: RpcEventSubscription<Subscription>;
	readonly onOrgSettingsChanged: RpcEventSubscription<OrgSettings>;

	constructor(container: Container, buffer: EventVisibilityBuffer | undefined, tracker?: SubscriptionTracker) {
		this.#container = container;

		const subscriptionChanged = createRpcEvent<Subscription>('subscriptionChanged', 'save-last');
		const orgSettingsChanged = createRpcEvent<OrgSettings>('orgSettingsChanged', 'save-last');
		this.onSubscriptionChanged = subscriptionChanged.subscribe(buffer, tracker);
		this.onOrgSettingsChanged = orgSettingsChanged.subscribe(buffer, tracker);

		this.#disposable = Disposable.from(
			container.subscription.onDidChange(e => {
				const current = serialize(e.current);
				this.#updateState(current);
				subscriptionChanged.fire(current);
			}),
		);

		void container.subscription.getSubscription().then(subscription => {
			if (this.subscriptionState.get() !== undefined) return;

			this.#updateState(serialize(subscription));
			subscriptionChanged.fire(serialize(subscription));
		});
	}

	dispose(): void {
		this.#disposable.dispose();
	}

	#updateState(subscription: Subscription): void {
		this.subscriptionState.set(subscription);
		this.hasAccountState.set(false);
		this.avatarState.set(undefined);
		this.organizationsCountState.set(0);
	}

	async getSubscription(): Promise<Subscription> {
		return serialize(await this.#container.subscription.getSubscription());
	}

	isFeatureEnabled(_feature: string): Promise<boolean> {
		return Promise.resolve(true);
	}

	getAvatar(): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}

	getOrganizationsCount(): Promise<number> {
		return Promise.resolve(0);
	}

	hasAccount(): Promise<boolean> {
		return Promise.resolve(false);
	}

	getOrgSettings(): Promise<OrgSettings> {
		return Promise.resolve({ ai: true, drafts: false });
	}
}
