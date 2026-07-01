export function getPrinterErrorMessage(error: unknown): string {
	if (!(error instanceof Error)) return 'Unknown printer error.';

	const code = (error as NodeJS.ErrnoException).code;
	if (code === 'ECONNREFUSED')
		return 'Printer refused the connection. Confirm its IP address and port.';
	if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
		return 'Printer network is unreachable from this computer.';
	}
	if (code === 'ETIMEDOUT') return 'Printer connection timed out.';
	return error.message;
}
