// Initialize the extension entry point before loading command subclasses with view-node dependencies.
import '../../container.js';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { commands, Disposable } from 'vscode';
import type { Container } from '../../container.js';
import { ShowViewCommand } from '../showView.js';

suite('ShowViewCommand completion', () => {
	test('waits for the selected view before resolving the registered command', async () => {
		let release!: () => void;
		const pending = new Promise<void>(resolve => {
			release = resolve;
		});
		const shown: string[] = [];
		let invoke: (() => unknown) | undefined;
		const registration = sinon.stub(commands, 'registerCommand').callsFake((id, callback, thisArg) => {
			if (id === 'gitlens.showRemotesView') {
				invoke = () => callback.call(thisArg);
			}

			return new Disposable(() => {});
		});
		let command: ShowViewCommand | undefined;
		try {
			command = new ShowViewCommand({
				git: { openRepositoryCount: 1 },
				views: {
					showView: (view: string) => {
						shown.push(view);
						return pending;
					},
				},
			} as unknown as Container);
			assert.ok(invoke);
			let completed = false;
			const result = Promise.resolve(invoke()).then(() => {
				completed = true;
			});
			await new Promise<void>(resolve => setImmediate(resolve));
			assert.deepStrictEqual(shown, ['remotes']);
			assert.strictEqual(completed, false);
			release();
			await result;
			assert.strictEqual(completed, true);
		} finally {
			release();
			command?.dispose();
			registration.restore();
		}
	});
});
