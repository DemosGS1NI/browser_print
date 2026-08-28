export type PageSize = '4x6' | '4x4' | '3x3';
export type LabelSample = PageSize | '4x4-datamatrix' | '4x4-digital-link';

export const SIZE_DOTS: Record<PageSize, { pw: number; ll: number }> = {
	'4x6': { pw: 812, ll: 1218 },
	'4x4': { pw: 812, ll: 812 },
	'3x3': { pw: 609, ll: 609 }
};

export const DIGITAL_LINK_QR_URL = 'https://id.2dgs1ni.com/01/07433200758007/11/260530/10/123ABC';
export const GENERIC_CASE_DIGITAL_LINK_URL =
	'https://id.gs1.org/01/00743999999999/10/LOT-99999/21/9999?13=260101&15=270101';

export function getPageSize(labelSample: LabelSample): PageSize {
	if (labelSample.startsWith('4x4')) return '4x4';
	return labelSample as PageSize;
}

function getYYMMDD(offsetDays = 0, now = Date.now()): string {
	const date = new Date(now + offsetDays * 24 * 60 * 60 * 1000);
	const year = String(date.getFullYear()).slice(-2);
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}${month}${day}`;
}

export function buildLogisticsLabel4x6(now = Date.now()): string {
	const expDate = getYYMMDD(180, now);
	return [
		'^XA',
		'^CI28',
		'^PON',
		`^PW${SIZE_DOTS['4x6'].pw}`,
		`^LL${SIZE_DOTS['4x6'].ll}`,
		'^MNY',
		'^LH0,0',
		'^LT0',
		'^LS0',
		'^CF0,32',
		'^FO30,30^FDFROM:^FS',
		'^CF0,28',
		'^FO30,70^FDNORTHRIDGE FOODS LLC^FS',
		'^FO30,105^FD2100 WAREHOUSE AVE, DALLAS TX 75201^FS',
		'^CF0,32',
		'^FO30,165^FDTO:^FS',
		'^CF0,28',
		'^FO30,205^FDPACIFIC RETAIL DC^FS',
		'^FO30,240^FD950 COMMERCE BLVD, PHOENIX AZ 85043^FS',
		'^BY3,3,130',
		'^FO30,310^BCN,130,N,N,N^FD>;>800012345678901234^FS',
		'^CF0,26',
		'^FO30,450^FD(00) 00012345678901234 SSCC^FS',
		'^BY3,3,120',
		`^FO30,500^BCN,120,N,N,N^FD>;>801095011015300017${expDate}10LOT123^FS`,
		'^CF0,26',
		'^FO30,635^FD(01) 09501101530003 (17) EXP (10) LOT123^FS',
		'^FO30,680^FDCarrier: DEMO FREIGHT  Service: GROUND^FS',
		'^FO30,715^FDRef: SO-104287  Carton: 1/1^FS',
		'^FO30,1125^GB750,2,2^FS',
		'^CF0,22',
		'^FO30,1140^FD4x6 LENGTH CHECK MARKER^FS',
		'^XZ'
	].join('');
}

const GENERIC_CASE_GTIN_DISPLAY = '0743999999999';
const GENERIC_CASE_GTIN_AI = '00743999999999';
const GENERIC_CASE_NET_WEIGHT = '0 lb (0.00 kg)';
const GENERIC_CASE_PACKED_DATE = '260101';
const GENERIC_CASE_BEST_BEFORE_DATE = '270101';
const GENERIC_CASE_SERIAL = '9999';
const GENERIC_CASE_LOT = 'LOT-99999';

function buildGenericCaseLabelFrame4x4(): string[] {
	return [
		'^XA',
		'^CI28',
		'^PON',
		`^PW${SIZE_DOTS['4x4'].pw}`,
		`^LL${SIZE_DOTS['4x4'].ll}`,
		'^MNY',
		'^LH0,0',
		'^LT0',
		'^LS0',
		'^FO0,34^A0N,44,44^FB812,1,0,C,0^FDProduct Name^FS',
		'^FO35,110^A0N,27,27^FDITEM# 99999^FS',
		'^FO0,100^A0N,45,45^FB812,1,0,C,0^FDSIZE: SAMPLE^FS',
		'^FO620,110^A0N,27,27^FDPLU# 9999^FS',
		'^FO0,160^A0N,29,29^FB812,1,0,C,0^FDPRODUCT CATEGORY^FS',
		'^FO0,202^A0N,28,28^FB812,1,0,C,0^FDPRODUCT ORIGIN^FS',
		'^FO0,243^A0N,27,27^FB812,1,0,C,0^FDDISTRIBUTED BY: DISTRIBUTOR^FS',
		'^FO30,282^GB752,3,3^FS',
		'^FO50,307^A0N,25,25^FDGTIN^FS',
		`^FO50,344^A0N,30,30^FD${GENERIC_CASE_GTIN_DISPLAY}^FS`,
		'^FO485,307^A0N,25,25^FDNET WEIGHT^FS',
		`^FO485,344^A0N,30,30^FD${GENERIC_CASE_NET_WEIGHT}^FS`,
		'^FO30,385^GB752,3,3^FS'
	];
}

export function buildCaseLabel4x4(_now = Date.now()): string {
	const gtin = GENERIC_CASE_GTIN_AI;
	const packedDate = GENERIC_CASE_PACKED_DATE;
	const bestBeforeDate = GENERIC_CASE_BEST_BEFORE_DATE;
	const serial = GENERIC_CASE_SERIAL;
	const lotNumber = GENERIC_CASE_LOT;
	const barcode1Data = `>;>801${gtin}13${packedDate}15${bestBeforeDate}`;
	// AI (21) is variable length, so >8 inserts the required FNC1 before AI (10).
	// Numeric data stays in subset C; the alphanumeric lot switches to subset B.
	const barcode2Data = `>;>801${gtin}21${serial}>810>6${lotNumber}`;
	const moduleWidth = 2;
	const centeredCode128X = (numericDigitCount: number, fnc1Count: number): number => {
		const dataCodewords = numericDigitCount / 2 + fnc1Count;
		const barcodeModules = 11 * (dataCodewords + 2) + 13;
		return Math.round((SIZE_DOTS['4x4'].pw - barcodeModules * moduleWidth) / 2);
	};
	const barcode1X = centeredCode128X(
		2 + gtin.length + 2 + packedDate.length + 2 + bestBeforeDate.length,
		1
	);
	// Start, FNC1, 11 numeric pairs, separator FNC1, AI (10), switch B,
	// the 12-character lot, checksum and stop character.
	const barcode2Modules = 11 * (1 + 1 + 11 + 1 + 1 + 1 + lotNumber.length + 1) + 13;
	const barcode2X = Math.round((SIZE_DOTS['4x4'].pw - barcode2Modules * moduleWidth) / 2);

	return [
		...buildGenericCaseLabelFrame4x4(),
		'^BY2,3,112',
		`^FO${barcode1X},410^BCN,112,N,N,N^FD${barcode1Data}^FS`,
		`^FO0,529^A0N,19,19^FB812,1,0,C,0^FD(01)${gtin}(13)${packedDate}(15)${bestBeforeDate}^FS`,
		'^BY2,3,112',
		`^FO${barcode2X},592^BCN,112,N,N,N^FD${barcode2Data}^FS`,
		`^FO0,711^A0N,19,19^FB812,1,0,C,0^FD(01)${gtin}(21)${serial}(10)${lotNumber}^FS`,
		'^PQ1,0,1,N',
		'^XZ'
	].join('');
}

export function buildCaseLabelDataMatrix4x4(): string {
	const data = `_101${GENERIC_CASE_GTIN_AI}13${GENERIC_CASE_PACKED_DATE}15${GENERIC_CASE_BEST_BEFORE_DATE}21${GENERIC_CASE_SERIAL}_110${GENERIC_CASE_LOT}`;

	return [
		...buildGenericCaseLabelFrame4x4(),
		'^FO276,440^BXN,10,200,26,26,,_^FD',
		data,
		'^FS',
		`^FO0,710^A0N,16,16^FB812,1,0,C,0^FD(01)${GENERIC_CASE_GTIN_AI}(13)${GENERIC_CASE_PACKED_DATE}(15)${GENERIC_CASE_BEST_BEFORE_DATE}(21)${GENERIC_CASE_SERIAL}(10)${GENERIC_CASE_LOT}^FS`,
		'^PQ1,0,1,N',
		'^XZ'
	].join('');
}

export function buildCaseLabelDigitalLink4x4(): string {
	return [
		...buildGenericCaseLabelFrame4x4(),
		'^FO258,430^BQN,2,8',
		`^FDLA,${GENERIC_CASE_DIGITAL_LINK_URL}^FS`,
		`^FO0,735^A0N,16,16^FB812,1,0,C,0^FD(01)${GENERIC_CASE_GTIN_AI}(13)${GENERIC_CASE_PACKED_DATE}(15)${GENERIC_CASE_BEST_BEFORE_DATE}(21)${GENERIC_CASE_SERIAL}(10)${GENERIC_CASE_LOT}^FS`,
		'^PQ1,0,1,N',
		'^XZ'
	].join('');
}

export function buildDigitalLinkLabel3x3(): string {
	const gtin = '07433200758007';
	const lot = '123ABC';
	const packingDate = '260530';
	return [
		'^XA',
		'^CI28',
		'^PON',
		'^MMT',
		'^MNY',
		'^MTD',
		'^LH0,0',
		'^LT0',
		'^LS0',
		`^PW${SIZE_DOTS['3x3'].pw}`,
		`^LL${SIZE_DOTS['3x3'].ll}`,
		'^FO0,24^A0N,40,40^FB609,1,0,C,0^FDCOMPANIA DEMO^FS',
		'^FO0,68^A0N,22,22^FB609,1,0,C,0^FDINNOVACION  CALIDAD  CONFIANZA^FS',
		'^FO20,96^CF0,28^FDPRODUCTO^FS',
		'^FO20,128^CF0,22^FDBarra Nutritiva Trigo / Avena^FS',
		'^FO20,155^CF0,22^FD45 gramos^FS',
		'^FO20,190^GB288,2,2^FS',
		'^FO20,212^CF0,28^FDGTIN^FS',
		`^FO20,244^CF0,40^FD${gtin}^FS`,
		'^FO20,292^GB288,2,2^FS',
		'^FO20,306^CF0,28^FDFECHA EMPAQUE^FS',
		`^FO20,338^CF0,40^FD${packingDate}^FS`,
		'^FO20,386^GB288,2,2^FS',
		'^FO20,406^CF0,28^FDLOTE^FS',
		`^FO20,438^CF0,40^FD${lot}^FS`,
		'^FO352,178^BQN,2,8',
		`^FDLA,${DIGITAL_LINK_QR_URL}^FS`,
		'^FO322,500^A0N,30,30^FD(01) 07433200758007^FS',
		'^FO20,555^CF0,18^FDEsta etiqueta usa GS1 Digital Link para conectar producto e informacion.^FS',
		'^PQ1,0,1,N',
		'^XZ'
	].join('');
}

export function buildCalibrationLabel3x3(): string {
	return [
		'^XA',
		'^CI28',
		'^PON',
		'^MMT',
		'^XB',
		`^PW${SIZE_DOTS['3x3'].pw}`,
		`^LL${SIZE_DOTS['3x3'].ll}`,
		'^MNY',
		'^LH0,0',
		'^LT0',
		'^LS0',
		'^FO0,0^GB609,609,3^FS',
		'^FO18,18^GB573,573,1^FS',
		'^FO0,0^GB120,120,3^FS',
		'^FO24,24^CF0,26^FD3x3 CAL TEST^FS',
		'^FO24,60^CF0,20^FDTop-left anchor^FS',
		'^FO24,565^CF0,20^FDBottom edge marker^FS',
		'^XZ'
	].join('');
}

export function buildDemoLabel(labelSample: LabelSample, now = Date.now()): string {
	if (labelSample === '4x4') return buildCaseLabel4x4(now);
	if (labelSample === '4x4-datamatrix') return buildCaseLabelDataMatrix4x4();
	if (labelSample === '4x4-digital-link') return buildCaseLabelDigitalLink4x4();
	if (labelSample === '3x3') return buildDigitalLinkLabel3x3();
	return buildLogisticsLabel4x6(now);
}
