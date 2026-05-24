<script lang="ts">
	import { onMount } from 'svelte';
	import browserPrintUrl from '../../../zebra-browser-print-js-v31250/BrowserPrint-3.1.250.min.js?url';

	type BrowserPrintDevice = {
		name: string;
		uid: string;
		connection?: string;
		deviceType?: string;
		send: (data: string, onSuccess?: (response?: unknown) => void, onError?: (error: unknown) => void) => void;
		read?: (onSuccess?: (response?: unknown) => void, onError?: (error: unknown) => void) => void;
	};

	type PageSize = '4x6' | '4x4' | '3x3';
	type TransportFilter = 'bluetooth' | 'usb' | 'lan';

	type BrowserPrintApi = {
		getDefaultDevice: (
			type: string,
			onSuccess: (device: BrowserPrintDevice | null) => void,
			onError?: (error: unknown) => void
		) => void;
		getLocalDevices: (
			onSuccess: (devices: BrowserPrintDevice[] | Record<string, BrowserPrintDevice[]>) => void,
			onError?: (error: unknown) => void,
			typeFilter?: string
		) => void;
	};

	type WindowWithZebra = Window & {
		BrowserPrint?: BrowserPrintApi;
	};

	let browserPrintReady = $state(false);
	let loading = $state(true);
	let statusMessage = $state('Loading BrowserPrint library...');
	let printers = $state<BrowserPrintDevice[]>([]);
	let selectedUid = $state('');
	let selectedPrinter = $state<BrowserPrintDevice | null>(null);
	let pageSize = $state<PageSize>('4x6');
	let transportFilter = $state<TransportFilter>('bluetooth');
	let previewImageUrl = $state('');
	let previewLoading = $state(false);
	let previewError = $state('');

	const PAGE_SIZE_OPTIONS: { value: PageSize; label: string }[] = [
		{ value: '4x6', label: '4x6 Logistic Label (GS1-128)' },
		{ value: '4x4', label: '4x4 Case Label (GTIN-14)' },
		{ value: '3x3', label: '3x3 GS1 Digital Link QR' }
	];

	const TRANSPORT_OPTIONS: { value: TransportFilter; label: string }[] = [
		{ value: 'bluetooth', label: 'Bluetooth' },
		{ value: 'usb', label: 'USB' },
		{ value: 'lan', label: 'LAN' }
	];

	const SIZE_DOTS: Record<PageSize, { pw: number; ll: number }> = {
		'4x6': { pw: 812, ll: 1218 },
		'4x4': { pw: 812, ll: 812 },
		'3x3': { pw: 609, ll: 609 }
	};

	function scriptAlreadyLoaded(src: string): boolean {
		return !!document.querySelector(`script[src="${src}"]`);
	}

	function loadScript(src: string): Promise<void> {
		return new Promise((resolve, reject) => {
			if (scriptAlreadyLoaded(src)) {
				resolve();
				return;
			}

			const script = document.createElement('script');
			script.src = src;
			script.async = true;
			script.onload = () => resolve();
			script.onerror = () => reject(new Error(`Unable to load ${src}`));
			document.head.appendChild(script);
		});
	}

	async function initBrowserPrint() {
		loading = true;
		statusMessage = 'Loading BrowserPrint library...';

		try {
			const win = window as WindowWithZebra;
			await loadScript(browserPrintUrl);
			if (!win.BrowserPrint) {
				throw new Error('BrowserPrint loaded but did not initialize.');
			}

			browserPrintReady = true;
			statusMessage = 'BrowserPrint ready. Discovering Bluetooth printers...';
			await discoverBluetoothPrinters();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			statusMessage = `Initialization failed: ${message}`;
		} finally {
			loading = false;
		}
	}

	function getDefaultPrinter(): Promise<BrowserPrintDevice | null> {
		return new Promise((resolve, reject) => {
			const win = window as WindowWithZebra;
			win.BrowserPrint?.getDefaultDevice('printer', resolve, reject);
		});
	}

	function getLocalPrinters(): Promise<BrowserPrintDevice[]> {
		return new Promise((resolve, reject) => {
			const win = window as WindowWithZebra;
			win.BrowserPrint?.getLocalDevices(
				(devices: BrowserPrintDevice[] | Record<string, BrowserPrintDevice[]>) => {
					if (Array.isArray(devices)) {
						resolve(devices);
						return;
					}

					resolve(devices.printer ?? []);
				},
				reject,
				'printer'
			);
		});
	}

	function normalizeConnection(device: BrowserPrintDevice): string {
		return (device.connection ?? '').toLowerCase();
	}

	function matchesTransportFilter(device: BrowserPrintDevice): boolean {
		const connection = normalizeConnection(device);

		if (transportFilter === 'bluetooth') {
			return connection.includes('bluetooth') || connection === 'bt';
		}

		if (transportFilter === 'usb') {
			return connection.includes('usb');
		}

		return connection.includes('network') || connection.includes('tcp') || connection.includes('lan');
	}

	function pickInitialPrinter(deviceList: BrowserPrintDevice[]) {
		const preferredByName = deviceList.find((device) => device.name.toLowerCase().includes('qln420'));
		if (preferredByName) {
			return preferredByName;
		}

		return deviceList[0] ?? null;
	}

	function syncSelectedPrinter() {
		selectedPrinter = printers.find((printer) => printer.uid === selectedUid) ?? null;
	}

	function getActiveSelectedPrinter(): BrowserPrintDevice | null {
		if (!selectedUid) {
			selectedPrinter = null;
			return null;
		}

		const liveMatch = printers.find((printer) => printer.uid === selectedUid);
		if (liveMatch) {
			selectedPrinter = liveMatch;
			return liveMatch;
		}

		return selectedPrinter;
	}

	function handleTransportFailure(message: string, context: string) {
		const hint = looksLikeOfflineTransportError(message)
			? '. Connection appears offline. Reconnect in Zebra Browser Print and tap Refresh printers.'
			: '';
		statusMessage = `${context}: ${message}${hint}`;
	}

	function getYYMMDD(offsetDays = 0): string {
		const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
		const year = String(date.getFullYear()).slice(-2);
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}${month}${day}`;
	}

	function buildLogisticsLabel4x6(): string {
		const expDate = getYYMMDD(180);
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

	function buildCaseLabel4x4(): string {
		const packedDate = getYYMMDD(0);
		const expDate = getYYMMDD(120);
		return [
			'^XA',
			'^CI28',
			'^PON',
			`^PW${SIZE_DOTS['4x4'].pw}`,
			`^LL${SIZE_DOTS['4x4'].ll}`,
			'^LH0,0',
			'^CF0,42',
			'^FO35,30^FDDISTRIBUTION UNIT (CASE)^FS',
			'^CF0,30',
			'^FO35,95^FDProduct: PROTEIN BAR - CHOCOLATE^FS',
			'^FO35,135^FDGTIN-14: 10950110153000^FS',
			'^FO35,175^FDQuantity: 12 Units^FS',
			'^FO35,215^FDLot: LOT-CASE-9876^FS',
			`^FO35,255^FDPack: ${packedDate}   Exp: ${expDate}^FS`,
			'^BY3,3,170',
			`^FO35,320^BCN,170,Y,N,N^FD>;>8011095011015300037101210LOT-CASE-987617${expDate}^FS`,
			'^CF0,28',
			'^FO35,510^FD(01)10950110153000 (37)12 (10)LOT-CASE-9876^FS',
			'^FO35,545^FD(17) EXP DATE^FS',
			'^XZ'
		].join('');
	}

	function buildDigitalLinkLabel3x3(): string {
		const gtin = '07433200758007';
		const lot = '123ABC';
		const packingDate = '260530';
		const url = `https://id.2dgs1ni.com/01/${gtin}/11/${packingDate}/10/${lot}`;
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
			`^FDLA,${url}^FS`,
			'^FO322,500^A0N,30,30^FD(01) 07433200758007^FS',
			'^FO20,555^CF0,18^FDEsta etiqueta usa GS1 Digital Link para conectar producto e informacion.^FS',
			'^PQ1,0,1,N',
			'^XZ'
		].join('');
	}

	function buildCalibrationLabel3x3(): string {
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

	function buildDemoLabel(): string {
		if (pageSize === '4x4') {
			return buildCaseLabel4x4();
		}

		if (pageSize === '3x3') {
			return buildDigitalLinkLabel3x3();
		}

		return buildLogisticsLabel4x6();
	}

	function getPreviewQrUrl(): string | null {
		if (pageSize !== '3x3') return null;
		return 'https://id.2dgs1ni.com/01/07433200758007/11/260530/10/123ABC';
	}

	async function renderAccuratePreview3x3() {
		if (pageSize !== '3x3') {
			return;
		}

		previewLoading = true;
		previewError = '';

		const zpl = buildDigitalLinkLabel3x3();
		const previousObjectUrl = previewImageUrl;

		try {
			const response = await fetch('https://api.labelary.com/v1/printers/8dpmm/labels/3x3/0/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: zpl
			});

			if (!response.ok) {
				throw new Error(`Preview render failed (${response.status})`);
			}

			const blob = await response.blob();
			previewImageUrl = URL.createObjectURL(blob);
			if (previousObjectUrl) {
				URL.revokeObjectURL(previousObjectUrl);
			}
		} catch (error) {
			previewError = error instanceof Error ? error.message : String(error);
		} finally {
			previewLoading = false;
		}
	}

	function toErrorMessage(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}

	function looksLikeOfflineTransportError(message: string): boolean {
		const text = message.toLowerCase();
		return (
			text.includes('failed to write') ||
			text.includes('timed out') ||
			text.includes('refused') ||
			text.includes('offline') ||
			text.includes('unreachable') ||
			text.includes('connection')
		);
	}

	async function discoverBluetoothPrinters() {
		const win = window as WindowWithZebra;
		if (!win.BrowserPrint) {
			statusMessage = 'BrowserPrint API is not available.';
			return;
		}

		loading = true;
		statusMessage = 'Searching for printers...';

		try {
			const [defaultPrinter, localPrinters] = await Promise.all([getDefaultPrinter(), getLocalPrinters()]);
			const merged = [defaultPrinter, ...localPrinters].filter((device): device is BrowserPrintDevice => !!device);

			const seenUids: Record<string, boolean> = {};
			const uniqueByUid = merged.filter((device) => {
				if (seenUids[device.uid]) {
					return false;
				}
				seenUids[device.uid] = true;
				return true;
			});

			const filteredDevices = uniqueByUid.filter((device) => matchesTransportFilter(device));

			printers = filteredDevices;

			const initial = pickInitialPrinter(filteredDevices);
			if (initial) {
				selectedUid = initial.uid;
				syncSelectedPrinter();
				statusMessage = `Ready. Selected printer: ${initial.name}`;
			} else {
				selectedUid = '';
				selectedPrinter = null;
				statusMessage = `No ${transportFilter.toUpperCase()} Zebra printer found. Confirm Browser Print can see the device.`;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			statusMessage = `Discovery failed: ${message}`;
			printers = [];
			selectedUid = '';
			selectedPrinter = null;
		} finally {
			loading = false;
		}
	}

	function onPrinterChange() {
		syncSelectedPrinter();
		if (selectedPrinter) {
			statusMessage = `Selected printer: ${selectedPrinter.name}`;
		}
	}

	function onTransportChange() {
		selectedUid = '';
		selectedPrinter = null;
		void discoverBluetoothPrinters();
	}

	function onPageSizeChange() {
		if (pageSize === '3x3') {
			void renderAccuratePreview3x3();
		}
	}

	function printTestLabel() {
		const activePrinter = getActiveSelectedPrinter();
		if (!activePrinter) {
			statusMessage = 'Select a printer first.';
			return;
		}

		loading = true;
		statusMessage = `Sending ${pageSize} demo label to ${activePrinter.name}...`;
		const labelZpl = buildDemoLabel();

		activePrinter.send(
			labelZpl,
			() => {
				loading = false;
				statusMessage =
					'Print job sent. If no label prints, check media size, paper, battery, and Bluetooth pairing in Browser Print app.';
			},
			(error) => {
				loading = false;
				const message = toErrorMessage(error);
				handleTransportFailure(message, 'Print failed');
			}
		);
	}

	function printCalibrationPattern3x3() {
		const activePrinter = getActiveSelectedPrinter();
		if (!activePrinter) {
			statusMessage = 'Select a printer first.';
			return;
		}

		loading = true;
		statusMessage = `Sending 3x3 calibration pattern to ${activePrinter.name}...`;
		const labelZpl = buildCalibrationLabel3x3();

		activePrinter.send(
			labelZpl,
			() => {
				loading = false;
				statusMessage =
					'Calibration label sent. Check whether the next ready label is used and whether borders are fully visible.';
			},
			(error) => {
				loading = false;
				const message = toErrorMessage(error);
				handleTransportFailure(message, 'Calibration print failed');
			}
		);
	}

	function sendRawCommand(command: string, successMessage: string, errorPrefix: string) {
		const activePrinter = getActiveSelectedPrinter();
		if (!activePrinter) {
			statusMessage = 'Select a printer first.';
			return;
		}

		loading = true;
		activePrinter.send(
			command,
			() => {
				loading = false;
				statusMessage = successMessage;
			},
			(error) => {
				loading = false;
				const message = toErrorMessage(error);
				handleTransportFailure(message, errorPrefix);
			}
		);
	}

	function runMediaCalibration() {
		sendRawCommand(
			'~JC',
			'Media calibration command sent (~JC). Printer may feed labels while calibrating.',
			'Calibration command failed'
		);
	}

	function printSafeMode3x3() {
		const activePrinter = getActiveSelectedPrinter();
		if (!activePrinter) {
			statusMessage = 'Select a printer first.';
			return;
		}

		loading = true;
		statusMessage = `Sending 3x3 safe-mode test to ${activePrinter.name}...`;
		const safeZpl = [
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
			'^FO0,0^GB609,609,3^FS',
			'^FO24,24^CF0,26^FD3x3 SAFE MODE^FS',
			'^FO24,60^CF0,20^FDNo ^XB. Gap sensing. DT.^FS',
			'^FO24,565^CF0,20^FDEnd marker^FS',
			'^PQ1,0,1,N',
			'^XZ'
		].join('');

		activePrinter.send(
			safeZpl,
			() => {
				loading = false;
				statusMessage =
					'Safe-mode label sent. If first label is still blank, printer settings are likely the root cause.';
			},
			(error) => {
				loading = false;
				const message = toErrorMessage(error);
				handleTransportFailure(message, 'Safe-mode print failed');
			}
		);
	}

	onMount(() => {
		void initBrowserPrint();
		void renderAccuratePreview3x3();

		return () => {
			if (previewImageUrl) {
				URL.revokeObjectURL(previewImageUrl);
			}
		};
	});
</script>

<svelte:head>
	<title>Zebra Web App Print Test</title>
</svelte:head>

<main class="page">
	<h1>Zebra Web App Print Test</h1>
	<p class="help">
		Use this page in Android Chrome with the Zebra Browser Print app installed. It discovers Bluetooth
		printers and sends GS1 demo labels for selected page sizes.
	</p>

	<div class="panel">
		<label for="transport">Connection type</label>
		<select id="transport" bind:value={transportFilter} onchange={onTransportChange} disabled={loading}>
			{#each TRANSPORT_OPTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>

		<label for="printer">Available printer</label>
		<select id="printer" bind:value={selectedUid} onchange={onPrinterChange} disabled={loading || printers.length === 0}>
			<option value="">Select printer</option>
			{#each printers as printer (printer.uid)}
				<option value={printer.uid}>{printer.name}</option>
			{/each}
		</select>

		<label for="page-size">Demo label type</label>
		<select id="page-size" bind:value={pageSize} onchange={onPageSizeChange} disabled={loading}>
			{#each PAGE_SIZE_OPTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>

		<div class="actions">
			<button type="button" onclick={discoverBluetoothPrinters} disabled={loading || !browserPrintReady}>
				Refresh printers
			</button>
			<button type="button" onclick={printTestLabel} disabled={loading || !selectedPrinter}>
				Print selected demo label
			</button>
		</div>

		<details class="preview" open>
			<summary>Print Preview (screen only)</summary>
			<div class="preview-card">
				{#if pageSize === '3x3'}
					{#if previewLoading}
						<p class="preview-note">Rendering accurate 3x3 preview from ZPL...</p>
					{:else if previewImageUrl}
						<img class="preview-image" src={previewImageUrl} alt="Accurate 3x3 preview generated from ZPL" />
					{:else}
						<div class="label3x3">
							<div class="p-company">COMPANIA DEMO</div>
							<div class="p-tagline">INNOVACION  CALIDAD  CONFIANZA</div>
							<div class="p-product-label">PRODUCTO</div>
							<div class="p-product">Barra Nutritiva Trigo / Avena<br />45 gramos</div>
							<div class="p-divider p-divider-1"></div>
							<div class="p-gtin-label">GTIN</div>
							<div class="p-gtin-value">07433200758007</div>
							<div class="p-divider p-divider-2"></div>
							<div class="p-pack-label">FECHA EMPAQUE</div>
							<div class="p-pack-value">260530</div>
							<div class="p-divider p-divider-3"></div>
							<div class="p-lot-label">LOTE</div>
							<div class="p-lot-value">123ABC</div>
							<div class="p-qr">QR</div>
							<div class="p-qr-bottom">(01) 07433200758007</div>
						</div>
					{/if}
					{#if previewError}
						<p class="preview-error">Accurate preview is unavailable right now: {previewError}</p>
					{/if}
					<button
						type="button"
						onclick={renderAccuratePreview3x3}
						disabled={previewLoading}
						class="preview-refresh"
					>
						Refresh accurate preview
					</button>
					<p class="preview-qr"><strong>QR URL:</strong> {getPreviewQrUrl()}</p>
				{:else if pageSize === '4x4'}
					<div class="label-generic">
						<strong>4x4 Case Label Preview</strong>
						<p>Product + GTIN-14 + quantity + lot + dates + barcode area</p>
					</div>
				{:else}
					<div class="label-generic">
						<strong>4x6 Logistics Label Preview</strong>
						<p>From/To blocks + SSCC + GS1-128 + transport reference area</p>
					</div>
				{/if}
			</div>
		</details>
		<p class="status" aria-live="polite">{statusMessage}</p>
	</div>
</main>

<style>
	:global(body) {
		font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
	}

	.page {
		max-width: 44rem;
		margin: 2rem auto;
		padding: 0 1rem;
	}

	h1 {
		font-size: 1.7rem;
		margin-bottom: 0.75rem;
	}

	.help {
		margin-bottom: 1rem;
		color: #334155;
	}

	.panel {
		display: grid;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid #dbe2ea;
		border-radius: 0.75rem;
		background: #f8fafc;
	}

	label {
		font-weight: 600;
	}

	select,
	button {
		font-size: 1rem;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.preview {
		border: 1px solid #cbd5e1;
		border-radius: 0.5rem;
		background: #ffffff;
	}

	.preview summary {
		cursor: pointer;
		font-weight: 600;
		padding: 0.6rem 0.8rem;
	}

	.preview-card {
		padding: 0 0.8rem 0.8rem 0.8rem;
	}

	.preview-card p {
		margin: 0.4rem 0;
	}

	.label3x3 {
		position: relative;
		width: min(100%, 420px);
		aspect-ratio: 1 / 1;
		background: #fff;
		border: 1px solid #cbd5e1;
		border-radius: 0.35rem;
		overflow: hidden;
		font-family: Arial, sans-serif;
	}

	.label3x3 div {
		position: absolute;
		line-height: 1.1;
	}

	.label3x3 .p-company {
		left: 0;
		top: 5%;
		width: 100%;
		text-align: center;
		font-size: 1.25rem;
		font-weight: 700;
	}

	.label3x3 .p-tagline {
		left: 0;
		top: 13%;
		width: 100%;
		text-align: center;
		font-size: 0.62rem;
		letter-spacing: 0.02em;
	}

	.label3x3 .p-product {
		left: 3.5%;
		top: 25%;
		width: 50%;
		font-size: 0.74rem;
		font-weight: 600;
	}

	.label3x3 .p-product-label {
		left: 3.5%;
		top: 21%;
		font-size: 0.62rem;
		font-weight: 700;
	}

	.label3x3 .p-divider {
		left: 3.5%;
		width: 50%;
		height: 0;
		border-top: 2px solid #111;
	}

	.label3x3 .p-divider-1 {
		top: 36%;
	}

	.label3x3 .p-divider-2 {
		top: 52%;
	}

	.label3x3 .p-divider-3 {
		top: 68%;
	}

	.label3x3 .p-gtin-label,
	.label3x3 .p-pack-label,
	.label3x3 .p-lot-label {
		left: 3.5%;
		font-size: 0.62rem;
		font-weight: 700;
	}

	.label3x3 .p-gtin-label {
		top: 40%;
	}

	.label3x3 .p-pack-label {
		top: 56%;
	}

	.label3x3 .p-lot-label {
		top: 72%;
	}

	.label3x3 .p-gtin-value,
	.label3x3 .p-pack-value,
	.label3x3 .p-lot-value {
		left: 3.5%;
		font-size: 0.86rem;
		font-weight: 700;
	}

	.label3x3 .p-gtin-value {
		top: 45%;
	}

	.label3x3 .p-pack-value {
		top: 61%;
	}

	.label3x3 .p-lot-value {
		top: 77%;
	}

	.label3x3 .p-qr {
		right: 5%;
		top: 28%;
		width: 36%;
		aspect-ratio: 1 / 1;
		border: 2px solid #111;
		display: grid;
		place-items: center;
		font-size: 0.95rem;
		font-weight: 700;
		background:
			repeating-linear-gradient(0deg, #000 0 3px, #fff 3px 6px),
			repeating-linear-gradient(90deg, #000 0 3px, #fff 3px 6px);
		color: #fff;
		mix-blend-mode: difference;
	}

	.label3x3 .p-qr-bottom {
		right: 5%;
		top: 67%;
		width: 36%;
		text-align: center;
		font-size: 0.8rem;
		font-weight: 700;
	}

	.label-generic {
		border: 1px dashed #94a3b8;
		border-radius: 0.35rem;
		padding: 0.8rem;
		background: #fff;
	}

	.preview-qr {
		word-break: break-all;
		font-size: 0.9rem;
	}

	.preview-note,
	.preview-error {
		margin: 0.4rem 0;
		font-size: 0.92rem;
	}

	.preview-error {
		color: #9f1239;
	}

	.preview-image {
		display: block;
		width: min(100%, 420px);
		height: auto;
		border: 1px solid #cbd5e1;
		border-radius: 0.35rem;
		background: #fff;
	}

	.preview-refresh {
		margin-top: 0.5rem;
	}

	button {
		padding: 0.6rem 1rem;
		border: 1px solid #cbd5e1;
		border-radius: 0.5rem;
		background: white;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.status {
		margin: 0;
		font-size: 0.95rem;
	}
</style>