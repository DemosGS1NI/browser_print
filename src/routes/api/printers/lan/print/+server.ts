import { json } from '@sveltejs/kit';
import { buildDemoLabel, type PageSize } from '$lib/printing/zpl';
import { getPrinterErrorMessage } from '$lib/server/printing/http-errors';
import {
	parsePrinterTarget,
	PrinterInputError,
	sendPrintJob
} from '$lib/server/printing/tcp-printer';
import type { RequestHandler } from './$types';

const PAGE_SIZES: PageSize[] = ['4x6', '4x4', '3x3'];

function isPageSize(value: unknown): value is PageSize {
	return typeof value === 'string' && PAGE_SIZES.includes(value as PageSize);
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const rawBody: unknown = await request.json();
		if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
			throw new PrinterInputError('Request body must be a JSON object.');
		}
		const body = rawBody as Record<string, unknown>;
		const target = parsePrinterTarget(body.ip, body.port);
		if (!isPageSize(body.pageSize)) {
			throw new PrinterInputError('Select a valid demo label size.');
		}

		const zpl = buildDemoLabel(body.pageSize);
		const bytesSent = await sendPrintJob(target, zpl);
		return json({
			ok: true,
			ip: target.host,
			port: target.port,
			pageSize: body.pageSize,
			bytesSent
		});
	} catch (error) {
		const status = error instanceof PrinterInputError || error instanceof SyntaxError ? 400 : 502;
		return json({ ok: false, error: getPrinterErrorMessage(error) }, { status });
	}
};
