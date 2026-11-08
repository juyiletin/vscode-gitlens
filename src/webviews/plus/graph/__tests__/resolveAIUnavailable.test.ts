import * as assert from 'assert';
import { AIError, AIErrorReason } from '@gitlens/ai/errors.js';
import { classifyResolveRunErrors, isAIQuotaExceededError } from '../resolveAIUnavailable.js';

const aiResolution = { descriptionKind: undefined };
const bothDeleted = { descriptionKind: 'automatic-both-deleted' };

function quota(filePath: string) {
	return {
		filePath: filePath,
		error: new AIError(AIErrorReason.UserQuotaExceeded, undefined, { id: 'openai', name: 'OpenAI' }),
	};
}

function unreachable(filePath: string) {
	return { filePath: filePath, error: new AIError(AIErrorReason.Unreachable) };
}

suite('resolveAIUnavailable — classifyResolveRunErrors', () => {
	test('leaves ordinary per-file failures alone', () => {
		const result = classifyResolveRunErrors(
			[],
			[{ filePath: 'a.ts', error: new AIError(AIErrorReason.RequestTooLarge) }],
		);

		assert.deepStrictEqual(result, { errors: [{ filePath: 'a.ts', message: 'The request is too large' }] });
	});

	test('reports one run-level error when AI was unavailable and resolved nothing', () => {
		const result = classifyResolveRunErrors([], [unreachable('a.ts'), unreachable('b.ts'), unreachable('c.ts')]);

		assert.ok('error' in result);
		assert.match(result.error.message, /3 files weren’t resolved/);
		assert.match(result.error.message, /temporarily unreachable/);
	});

	test('automatic both-deleted resolutions are not AI work', () => {
		const result = classifyResolveRunErrors([bothDeleted], [unreachable('a.ts'), unreachable('b.ts')]);

		assert.ok('error' in result);
		assert.match(result.error.message, /temporarily unreachable/);
	});

	test('keeps resolved work and moves the shared reason to one run-level notice', () => {
		const result = classifyResolveRunErrors(
			[aiResolution],
			[
				{ filePath: 'big.ts', error: new AIError(AIErrorReason.RequestTooLarge) },
				unreachable('a.ts'),
				unreachable('b.ts'),
			],
		);

		assert.ok('errors' in result);
		assert.deepStrictEqual(result.aiUnavailable, { message: 'The AI service is temporarily unreachable.' });
		assert.deepStrictEqual(result.errors, [
			{ filePath: 'big.ts', message: 'The request is too large' },
			{ filePath: 'a.ts' },
			{ filePath: 'b.ts' },
		]);
	});

	test('surfaces a third-party provider quota without a GitKraken purchase action', () => {
		const error = quota('a.ts').error;
		const result = classifyResolveRunErrors([aiResolution], [{ filePath: 'a.ts', error: error }]);

		assert.strictEqual(isAIQuotaExceededError(error), true);
		assert.ok('errors' in result);
		assert.deepStrictEqual(result.aiUnavailable, { message: error.message });
		assert.deepStrictEqual(result.errors, [{ filePath: 'a.ts' }]);
	});
});
