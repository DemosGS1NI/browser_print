import { describe, expect, it } from 'vitest';
import {
	buildCaseLabel4x4,
	buildCaseLabelDataMatrix4x4,
	buildCaseLabelDigitalLink4x4,
	buildDemoLabel,
	LOBSTER_DIGITAL_LINK_URL,
	type LabelSample
} from './zpl';

describe('buildDemoLabel', () => {
	it.each<[LabelSample, string, string]>([
		['4x6', '^PW812', '^LL1218'],
		['4x4', '^PW812', '^LL812'],
		['4x4-datamatrix', '^PW812', '^LL812'],
		['4x4-digital-link', '^PW812', '^LL812'],
		['3x3', '^PW609', '^LL609']
	])('builds a complete %s ZPL sample', (pageSize, width, length) => {
		const zpl = buildDemoLabel(pageSize, new Date(2026, 0, 1).getTime());

		expect(zpl).toMatch(/^\^XA/);
		expect(zpl).toContain(width);
		expect(zpl).toContain(length);
		expect(zpl).toMatch(/\^XZ$/);
	});
});

describe('4x4 two-dimensional lobster labels', () => {
	it('builds a GS1 DataMatrix with leading and variable-field FNC1 characters', () => {
		const zpl = buildCaseLabelDataMatrix4x4();

		expect(zpl).toContain('^BXN,10,200,26,26,,_');
		expect(zpl).toContain('^FD_101074340020300181325081615270816210001_110LL-14-25-ART^FS');
		expect(zpl).toContain('^FD(01)07434002030018(13)250816(15)270816(21)0001(10)LL-14-25-ART^FS');
	});

	it('builds a QR code containing the equivalent GS1 Digital Link URI', () => {
		const zpl = buildCaseLabelDigitalLink4x4();

		expect(zpl).toContain('^BQN,2,8');
		expect(zpl).toContain(`^FDLA,${LOBSTER_DIGITAL_LINK_URL}^FS`);
		expect(zpl).toContain('^FD(01)07434002030018(13)250816(15)270816(21)0001(10)LL-14-25-ART^FS');
	});
});

describe('buildCaseLabel4x4', () => {
	it('builds the lobster label with the requested human-readable GS1 data', () => {
		const zpl = buildCaseLabel4x4();

		expect(zpl).toContain('^FDLOBSTER TAILS^FS');
		expect(zpl).toContain('^FD07434002030018^FS');
		expect(zpl).toContain('^FD10 lb (4.53 kg)^FS');
		expect(zpl).toContain('^FD(01)07434002030018(13)250816(15)270816^FS');
		expect(zpl).toContain('^FD(01)07434002030018(21)0001(10)LL-14-25-ART^FS');
		expect(zpl).not.toContain('BARCODE 1');
		expect(zpl).not.toContain('BARCODE 2');
		expect(zpl).not.toContain('^FO30,520^GB');
	});

	it('encodes the GS1 leading and separator FNC1 characters', () => {
		const zpl = buildCaseLabel4x4();

		expect(zpl).toContain('^FD>;>801074340020300181325081615270816^FS');
		expect(zpl).toContain('^FD>;>80107434002030018210001>810>6LL-14-25-ART^FS');
	});
});
