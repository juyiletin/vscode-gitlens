import type { Container } from '../container.js';

export type FeatureFlagValue = boolean | string | number;

export enum FeatureFlagKey {
	GraphGateIntroVideo = 'glensGraphGateIntroVideo',
	Notifications = 'glensNotifications',
	WelcomeInEditor = 'glensWelcomeInEditor',
}

export type FeatureFlagMap = Readonly<Partial<Record<FeatureFlagKey, FeatureFlagValue>>>;

export interface FeatureFlagService {
	dispose(): void;
	readonly whenReady: Promise<void>;
	readonly hasEverFetched: boolean;
	getFlag<T extends FeatureFlagValue>(key: FeatureFlagKey, defaultValue: T): T;
	getAllFlags(): FeatureFlagMap;
}

export function setFeatureFlagTelemetryGlobalAttributes(container: Container): void {
	container.telemetry.setGlobalAttribute('featureFlags', undefined);
}

/** Feature flags are intentionally local: this fork has no remote flag service. */
export class LocalFeatureFlagService implements FeatureFlagService {
	readonly whenReady: Promise<void> = Promise.resolve();
	readonly hasEverFetched = false;
	private readonly flags: FeatureFlagMap = Object.freeze({});

	dispose(): void {}

	getFlag<T extends FeatureFlagValue>(_key: FeatureFlagKey, defaultValue: T): T {
		return defaultValue;
	}

	getAllFlags(): FeatureFlagMap {
		return this.flags;
	}
}
