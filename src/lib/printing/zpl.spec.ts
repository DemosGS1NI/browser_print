import { describe, expect, it } from 'vitest';
import { buildDemoLabel, type PageSize } from './zpl';

describe('buildDemoLabel', () => {
	it.each<[PageSize, string, string]>([
		['4x6', '^PW812', '^LL1218'],
		['4x4', '^PW812', '^LL812'],
		['3x3', '^PW609', '^LL609']
	])('builds a complete %s ZPL sample', (pageSize, width, length) => {
		const zpl = buildDemoLabel(pageSize, new Date(2026, 0, 1).getTime());

		expect(zpl).toMatch(/^\^XA/);
		expect(zpl).toContain(width);
		expect(zpl).toContain(length);
		expect(zpl).toMatch(/\^XZ$/);
	});
});
