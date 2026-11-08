import type { Disposable, Event, Uri, UriHandler } from 'vscode';
import { EventEmitter, window } from 'vscode';
import { debug } from '@gitlens/utils/decorators/log.js';

export class UriService implements Disposable, UriHandler {
	private readonly emitter = new EventEmitter<Uri>();
	private readonly registration = window.registerUriHandler(this);

	get onDidReceiveUri(): Event<Uri> {
		return this.emitter.event;
	}

	dispose(): void {
		this.registration.dispose();
		this.emitter.dispose();
	}

	@debug({ args: uri => ({ uri: uri.with({ query: '' }).toString(true) }) })
	handleUri(uri: Uri): void {
		this.emitter.fire(uri);
	}
}
