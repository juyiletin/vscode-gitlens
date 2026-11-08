import type { Disposable } from 'vscode';
import type { Source, TelemetryEvents, TelemetryGlobalContext } from '../constants.telemetry.js';

/** Telemetry is disabled in this fork. Keep the local call surface for existing consumers. */
export class TelemetryService implements Disposable {
	readonly enabled = false;

	dispose(): void {}

	sendEvent<T extends keyof TelemetryEvents>(
		_name: T,
		..._args: TelemetryEvents[T] extends void
			? [data?: never, source?: Source, startTime?: unknown, endTime?: unknown]
			: [data: TelemetryEvents[T], source?: Source, startTime?: unknown, endTime?: unknown]
	): void {}

	startEvent<T extends keyof TelemetryEvents>(
		_name: T,
		..._args: TelemetryEvents[T] extends void
			? [data?: never, source?: Source, startTime?: unknown]
			: [data: TelemetryEvents[T], source?: Source, startTime?: unknown]
	): Disposable | undefined {
		return undefined;
	}

	setGlobalAttribute<T extends keyof TelemetryGlobalContext>(
		_key: T,
		_value: TelemetryGlobalContext[T] | null | undefined,
	): void {}

	setGlobalAttributes(_attributes: Partial<TelemetryGlobalContext>): void {}

	deleteGlobalAttribute(_key: keyof TelemetryGlobalContext): void {}
}
