export type PageSize = '4x6' | '4x4' | '3x3';

export const SIZE_DOTS: Record<PageSize, { pw: number; ll: number }> = {
	'4x6': { pw: 812, ll: 1218 },
	'4x4': { pw: 812, ll: 812 },
	'3x3': { pw: 609, ll: 609 }
};

export const DIGITAL_LINK_QR_URL = 'https://id.2dgs1ni.com/01/07433200758007/11/260530/10/123ABC';

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
		'^FO30,310^BCN,130,Y,N,N^FD>;>800012345678901234^FS',
		'^CF0,26',
		'^FO30,450^FD(00) 00012345678901234 SSCC^FS',
		'^BY3,3,120',
		`^FO30,500^BCN,120,Y,N,N^FD>;>801095011015300017${expDate}10LOT123^FS`,
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

export function buildCaseLabel4x4(now = Date.now()): string {
	const gtin = '09501101530003';
	const sscc = '000123456789012343';
	const count = '12';
	const bestBeforeDate = getYYMMDD(180, now);
	const lotNumber = '123456';
	const productBarcodeData = `>;>801${gtin}15${bestBeforeDate}10${lotNumber}>837${count}`;
	const ssccBarcodeData = `>;>800${sscc}`;
	const moduleWidth = 2;
	const centeredCode128X = (numericDigitCount: number, fnc1Count: number): number => {
		const dataCodewords = numericDigitCount / 2 + fnc1Count;
		const barcodeModules = 11 * (dataCodewords + 2) + 13;
		return Math.round((SIZE_DOTS['4x4'].pw - barcodeModules * moduleWidth) / 2);
	};
	const productBarcodeX = centeredCode128X(
		2 + gtin.length + 2 + bestBeforeDate.length + 2 + lotNumber.length + 2 + count.length,
		2
	);
	const ssccBarcodeX = centeredCode128X(2 + sscc.length, 1);

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
		'^FO0,24^A0N,46,46^FB812,1,0,C,0^FDDEMO COMPANY^FS',
		'^FO30,88^GB752,3,3^FS',
		'^CF0,30',
		`^FO40,112^FDSSCC:^FS^FO260,112^FD${sscc}^FS`,
		`^FO40,152^FDGTIN:^FS^FO260,152^FD${gtin}^FS`,
		`^FO40,192^FDCOUNT:^FS^FO260,192^FD${count}^FS`,
		`^FO40,232^FDBEST BEFORE:^FS^FO260,232^FD${bestBeforeDate}^FS`,
		`^FO40,272^FDLOT NUMBER:^FS^FO260,272^FD${lotNumber}^FS`,
		'^FO30,318^GB752,3,3^FS',
		'^FO0,338^A0N,24,24^FB812,1,0,C,0^FDGTIN / BEST BEFORE / LOT / COUNT^FS',
		'^BY2,3,105',
		`^FO${productBarcodeX},370^BCN,105,N,N,N^FD${productBarcodeData}^FS`,
		`^FO0,488^A0N,18,18^FB812,1,0,C,0^FD(01) ${gtin}  (15) ${bestBeforeDate}  (10) ${lotNumber}  (37) ${count}^FS`,
		'^FO0,538^A0N,24,24^FB812,1,0,C,0^FDSSCC^FS',
		'^BY2,3,105',
		`^FO${ssccBarcodeX},570^BCN,105,N,N,N^FD${ssccBarcodeData}^FS`,
		'^CF0,22',
		`^FO0,688^FB812,1,0,C,0^FD(00) ${sscc}^FS`,
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

export function buildDemoLabel(pageSize: PageSize, now = Date.now()): string {
	if (pageSize === '4x4') return buildCaseLabel4x4(now);
	if (pageSize === '3x3') return buildDigitalLinkLabel3x3();
	return buildLogisticsLabel4x6(now);
}
