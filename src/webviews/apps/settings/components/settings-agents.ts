import { SignalWatcher } from '@lit-labs/signals';
import { consume } from '@lit/context';
import * as l10n from '@vscode/l10n';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { srOnly } from '@gitlens/components/components/styles/lit/a11y.css.js';
import { boxSizingBase, inlineCode, linkBase } from '@gitlens/components/components/styles/lit/base.css.js';
import type { AgentInfo, AIState } from '../../../rpc/services/types.js';
import { shouldShowKeplerBanner } from '../../shared/components/keplerBanner.utils.js';
import type { SettingsActions } from '../actions.js';
import type { SettingsState } from '../state.js';
import { settingsStateContext } from '../state.js';
import '../../shared/components/button.js';
import '@gitlens/components/components/codeIcon.js';
import '@gitlens/components/components/overlays/popover.js';
import '@gitlens/components/components/overlays/tooltip.js';
import '../../shared/components/kepler-banner.js';
import '../../shared/components/skeleton-loader.js';
import '../../shared/components/radio/radio.js';

declare global {
	interface HTMLElementTagNameMap {
		['gl-settings-agents']: GlSettingsAgents;
	}
}

const kindOrder: AgentInfo['kind'][] = ['ide-chat', 'claude-extension', 'cli', 'editor'];
const kindLabels: Record<AgentInfo['kind'], string> = {
	'ide-chat': l10n.t('Chat'),
	'claude-extension': l10n.t('Extension'),
	cli: 'CLI',
	editor: l10n.t('Editors'),
};
const kindIcons: Record<AgentInfo['kind'], string> = {
	'ide-chat': 'comment-discussion',
	'claude-extension': 'claude',
	cli: 'terminal',
	editor: 'robot',
};

/**
 * The Agents settings table — one row per detected agent (Chat/Extension/CLI),
 * with a Default picker and, for CLI agents only, MCP/Hooks install controls.
 *
 * Mirrors `gl-settings-scm-views`' rows-grid + radio pattern; MCP/Hooks state
 * comes from the shared `agents` RPC signal rather than config settings.
 */
@customElement('gl-settings-agents')
export class GlSettingsAgents extends SignalWatcher(LitElement) {
	static override styles = [
		boxSizingBase,
		inlineCode,
		linkBase,
		srOnly,
		css`
			:host {
				display: block;
				--status-color--connected: var(--gl-color-feedback-success-quiet-fg);
			}

			.rows {
				display: grid;
				grid-template-columns: 1fr auto;
				gap: var(--gl-space-4) var(--gl-space-16);
				align-items: center;
			}

			.header {
				display: contents;
			}

			.header span {
				padding-block-end: var(--gl-space-4);
				font-size: 1.1rem;
				font-weight: var(--gl-font-weight-semibold);
				color: var(--vscode-descriptionForeground);
				text-transform: uppercase;
				letter-spacing: 0.04em;
				border-block-end: var(--gl-border-width) solid var(--gl-color-divider-base);
			}

			.header__col,
			.cell {
				justify-self: center;
				text-align: center;
			}

			.cell__button {
				--button-padding-inline: var(--gl-space-6);
			}

			.section {
				grid-column: 1 / -1;
				padding-block: var(--gl-space-8) var(--gl-space-2);
				font-size: 1.05rem;
				font-weight: var(--gl-font-weight-semibold);
				color: var(--vscode-descriptionForeground);
				text-transform: uppercase;
				letter-spacing: 0.04em;
			}

			.row {
				display: contents;
			}

			.row__agent {
				display: flex;
				gap: var(--gl-space-8);
				align-items: center;
				padding-block: var(--gl-space-6);
			}

			.row__agent code-icon {
				flex: none;
				color: var(--vscode-descriptionForeground);
			}

			.row--dimmed .row__agent {
				color: var(--vscode-disabledForeground);
			}

			.row--dimmed .row__agent code-icon {
				color: var(--vscode-disabledForeground);
			}

			.row__not-detected {
				font-size: 1rem;
				font-weight: var(--gl-font-weight-regular);
			}

			.cell__status {
				display: inline-flex;
				gap: 0.4rem;
				align-items: center;
				font-size: 1.15rem;
				color: var(--status-color--connected);
			}

			.cell__dash {
				color: var(--vscode-disabledForeground);
			}

			.cell__status-icon--warning {
				color: var(--gl-color-feedback-warning-quiet-fg);
				cursor: help;
			}

			/* Sized so the activation hint wraps to a readable measure instead of one long line —
			   the popover would otherwise size itself to the whole sentence. */
			.activation-popover {
				display: flex;
				flex-direction: column;
				gap: var(--gl-space-8);
				align-items: flex-start;
				max-width: 30rem;
			}

			gl-radio {
				justify-self: center;
			}

			.note {
				display: flex;
				gap: var(--gl-space-8);
				padding: var(--gl-space-10) var(--gl-space-12);
				font-size: 1.2rem;
				line-height: 1.5;
				color: var(--gl-color-feedback-info-fg);
				background-color: var(--gl-color-feedback-info-bg);
				border: var(--gl-border-width) solid var(--gl-color-feedback-info-border);
				border-radius: var(--gl-radius-md);
			}

			.note code-icon {
				flex: none;
				margin-block-start: var(--gl-space-2);
			}

			.error {
				display: flex;
				gap: var(--gl-space-8);
				align-items: center;
				padding: var(--gl-space-10) var(--gl-space-12);
				font-size: 1.2rem;
				color: var(--gl-color-feedback-danger-fg);
				background-color: var(--gl-color-feedback-danger-bg);
				border: var(--gl-border-width) solid var(--gl-color-feedback-danger-border);
				border-radius: var(--gl-radius-md);
			}

			.error span {
				flex: 1;
			}
		`,
	];

