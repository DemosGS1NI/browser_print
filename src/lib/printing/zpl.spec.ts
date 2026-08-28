import { describe, expect, it } from 'vitest';
import {
	buildCaseLabel4x4,
	buildCaseLabelDataMatrix4x4,
	buildCaseLabelDigitalLink4x4,
	buildDemoLabel,
	buildLogisticsLabel4x6,
	GENERIC_CASE_DIGITAL_LINK_URL,
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

describe('buildLogisticsLabel4x6', () => {
	it('disables automatic barcode interpretation lines and keeps formatted text only', () => {
		const zpl = buildLogisticsLabel4x6(new Date(2026, 0, 1).getTime());

		expect(zpl).toContain('^FO30,310^BCN,130,N,N,N^FD>;>800012345678901234^FS');
		expect(zpl).toContain('^FO30,450^FD(00) 00012345678901234 SSCC^FS');
		expect(zpl).toContain('^BCN,120,N,N,N^FD>;>80109501101530001726063010LOT123^FS');
		expect(zpl).toContain('^FO30,635^FD(01) 09501101530003 (17) EXP (10) LOT123^FS');
		expect(zpl).not.toContain('^BCN,130,Y,N,N');
		expect(zpl).not.toContain('^BCN,120,Y,N,N');
	});
});

describe('4x4 two-dimensional generic case labels', () => {
	it('builds a GS1 DataMatrix with leading and variable-field FNC1 characters', () => {
		const zpl = buildCaseLabelDataMatrix4x4();

		expect(zpl).toContain('^BXN,10,200,26,26,,_');
		expect(zpl).toContain('^FD_101007439999999991326010115270101219999_110LOT-99999^FS');
		expect(zpl).toContain('^FD(01)00743999999999(13)260101(15)270101(21)9999(10)LOT-99999^FS');
	});

	it('builds a QR code containing the equivalent GS1 Digital Link URI', () => {
		const zpl = buildCaseLabelDigitalLink4x4();

		expect(zpl).toContain('^BQN,2,8');
		expect(zpl).toContain(`^FDLA,${GENERIC_CASE_DIGITAL_LINK_URL}^FS`);
		expect(zpl).toContain('^FD(01)00743999999999(13)260101(15)270101(21)9999(10)LOT-99999^FS');
	});
});

describe('buildCaseLabel4x4', () => {
	it('builds the generic case label with anonymized visible data', () => {
		const zpl = buildCaseLabel4x4();

		expect(zpl).toContain('^FDProduct Name^FS');
		expect(zpl).toContain('^FDITEM# 99999^FS');
		expect(zpl).toContain('^FDPLU# 9999^FS');
		expect(zpl).toContain('^FDDISTRIBUTED BY: DISTRIBUTOR^FS');
		expect(zpl).toContain('^FD0743999999999^FS');
		expect(zpl).toContain('^FD0 lb (0.00 kg)^FS');
		expect(zpl).toContain('^FD(01)00743999999999(13)260101(15)270101^FS');
		expect(zpl).toContain('^FD(01)00743999999999(21)9999(10)LOT-99999^FS');
		expect(zpl).not.toContain('LOBSTER TAILS');
		expect(zpl).not.toContain('44857');
		expect(zpl).not.toContain('1488');
		expect(zpl).not.toContain('MARK FOODS');
		expect(zpl).not.toContain('07434002030018');
		expect(zpl).not.toContain('LL-14-25-ART');
		expect(zpl).not.toContain('BARCODE 1');
		expect(zpl).not.toContain('BARCODE 2');
		expect(zpl).not.toContain('^FO30,520^GB');
	});

	it('encodes the GS1 leading and separator FNC1 characters', () => {
		const zpl = buildCaseLabel4x4();

		expect(zpl).toContain('^FD>;>801007439999999991326010115270101^FS');
		expect(zpl).toContain('^FD>;>80100743999999999219999>810>6LOT-99999^FS');
	});
});
