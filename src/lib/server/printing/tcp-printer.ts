import { createConnection, isIP } from 'node:net';

export const DEFAULT_PRINTER_PORT = 9100;
export const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
export const MAX_PRINT_JOB_BYTES = 64 * 1024;

export type PrinterTarget = {
	host: string;
	port: number;
};

export class PrinterInputError extends Error {}

function isPrivateOrLocalIp(host: string): boolean {
	if (isIP(host) === 4) {
		const [first, second] = host.split('.').map(Number);
		return (
			first === 10 ||
			first === 127 ||
			(first === 169 && second === 254) ||
			(first === 172 && second >= 16 && second <= 31) ||
			(first === 192 && second === 168)
		);
	}

	const normalized = host.toLowerCase();
	return (
		normalized === '::1' ||
		normalized.startsWith('fc') ||
		normalized.startsWith('fd') ||
		normalized.startsWith('fe80:')
	);
}

function isAllowlisted(host: string): boolean {
	const configured = process.env.PRINTER_IP_ALLOWLIST;
	if (!configured) return true;

	const allowedHosts = configured
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	return allowedHosts.includes(host);
}

export function parsePrinterTarget(ip: unknown, port: unknown): PrinterTarget {
	if (typeof ip !== 'string' || !isIP(ip.trim())) {
		throw new PrinterInputError('Enter a valid IPv4 or IPv6 printer address.');
	}

	const host = ip.trim();
	if (!isPrivateOrLocalIp(host)) {
		throw new PrinterInputError('Printer address must be on a private or local network.');
	}

	if (!isAllowlisted(host)) {
		throw new PrinterInputError('Printer address is not in PRINTER_IP_ALLOWLIST.');
	}

	const parsedPort =
		port === undefined || port === null || port === '' ? DEFAULT_PRINTER_PORT : Number(port);
	if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
		throw new PrinterInputError('Printer port must be an integer from 1 to 65535.');
	}

	return { host, port: parsedPort };
}

export function testPrinterConnection(
	target: PrinterTarget,
	timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS
): Promise<void> {
	return new Promise((resolve, reject) => {
		const socket = createConnection(target);
		let settled = false;

		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			if (error) reject(error);
			else resolve();
		};

		socket.setTimeout(timeoutMs);
		socket.once('connect', () => finish());
		socket.once('timeout', () =>
			finish(new Error(`Connection timed out after ${timeoutMs / 1000} seconds.`))
		);
		socket.once('error', (error) => finish(error));
	});
}

export function sendPrintJob(
	target: PrinterTarget,
	zpl: string,
	timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS
): Promise<number> {
	const byteLength = Buffer.byteLength(zpl, 'utf8');
	if (byteLength === 0) throw new PrinterInputError('Print job is empty.');
	if (byteLength > MAX_PRINT_JOB_BYTES) {
		throw new PrinterInputError(`Print job exceeds the ${MAX_PRINT_JOB_BYTES}-byte limit.`);
	}

	return new Promise((resolve, reject) => {
		const socket = createConnection(target);
		let settled = false;

		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			socket.destroy();
			if (error) reject(error);
			else resolve(byteLength);
		};

		socket.setTimeout(timeoutMs);
		socket.once('timeout', () =>
			finish(new Error(`Print job timed out after ${timeoutMs / 1000} seconds.`))
		);
		socket.once('error', (error) => finish(error));
		socket.once('connect', () => {
			socket.end(zpl, 'utf8', () => finish());
		});
	});
}
