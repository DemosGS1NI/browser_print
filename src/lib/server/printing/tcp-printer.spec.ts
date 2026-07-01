import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
	parsePrinterTarget,
	PrinterInputError,
	sendPrintJob,
	testPrinterConnection
} from './tcp-printer';

let server: Server | undefined;

afterEach(async () => {
	if (!server?.listening) return;
	await new Promise<void>((resolve, reject) =>
		server?.close((error) => (error ? reject(error) : resolve()))
	);
	server = undefined;
});

async function startMockPrinter(onData?: (data: string) => void): Promise<number> {
	server = createServer((socket) => {
		const chunks: Buffer[] = [];
		socket.on('data', (chunk: Buffer) => chunks.push(chunk));
		socket.on('end', () => onData?.(Buffer.concat(chunks).toString('utf8')));
	});

	await new Promise<void>((resolve, reject) => {
		server?.once('error', reject);
		server?.listen(0, '127.0.0.1', resolve);
	});

	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Mock printer has no TCP address.');
	return address.port;
}

describe('TCP printer service', () => {
	it('validates private printer targets and rejects public IP addresses', () => {
		expect(parsePrinterTarget('192.168.1.50', '')).toEqual({ host: '192.168.1.50', port: 9100 });
		expect(() => parsePrinterTarget('8.8.8.8', 9100)).toThrow(PrinterInputError);
		expect(() => parsePrinterTarget('not-an-ip', 9100)).toThrow(PrinterInputError);
	});

	it('tests a TCP connection against a listening printer', async () => {
		const port = await startMockPrinter();
		await expect(testPrinterConnection({ host: '127.0.0.1', port }, 1000)).resolves.toBeUndefined();
	});

	it('sends the complete ZPL payload', async () => {
		let resolveReceived!: (data: string) => void;
		const receivedPromise = new Promise<string>((resolve) => {
			resolveReceived = resolve;
		});
		const port = await startMockPrinter(resolveReceived);
		const zpl = '^XA^FO20,20^FDLAN TEST^FS^XZ';

		await expect(sendPrintJob({ host: '127.0.0.1', port }, zpl, 1000)).resolves.toBe(
			Buffer.byteLength(zpl)
		);
		expect(await receivedPromise).toBe(zpl);
	});
});
