// Assemble this package around the `dist/` tsdown just emitted. Run by the `bundle` script, which does
// both halves in order; the mechanics live in scripts/package/bundleWorkspacePackages.mjs.
//
// Core is unusual in that its entire public surface IS the bundled packages: it re-exports each
// sub-package's `exports` under a dest subpath, and its `dependencies` are wholly derived from the
// sub-packages. Nothing but `dist/` ships: its source maps carry the sources themselves.

import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	bundleWorkspacePackages,
	generateBundledExports,
	generateBundledImports,
} from '../../../scripts/package/bundleWorkspacePackages.mjs';
import { mergeBundledDependencies } from '../../../scripts/workspace.mjs';
import { assertPackagesMatchWorkspace, coreRoot, packages, repoRoot } from './packages.mjs';

assertPackagesMatchWorkspace();

await bundleWorkspacePackages({
	repoRoot: repoRoot,
	packageRoot: coreRoot,
	packages: packages,
	publishedName: '@gitkraken/core-gitlens',
	logPrefix: '[core-gitlens bundle]',
	licenses: ['LICENSE', 'LICENSE.plus'],
	// `dist/` is deliberately absent here: tsdown owns it and cleans it itself, and this script runs after.
	clean: async () => {
		await rm(join(coreRoot, 'LICENSE'), { force: true });
		await rm(join(coreRoot, 'LICENSE.plus'), { force: true });
	},
	updateManifest: async manifest => {
		manifest.dependencies = await mergeBundledDependencies();
		manifest.exports = await generateBundledExports(repoRoot, packages);
		manifest.imports = await generateBundledImports(repoRoot, packages);
	},
});

// Const enum inlining can leave bare imports in preserveModules output. All packages bundled into Core
// declare sideEffects: false, so those internal imports carry no initialization contract. Remove them
// from the published artifact while keeping external imports and generated source-map positions intact.
const dist = join(coreRoot, 'dist');
for (const file of await readdir(dist, { recursive: true })) {
	if (!file.endsWith('.js')) continue;

	const path = join(dist, file);
	const contents = await readFile(path, 'utf8');
	const updated = contents.replace(/^import\s+(['"])\.[^'"\r\n]+\.js\1;?[\t ]*$/gm, statement =>
		statement.replace(/[^\r\n]/g, ' '),
	);
	if (updated !== contents) {
		await writeFile(path, updated);
	}
}
