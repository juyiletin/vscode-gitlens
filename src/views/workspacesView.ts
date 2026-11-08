import type { CancellationToken, ConfigurationChangeEvent, Disposable } from 'vscode';
import { l10n, ProgressLocation, TreeItem, TreeItemCollapsibleState, window } from 'vscode';
import { trace } from '@gitlens/utils/decorators/log.js';
import type { WorkspacesViewConfig } from '../config.js';
import type { Container } from '../container.js';
import { unknownGitUri } from '../git/gitUri.js';
import { executeCommand } from '../system/-webview/command.js';
import { configuration } from '../system/-webview/configuration.js';
import { openWorkspace } from '../system/-webview/vscode/workspaces.js';
import { ViewNode } from './nodes/abstract/viewNode.js';
import { MessageNode } from './nodes/common.js';
import { RepositoriesNode } from './nodes/repositoriesNode.js';
import type { RepositoryNode } from './nodes/repositoryNode.js';
import { WorkspaceNode } from './nodes/workspaceNode.js';
import type { RevealOptions } from './viewBase.js';
import { disposeChildren, ViewBase } from './viewBase.js';
import type { CopyNodeCommandArgs } from './viewCommands.js';
import { registerViewCommand } from './viewCommands.js';

export class WorkspacesViewNode extends ViewNode<'workspaces', WorkspacesView> {
	constructor(view: WorkspacesView) {
		super('workspaces', unknownGitUri, view);
	}

	private _children: (WorkspaceNode | MessageNode | RepositoriesNode)[] | undefined;

	async getChildren(): Promise<ViewNode[]> {
		this.view.message = undefined;

		if (this._children == null) {
			const children: (WorkspaceNode | MessageNode | RepositoriesNode)[] = [];

			const { localWorkspaces, localWorkspaceInfo } = await this.view.container.workspaces.getWorkspaces();

			if (localWorkspaces.length === 0) {
				children.push(new RepositoriesNode(this.view));
			} else {
				for (const localWorkspace of localWorkspaces) {
					children.push(new WorkspaceNode(this.uri, this.view, this, localWorkspace));
				}

				if (localWorkspaceInfo != null) {
					children.push(new MessageNode(this.view, this, localWorkspaceInfo));
				}
			}

			this._children = children;
		}

		return this._children;
	}

	getTreeItem(): TreeItem {
		const item = new TreeItem(l10n.t('Workspaces'), TreeItemCollapsibleState.Expanded);
		return item;
	}

	@trace()
	override refresh(): void {
		if (this._children == null) return;

		disposeChildren(this._children);
		this._children = undefined;
	}
}

export class WorkspacesView extends ViewBase<'workspaces', WorkspacesViewNode, WorkspacesViewConfig> {
	protected readonly configKey = 'workspaces';
	private _disposable: Disposable | undefined;

	constructor(container: Container) {
		super(container, 'workspaces', l10n.t('Workspaces'), 'workspacesView');

		this.disposables.push(container.workspaces.onDidResetWorkspaces(() => void this.refresh(true)));
	}

	override dispose(): void {
		this._disposable?.dispose();
		super.dispose();
	}

	protected getRoot(): WorkspacesViewNode {
		return new WorkspacesViewNode(this);
	}

	override async show(options?: { preserveFocus?: boolean | undefined }): Promise<void> {
		return super.show(options);
	}

	async findWorkspaceNode(workspaceId: string, token?: CancellationToken): Promise<ViewNode | undefined> {
		return this.findNode((n: any) => n.workspace?.id === workspaceId, {
			allowPaging: false,
			maxDepth: 2,
			canTraverse: n => {
				if (n instanceof WorkspacesViewNode) return true;

				return false;
			},
			token: token,
		});
	}

	async revealWorkspaceNode(workspaceId: string, options?: RevealOptions): Promise<ViewNode | undefined> {
		return window.withProgress(
			{
				location: ProgressLocation.Notification,
				title: l10n.t('Revealing workspace {0} in the side bar...', workspaceId),
				cancellable: true,
			},
			async (_progress, token) => {
				const node = await this.findWorkspaceNode(workspaceId, token);
				if (node == null) return undefined;

				await this.revealDeep(node, options);

				return node;
			},
		);
	}

	protected registerCommands(): Disposable[] {
		return [
			registerViewCommand(
				this.getQualifiedCommand('copy'),
				() => executeCommand<CopyNodeCommandArgs>('gitlens.views.copy', this.activeSelection, this.selection),
				this,
			),
			registerViewCommand(
				this.getQualifiedCommand('refresh'),
				() => {
					this.container.workspaces.resetWorkspaces();
				},
				this,
			),
			registerViewCommand(
				this.getQualifiedCommand('createLocal'),
				async (node: WorkspaceNode) => {
					await this.container.workspaces.saveAsCodeWorkspaceFile(node.workspace.id);
					void this.ensureRoot().triggerChange(true);
				},
				this,
			),
			registerViewCommand(
				this.getQualifiedCommand('openLocal'),
				async (node: WorkspaceNode) => {
					await this.container.workspaces.openCodeWorkspaceFile(node.workspace.id, {
						location: 'currentWindow',
					});
					void this.ensureRoot().triggerChange(true);
				},
				this,
			),
			registerViewCommand(
				this.getQualifiedCommand('openLocalNewWindow'),
				async (node: WorkspaceNode) => {
					await this.container.workspaces.openCodeWorkspaceFile(node.workspace.id, {
						location: 'newWindow',
					});
				},
				this,
			),
			registerViewCommand(
				this.getQualifiedCommand('repo.openInNewWindow'),
				(node: RepositoryNode) => {
					const workspaceNode = node.getParent();
					if (workspaceNode == null || !(workspaceNode instanceof WorkspaceNode)) {
						return;
					}

					openWorkspace(node.repo.uri, { location: 'newWindow' });
				},
				this,
			),
			registerViewCommand(
				this.getQualifiedCommand('repo.open'),
				(node: RepositoryNode) => {
					const workspaceNode = node.getParent();
					if (workspaceNode == null || !(workspaceNode instanceof WorkspaceNode)) {
						return;
					}

					openWorkspace(node.repo.uri, { location: 'currentWindow' });
				},
				this,
			),
			registerViewCommand(
				this.getQualifiedCommand('repo.addToWindow'),
				(node: RepositoryNode) => {
					const workspaceNode = node.getParent();
					if (workspaceNode == null || !(workspaceNode instanceof WorkspaceNode)) {
						return;
					}

					openWorkspace(node.repo.uri, { location: 'addToWorkspace' });
				},
				this,
			),
		];
	}

	protected override filterConfigurationChanged(e: ConfigurationChangeEvent): boolean {
		const changed = super.filterConfigurationChanged(e);
		if (
			!changed &&
			!configuration.changed(e, 'defaultCurrentUserNameStyle') &&
			!configuration.changed(e, 'defaultDateFormat') &&
			!configuration.changed(e, 'defaultDateLocale') &&
			!configuration.changed(e, 'defaultDateShortFormat') &&
			!configuration.changed(e, 'defaultDateSource') &&
			!configuration.changed(e, 'defaultDateStyle') &&
			!configuration.changed(e, 'defaultGravatarsStyle') &&
			!configuration.changed(e, 'defaultTimeFormat') &&
			!configuration.changed(e, 'sortBranchesBy') &&
			!configuration.changed(e, 'sortContributorsBy') &&
			!configuration.changed(e, 'sortTagsBy') &&
			!configuration.changed(e, 'sortRepositoriesBy')
		) {
			return false;
		}

		return true;
	}
}
