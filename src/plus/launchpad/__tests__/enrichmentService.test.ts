import * as assert from 'assert';
import type { Container } from '../../../container.js';
import { EnrichmentService } from '../enrichmentService.js';
import type { EnrichableItem, EnrichedItem } from '../models/enrichedItem.js';

suite('Local Launchpad enrichments', () => {
	function createService(): EnrichmentService {
		let stored: EnrichedItem[] | undefined;
		return new EnrichmentService({
			storage: {
				get: () => stored,
				store: (_key: string, value: EnrichedItem[]) => {
					stored = value;
					return Promise.resolve();
				},
			},
		} as unknown as Container);
	}

	const item: EnrichableItem = {
		type: 'pr',
		provider: 'gitlab',
		id: '42',
		url: 'https://gitlab.example.com/team/repo/-/merge_requests/42',
	};

	test('keeps equal entity IDs on different servers and repositories separate', async () => {
		const service = createService();
		const first = await service.pinItem(item);
		const second = await service.pinItem({
			...item,
			url: item.url.replace('gitlab.example.com', 'other.example.com'),
		});
		const third = await service.pinItem({ ...item, url: item.url.replace('/team/repo/', '/team/other/') });
		assert.strictEqual(new Set([first.id, second.id, third.id]).size, 3);
		assert.strictEqual((await service.get('pin')).length, 3);
		await service.unpinItem(second.id);
		assert.deepStrictEqual(
			(await service.get('pin')).map(entry => entry.id),
			[first.id, third.id],
		);
	});

	test('upserts the same URL and retains its creation time', async () => {
		const service = createService();
		const first = await service.pinItem(item);
		const updated = await service.pinItem(item);
		assert.strictEqual(updated.id, first.id);
		assert.strictEqual(updated.createdAt, first.createdAt);
		assert.deepStrictEqual(await service.get('pin'), [updated]);
	});

	test('expires snoozes without hiding pins and removes only the requested type', async () => {
		const service = createService();
		const pin = await service.pinItem(item);
		await service.snoozeItem({ ...item, expiresAt: '2000-01-01T00:00:00.000Z' });
		assert.deepStrictEqual(await service.get(), [pin]);
		const snooze = await service.snoozeItem(item);
		await service.unsnoozeItem(pin.id);
		assert.deepStrictEqual(await service.get(), [pin, snooze]);
		await service.unsnoozeItem(snooze.id);
		assert.deepStrictEqual(await service.get(), [pin]);
	});
});
