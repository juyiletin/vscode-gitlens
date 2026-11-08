import * as assert from 'assert';
import { SubscriptionState } from '../../../constants.subscription.js';
import { defaultPlansContent } from '../models/plans.js';
import { ProductConfigProvider } from '../productConfigProvider.js';

suite('Local product configuration', () => {
	test('does not return subscription promotions', async () => {
		const config = new ProductConfigProvider();

		assert.strictEqual(await config.getApplicablePromo(SubscriptionState.Community, 'pro'), undefined);
		assert.strictEqual(await config.getApplicablePromo(SubscriptionState.Paid, 'advanced', 'account'), undefined);
	});

	test('uses the checked-in plan content', async () => {
		const config = new ProductConfigProvider();

		assert.strictEqual(await config.getPlans(), defaultPlansContent);
	});
});
