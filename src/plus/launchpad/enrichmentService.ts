import type { CancellationToken, Disposable } from 'vscode';
import type { RemoteProvider, RemoteProviderId } from '@gitlens/git/models/remoteProvider.js';
import type { IntegrationIds } from '@gitlens/integrations/constants.js';
import {
	GitCloudHostIntegrationId,
	GitSelfManagedHostIntegrationId,
	IssuesCloudHostIntegrationId,
	IssuesSelfManagedHostIntegrationId,
} from '@gitlens/integrations/constants.js';
import { CancellationError } from '@gitlens/utils/cancellation.js';
import type { Container } from '../../container.js';
import type { EnrichableItem, EnrichedItem, EnrichedItemResponse } from './models/enrichedItem.js';

export class EnrichmentService implements Disposable {
	constructor(private readonly container: Container) {}

	dispose(): void {}

	get(type?: EnrichedItemResponse['type'], cancellation?: CancellationToken): Promise<EnrichedItem[]> {
		if (cancellation?.isCancellationRequested) throw new CancellationError();

		const items = this.container.storage.get('launchpad:enrichedItems') ?? [];
		const now = Date.now();
		return Promise.resolve(
			items.filter(item => {
				if (type != null && item.type !== type) return false;

				return item.type !== 'snooze' || item.expiresAt == null || new Date(item.expiresAt).getTime() > now;
			}),
		);
	}

	async pinItem(item: EnrichableItem): Promise<EnrichedItem> {
		return this.upsert('pin', item);
	}

	unpinItem(id: string): Promise<void> {
		return this.delete(id, 'pin');
	}

	async snoozeItem(item: EnrichableItem): Promise<EnrichedItem> {
		return this.upsert('snooze', item);
	}

	unsnoozeItem(id: string): Promise<void> {
		return this.delete(id, 'snooze');
	}

	private async upsert(type: EnrichedItemResponse['type'], item: EnrichableItem): Promise<EnrichedItem> {
		const stored = this.container.storage.get('launchpad:enrichedItems') ?? [];
		const id = `local:${type}:${item.provider}:${item.type}:${item.id}:${encodeURIComponent(item.url)}`;
		const previous = stored.find(i => i.id === id);
		const now = new Date().toISOString();
		const updated: EnrichedItem = {
			id: id,
			type: type,
			provider: item.provider,
			entityType: item.type,
			entityId: item.id,
			entityUrl: item.url,
			createdAt: previous?.createdAt ?? now,
			updatedAt: now,
			expiresAt: item.expiresAt,
		};
		await this.container.storage.store('launchpad:enrichedItems', [...stored.filter(i => i.id !== id), updated]);
		return updated;
	}

	private async delete(id: string, type: EnrichedItemResponse['type']): Promise<void> {
		const stored = this.container.storage.get('launchpad:enrichedItems') ?? [];
		await this.container.storage.store(
			'launchpad:enrichedItems',
			stored.filter(item => item.id !== id || item.type !== type),
		);
	}
}

const supportedRemoteProvidersToEnrich: Record<RemoteProviderId, EnrichedItemResponse['provider'] | undefined> = {
	'azure-devops': 'azure',
	bitbucket: 'bitbucket',
	'bitbucket-server': 'bitbucket',
	custom: undefined,
	gerrit: undefined,
	gitea: undefined,
	github: 'github',
	'cloud-github-enterprise': 'github',
	'cloud-gitlab-self-hosted': 'gitlab',
	gitlab: 'gitlab',
	'google-source': undefined,
};

const supportedIntegrationIdsToEnrich: Record<IntegrationIds, EnrichedItemResponse['provider'] | undefined> = {
	[GitCloudHostIntegrationId.AzureDevOps]: 'azure',
	[GitSelfManagedHostIntegrationId.AzureDevOpsServer]: 'azure',
	[GitCloudHostIntegrationId.GitLab]: 'gitlab',
	[GitCloudHostIntegrationId.GitHub]: 'github',
	[GitCloudHostIntegrationId.Bitbucket]: 'bitbucket',
	[GitSelfManagedHostIntegrationId.CloudGitHubEnterprise]: 'github',
	[GitSelfManagedHostIntegrationId.CloudGitLabSelfHosted]: 'gitlab',
	[GitSelfManagedHostIntegrationId.BitbucketServer]: 'bitbucket',
	[IssuesCloudHostIntegrationId.Jira]: 'jira',
	[IssuesSelfManagedHostIntegrationId.JiraServer]: 'jira',
	[IssuesCloudHostIntegrationId.Linear]: 'linear',
	[IssuesCloudHostIntegrationId.Trello]: 'trello',
	[IssuesCloudHostIntegrationId.Asana]: undefined,
};

export function convertRemoteProviderToEnrichProvider(provider: RemoteProvider): EnrichedItemResponse['provider'] {
	return convertRemoteProviderIdToEnrichProvider(provider.id);
}

export function convertRemoteProviderIdToEnrichProvider(id: RemoteProviderId): EnrichedItemResponse['provider'] {
	const enrichProvider = supportedRemoteProvidersToEnrich[id];
	if (enrichProvider == null) throw new Error(`Unknown remote provider '${id}'`);

	return enrichProvider;
}

export function isEnrichableRemoteProviderId(id: string): id is RemoteProviderId {
	return supportedRemoteProvidersToEnrich[id as RemoteProviderId] != null;
}

export function isEnrichableIntegrationId(id: IntegrationIds): boolean {
	return supportedIntegrationIdsToEnrich[id] != null;
}

export function convertIntegrationIdToEnrichProvider(id: IntegrationIds): EnrichedItemResponse['provider'] {
	const enrichProvider = supportedIntegrationIdsToEnrich[id];
	if (enrichProvider == null) throw new Error(`Unknown integration id '${id}'`);

	return enrichProvider;
}
