import { writeFileSync } from 'node:fs';

writeFileSync(
	new URL('../docs/telemetry-events.md', import.meta.url),
	'# Local diagnostics\n\nThis fork does not transmit telemetry. Diagnostic events remain local and no telemetry exporter is installed.\n',
);
