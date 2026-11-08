import type { SubscriptionState } from '../../constants.subscription.js';
import type { PlansContent } from './models/plans.js';
import { defaultPlansContent } from './models/plans.js';
import type { Promo, PromoLocation, PromoPlans } from './models/promo.js';

export type Config = {
	promos: Promo[];
	cli: {
		minimumCoreVersion: string;
		minimumProxyVersion: string;
	};
	plans: PlansContent;
};

/** Local fallback configuration. This fork does not download product configuration or promotions. */
export class ProductConfigProvider {
	getApplicablePromo(
		_state: SubscriptionState | undefined,
		_plan: PromoPlans,
		_location?: PromoLocation,
		_expiringOnly?: boolean,
	): Promise<Promo | undefined> {
		return Promise.resolve(undefined);
	}

	getCliMinimumVersions(): Promise<{ core: string; proxy: string }> {
		return Promise.resolve({ core: '0.0.0', proxy: '0.0.0' });
	}

	getPlans(): Promise<PlansContent> {
		return Promise.resolve(defaultPlansContent);
	}
}
