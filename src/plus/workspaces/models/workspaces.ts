import type { GlRepository } from '../../../git/models/repository.js';
import type { LocalWorkspace, LocalWorkspaceRepositoryDescriptor } from './localWorkspace.js';

export type WorkspaceType = 'local';
export type WorkspaceRepositoriesByName = Map<string, RepositoryMatch>;

export interface RepositoryMatch {
	repository: GlRepository;
	descriptor: LocalWorkspaceRepositoryDescriptor;
}

export interface GetWorkspacesResponse {
	localWorkspaces: LocalWorkspace[];
	localWorkspaceInfo: string | undefined;
}
