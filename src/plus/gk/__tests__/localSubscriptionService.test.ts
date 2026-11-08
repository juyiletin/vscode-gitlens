import * as assert from 'assert';
import { EventEmitter } from 'vscode';
import { SubscriptionState } from '../../../constants.subscription.js';
import type { Container } from '../../../container.js';
import { getContext } from '../../../system/-webview/context.js';
import { SubscriptionService } from '../subscriptionService.js';

suite('Local subscription lifecycle', () => {
	test('starts and validates without consulting stored licenses, authentication, or a connection', async () => {
		const ready = new EventEmitter<void>();
		const container = new Proxy(
			{ onReady: ready.event },
			{
				get: function (target, property) {
					if (property === 'onReady') return target.onReady;

					throw new Error(`Unexpected local subscription dependency: ${String(property)}`);
				},
			},
		) as unknown as Container;
		const service = new SubscriptionService(container);
		try {
			const before = await service.getSubscription();
			await service.validate({ force: true });
			assert.strictEqual(await service.getSubscription(true), before);
			assert.strictEqual(before.state, SubscriptionState.Paid);
			assert.strictEqual(before.plan.actual.id, 'pro');
			assert.strictEqual(before.plan.effective.id, 'pro');
			assert.strictEqual(before.plan.effective.expiresOn, undefined);
			assert.strictEqual(before.account, undefined);
			assert.strictEqual(await service.checkUpdatedSubscription(), SubscriptionState.Paid);
			assert.strictEqual(getContext('gitlens:plus:required'), false);
			assert.strictEqual(getContext('gitlens:plus:state'), SubscriptionState.Paid);
		} finally {
			service.dispose();
			ready.dispose();
		}
	});
});
