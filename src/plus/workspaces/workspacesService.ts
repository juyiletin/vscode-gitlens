import type { Disposable, Event } from 'vscode';
import { EventEmitter, l10n, Uri, Disposable as VsCodeDisposable, window, workspace } from 'vscode';
import { isWindows } from '@env/platform.js';
import type { GitRemote } from '@gitlens/git/models/remote.js';
import { RemoteResourceType } from '@gitlens/git/models/remoteResource.js';
import { basename, normalizePath } from '@gitlens/utils/path.js';
import type { Container } from '../../container.js';
import type { GlRepository } from '../../git/models/repository.js';
import { getRemoteProviderUrl } from '../../git/utils/-webview/remote.utils.js';
import type { OpenWorkspaceLocation } from '../../system/-webview/vscode/workspaces.js';
import { openWorkspace } from '../../system/-webview/vscode/workspaces.js';
import { LocalWorkspace } from './models/localWorkspace.js';
import type { LocalWorkspaceRepositoryDescriptor } from './models/localWorkspace.js';
import type { GetWorkspacesResponse, WorkspaceRepositoriesByName } from './models/workspaces.js';

export class WorkspacesService implements Disposable {
	private readonly _onDidResetWorkspaces = new EventEmitter<void>();
	private _localWorkspace: LocalWorkspace | undefined;
	private readonly _disposable: Disposable;

	get onDidResetWorkspaces(): Event<void> {
		return this._onDidResetWorkspaces.event;
	}

	constructor(private readonly container: Container) {
		this._disposable = VsCodeDisposable.from(
			this._onDidResetWorkspaces,
			workspace.onDidChangeWorkspaceFolders(() => this.resetWorkspaces()),
		);
	}

	dispose(): void {
		this._localWorkspace?.dispose();
		this._disposable.dispose();
	}

	get currentWorkspaceId(): string | undefined {
		return workspace.workspaceFile?.fsPath;
	}

	get currentWorkspace(): LocalWorkspace | undefined {
		return this._localWorkspace;
	}

	getWorkspaces(options?: { force?: boolean }): Promise<GetWorkspacesResponse> {
		if (options?.force || this._localWorkspace == null) {
			this._localWorkspace?.dispose();
			this._localWorkspace = undefined;

			const workspaceFile = workspace.workspaceFile;
			if (workspaceFile != null) {
				const id = workspaceFile.fsPath;
				const descriptors: LocalWorkspaceRepositoryDescriptor[] = (workspace.workspaceFolders ?? []).map(
					folder => ({
						localPath: folder.uri.fsPath,
						name: folder.name,
						workspaceId: id,
					}),
				);
				this._localWorkspace = new LocalWorkspace(
					this.container,
					id,
					workspace.name ?? basename(workspaceFile.path).replace(/\.code-workspace$/i, ''),
					descriptors,
					true,
					workspaceFile.fsPath,
				);
			}
		}

		return Promise.resolve({
			localWorkspaces: this._localWorkspace != null ? [this._localWorkspace] : [],
			localWorkspaceInfo: undefined,
		});
	}

	resetWorkspaces(): void {
		this._localWorkspace?.dispose();
		this._localWorkspace = undefined;
		this._onDidResetWorkspaces.fire();
	}

	async resolveWorkspaceRepositoriesByName(
		workspaceOrId: LocalWorkspace | string,
		options?: { repositories?: GlRepository[]; resolveFromPath?: boolean; force?: boolean },
	): Promise<WorkspaceRepositoriesByName> {
		const current = typeof workspaceOrId === 'string' ? this._localWorkspace : workspaceOrId;
		const results: WorkspaceRepositoriesByName = new Map();
		if (current == null || current.id !== (typeof workspaceOrId === 'string' ? workspaceOrId : current.id)) {
			return results;
		}

		const repositories = options?.repositories ?? this.container.git.repositories;
		const byPath = new Map(
			Array.from(
				repositories,
				repo => [normalizePath(isWindows ? repo.uri.fsPath.toLowerCase() : repo.uri.fsPath), repo] as const,
			),
		);

		for (const descriptor of await current.getRepositoryDescriptors()) {
			let repository = byPath.get(
				normalizePath(isWindows ? descriptor.localPath.toLowerCase() : descriptor.localPath),
			);
			if (repository == null && options?.resolveFromPath) {
				repository = await this.container.git.getOrAddRepository(Uri.file(descriptor.localPath), {
					opened: false,
					force: options.force,
				});
			}

			if (repository != null) {
				results.set(descriptor.name, { descriptor: descriptor, repository: repository });
			}
		}

		return results;
	}

	async saveAsCodeWorkspaceFile(workspaceId: string): Promise<void> {
		const current = (await this.getWorkspaces()).localWorkspaces.find(item => item.id === workspaceId);
		if (current == null) return;

		const uri = await window.showSaveDialog({
			defaultUri: Uri.file(`${current.name}.code-workspace`),
			filters: { [l10n.t('Code Workspace')]: ['code-workspace'] },
			title: l10n.t('Choose a location for the new workspace file'),
		});
		if (uri == null) return;

		const contents = {
			folders: (workspace.workspaceFolders ?? []).map(folder => ({ path: folder.uri.fsPath })),
		};
		await workspace.fs.writeFile(uri, new TextEncoder().encode(JSON.stringify(contents, null, '\t')));
	}

	openCodeWorkspaceFile(workspaceId: string, options?: { location?: OpenWorkspaceLocation }): Promise<void> {
		openWorkspace(Uri.file(workspaceId), { location: options?.location ?? 'newWindow' });
		return Promise.resolve();
	}
}

export async function getRemoteDescriptor(
	remote: GitRemote,
): Promise<{ provider: string; owner: string; repoName: string; url: string | undefined } | undefined> {
	if (remote.provider?.owner == null) return undefined;

	const { path } = remote.provider;
	const repoName = path.split('/').pop();
	if (repoName == null) return undefined;

	const namespaceEnd = path.lastIndexOf('/');
	const owner =
		remote.provider.id === 'gitlab' && namespaceEnd > 0 ? path.substring(0, namespaceEnd) : remote.provider.owner;
	return {
		provider: remote.provider.id.toLowerCase(),
		owner: owner.toLowerCase(),
		repoName: repoName.toLowerCase(),
		url: await getRemoteProviderUrl(remote.provider, { type: RemoteResourceType.Repo }),
	};
}
