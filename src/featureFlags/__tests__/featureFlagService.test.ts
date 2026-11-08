import * as assert from 'assert';
import { FeatureFlagKey, LocalFeatureFlagService } from '../featureFlagService.js';

suite('Local feature flags', () => {
	test('uses caller-provided defaults and does not populate remote values', async () => {
		const flags = new LocalFeatureFlagService();

		await flags.whenReady;
		assert.strictEqual(flags.hasEverFetched, false);
		assert.strictEqual(flags.getFlag(FeatureFlagKey.GraphGateIntroVideo, true), true);
		assert.strictEqual(flags.getFlag(FeatureFlagKey.Notifications, false), false);
		assert.strictEqual(flags.getFlag(FeatureFlagKey.WelcomeInEditor, 'control'), 'control');
		assert.deepStrictEqual(flags.getAllFlags(), {});
		flags.dispose();
	});
});
