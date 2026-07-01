import { json } from '@sveltejs/kit';
import { getPrinterErrorMessage } from '$lib/server/printing/http-errors';
import {
	parsePrinterTarget,
	PrinterInputError,
	testPrinterConnection
} from '$lib/server/printing/tcp-printer';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const rawBody: unknown = await request.json();
		if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
			throw new PrinterInputError('Request body must be a JSON object.');
		}
		const body = rawBody as Record<string, unknown>;
		const target = parsePrinterTarget(body.ip, body.port);
		await testPrinterConnection(target);
		return json({ ok: true, ip: target.host, port: target.port });
	} catch (error) {
		const status = error instanceof PrinterInputError || error instanceof SyntaxError ? 400 : 502;
		return json({ ok: false, error: getPrinterErrorMessage(error) }, { status });
	}
};