	@consume({ context: settingsStateContext })
	private _state!: SettingsState;

	@property({ attribute: false })
	actions?: SettingsActions;

	private get ai(): AIState | undefined {
		return this._state.aiState.get();
	}

	private get agents(): AgentInfo[] | undefined {
		return this._state.agents.get();
	}

	private get defaultAgentId(): string | undefined {
		return this._state.getSettingValue<string>('ai.defaultAgent');
	}

	override render(): unknown {
		const walkthrough = this._state.walkthrough.get();
		const showKeplerBanner = shouldShowKeplerBanner({
			progress: walkthrough?.main,
			onboardingOptedOut: walkthrough?.onboardingOptedOut,
			orgDisabledAi: this.ai != null && !this.ai.orgEnabled,
		});

		return html`${
			showKeplerBanner ? html`<gl-kepler-banner source="settings"></gl-kepler-banner>` : nothing
		}${this.renderAgents()}`;
	}

	private renderAgents(): unknown {
		const ai = this.ai;
		if (ai == null) {
			if (this._state.serviceErrors.get().ai) return this.renderError(l10n.t('Couldn’t load AI status.'));

			return html`<skeleton-loader lines="4"></skeleton-loader>`;
		}

		if (!ai.orgEnabled) {
			return html`<p class="note">
				<code-icon icon="org" aria-hidden="true"></code-icon>
				<span>${l10n.t('AI features have been disabled by your GitKraken admin.')}</span>
			</p>`;
		}

		if (!ai.enabled) {
			return html`<p class="note">
				<code-icon icon="info" aria-hidden="true"></code-icon>
				<span
					>${l10n.t(
						'AI features are currently disabled — enable them in the AI settings to configure agents.',
					)}</span
				>
			</p>`;
		}

		const agents = this.agents;
		if (agents == null) {
			if (this._state.serviceErrors.get().agents) return this.renderError(l10n.t('Couldn’t load agents.'));

			return html`<skeleton-loader lines="4"></skeleton-loader>`;
		}

		if (agents.length === 0) {
			return html`<p class="note">
				<code-icon icon="info" aria-hidden="true"></code-icon>
				<span
					>${l10n.t(
						'No agents detected. Install a supported chat, extension, or CLI agent to configure it here.',
					)}</span
				>
			</p>`;
		}

		return html`<div class="rows">
			<div class="header">
				<span>${l10n.t('Agent')}</span>
				<gl-tooltip content=${l10n.t('The agent GitLens uses by default for AI features')}
					><span class="header__col">${l10n.t('Default')}</span></gl-tooltip
				>
			</div>
			${kindOrder.map(kind =>
				this.renderSection(
					kind,
					agents.filter(a => a.kind === kind),
				),
			)}
		</div>`;
	}

	private renderSection(kind: AgentInfo['kind'], list: AgentInfo[]) {
		if (list.length === 0) return nothing;

		return html`<div class="section">${kindLabels[kind]}</div>
			${list.map(a => this.renderRow(a))}`;
	}

	private renderRow(agent: AgentInfo) {
		const isEditor = agent.kind === 'editor';
		const notDetected = agent.detected === false;
		const isDefault = this.defaultAgentId === agent.id;
		return html`<div class="row ${notDetected ? 'row--dimmed' : ''}">
			<span class="row__agent">
				<code-icon icon=${kindIcons[agent.kind]} aria-hidden="true"></code-icon>
				<span>${agent.label}</span>
				${
					notDetected
						? html`<span class="cell__dash row__not-detected">${l10n.t('Not detected')}</span>`
						: nothing
				}
			</span>
			${
				notDetected
					? html`<span class="cell">${this.renderDash(l10n.t('Not detected'))}</span>`
					: isEditor
						? html`<span class="cell"></span>`
						: html`<gl-radio .checked=${isDefault} @click=${() => this.setDefault(agent.id)}>
								<span class="sr-only"
									>${l10n.t('Set {agent} as the default agent', { agent: agent.label })}</span
								>
							</gl-radio>`
			}
		</div>`;
	}

	private setDefault(id: string): void {
		void this.actions?.applyValue('ai.defaultAgent', id);
	}

	private renderDash(label: string) {
		return html`<span class="cell__dash" aria-label=${label}>—</span>`;
	}

	private renderError(message: string) {
		return html`<div class="error" role="alert">
			<code-icon icon="error" aria-hidden="true"></code-icon>
			<span>${message}</span>
			<gl-button appearance="secondary" @click=${() => void this.actions?.loadSharedServices()}
				>${l10n.t('Retry')}</gl-button
			>
		</div>`;
	}
}
