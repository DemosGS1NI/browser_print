<script lang="ts">
	import { onMount } from 'svelte';
	import browserPrintUrl from '../../../zebra-browser-print-js-v31250/BrowserPrint-3.1.250.min.js?url';
	import zebraLibraryUrl from '../../../zebra-browser-print-js-v31250/BrowserPrint-Zebra-1.1.250.min.js?url';

	type BrowserPrintDevice = {
		name: string;
		uid: string;
		connection?: string;
		deviceType?: string;
		send: (data: string, onSuccess?: (response?: unknown) => void, onError?: (error: unknown) => void) => void;
		read?: (onSuccess?: (response?: unknown) => void, onError?: (error: unknown) => void) => void;
	};

	type ZebraPrinterStatus = {
		offline?: boolean;
		paperOut?: boolean;
		paused?: boolean;
		headOpen?: boolean;
		ribbonOut?: boolean;
		isPrinterReady?: () => boolean;
		getMessage?: () => string;
		raw?: string;
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

	type ZebraApi = {
		Printer: (new (device: BrowserPrintDevice) => {
			getStatus: (onSuccess: (status: ZebraPrinterStatus) => void, onError?: (error: unknown) => void) => void;
		}) & {
			Status?: new (raw: string) => ZebraPrinterStatus;
		};
	};

	type WindowWithZebra = Window & {
		BrowserPrint?: BrowserPrintApi;
		Zebra?: ZebraApi;
	};

	let browserPrintReady = $state(false);
	let loading = $state(true);
	let statusMessage = $state('Loading BrowserPrint library...');
	let printerStatus = $state('Status not queried yet.');
	let printers = $state<BrowserPrintDevice[]>([]);
	let selectedUid = $state('');
	let selectedPrinter = $state<BrowserPrintDevice | null>(null);
	let pageSize = $state<PageSize>('4x6');
	let transportFilter = $state<TransportFilter>('bluetooth');
	let statusQueryRunning = $state(false);
	let decodedStatus = $state<ZebraPrinterStatus | null>(null);

	const STATUS_TIMEOUT_MS = 8000;

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
			await loadScript(zebraLibraryUrl);
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
			`^PW${SIZE_DOTS['4x6'].pw}`,
			`^LL${SIZE_DOTS['4x6'].ll}`,
			'^LH0,0',
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
			'^XZ'
		].join('');
	}

	function buildCaseLabel4x4(): string {
		const packedDate = getYYMMDD(0);
		const expDate = getYYMMDD(120);
		return [
			'^XA',
			'^CI28',
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
		const serial = 'SN-00004567';
		const lot = 'LOT-DL-2201';
		const url = `https://id.demo.example/01/09501101530003/21/${serial}/10/${lot}`;
		return [
			'^XA',
			'^CI28',
			`^PW${SIZE_DOTS['3x3'].pw}`,
			`^LL${SIZE_DOTS['3x3'].ll}`,
			'^LH0,0',
			'^CF0,34',
			'^FO24,22^FDGS1 DIGITAL LINK DEMO^FS',
			'^CF0,24',
			'^FO24,66^FDGTIN: 09501101530003^FS',
			`^FO24,98^FDLOT: ${lot}^FS`,
			`^FO24,128^FDSERIAL: ${serial}^FS`,
			'^FO130,165^BQN,2,7',
			`^FDLA,${url}^FS`,
			'^CF0,20',
			'^FO24,540^FDScan QR for GS1 Digital Link data^FS',
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

	function formatStatusFromZebra(status: ZebraPrinterStatus): string {
		const rawPieces: string[] = [];
		if (status.offline) rawPieces.push('offline');
		if (status.paperOut) rawPieces.push('paper out');
		if (status.headOpen) rawPieces.push('head open');
		if (status.paused) rawPieces.push('paused');
		if (status.ribbonOut) rawPieces.push('ribbon out');

		const primary = status.getMessage ? status.getMessage() : rawPieces.length > 0 ? rawPieces.join(', ') : 'Ready';
		const details = rawPieces.length > 0 ? ` (${rawPieces.join(', ')})` : '';
		return `${primary}${details}`;
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

	function setDecodedOffline(reason = 'Offline or unreachable'): void {
		decodedStatus = {
			offline: true,
			paperOut: false,
			headOpen: false,
			paused: false,
			ribbonOut: false,
			isPrinterReady: () => false,
			getMessage: () => reason
		};
	}

	function readyFlag(): 'ok' | 'bad' | 'unknown' {
		if (!decodedStatus) return 'unknown';
		return decodedStatus.isPrinterReady?.() ? 'ok' : 'bad';
	}

	function problemFlag(problem: boolean | undefined): 'ok' | 'bad' | 'unknown' {
		if (!decodedStatus || problem === undefined) return 'unknown';
		return problem ? 'bad' : 'ok';
	}

	function parseRawHsStatus(rawText: string): string {
		const raw = rawText.trim();
		if (!raw) {
			decodedStatus = null;
			return 'Empty response from printer.';
		}

		const win = window as WindowWithZebra;
		const statusCtor = win.Zebra?.Printer?.Status;
		if (statusCtor) {
			try {
				const parsed = new statusCtor(raw);
				decodedStatus = parsed;
				const human = formatStatusFromZebra(parsed);
				return `${human} | Raw ~HS: ${raw}`;
			} catch {
				// Fall through to generic fallback parser below.
			}
		}

		decodedStatus = null;
		const parts = raw.split(',');
		if (parts.length < 2) {
			return `Raw status: ${raw}`;
		}

		return `Raw ~HS has ${parts.length} fields. Raw: ${raw}`;
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
			printerStatus = 'Status not queried yet.';
			decodedStatus = null;
		}
	}

	function onTransportChange() {
		selectedUid = '';
		selectedPrinter = null;
		decodedStatus = null;
		printerStatus = 'Status not queried yet.';
		void discoverBluetoothPrinters();
	}

	function queryPrinterStatus() {
		if (!selectedPrinter) {
			statusMessage = 'Select a Bluetooth printer first.';
			return;
		}

		if (statusQueryRunning) {
			statusMessage = 'Status query already in progress. Please wait.';
			return;
		}

		const activePrinter = selectedPrinter;
		if (!activePrinter.read) {
			decodedStatus = null;
			printerStatus = 'Status query not supported by this device API.';
			statusMessage = 'Cannot query status on this client.';
			return;
		}

		statusQueryRunning = true;
		loading = true;
		statusMessage = `Querying status from ${activePrinter.name} (timeout ${STATUS_TIMEOUT_MS / 1000}s)...`;

		let completed = false;
		const finish = (nextPrinterStatus: string, nextStatusMessage: string) => {
			if (completed) return;
			completed = true;
			clearTimeout(timeoutId);
			printerStatus = nextPrinterStatus;
			statusMessage = nextStatusMessage;
			loading = false;
			statusQueryRunning = false;
		};

		const timeoutId = setTimeout(() => {
			setDecodedOffline('No response from printer');
			finish(
				`Status query timeout after ${STATUS_TIMEOUT_MS / 1000}s.`,
				'Status query timed out. Printer may be busy or not responding.'
			);
		}, STATUS_TIMEOUT_MS);

		activePrinter.send(
			'~HS',
			() => {
				activePrinter.read?.(
					(response) => {
						const raw = String(response ?? '');
						finish(parseRawHsStatus(raw), `Status received from ${activePrinter.name}.`);
					},
					(error) => {
						const message = toErrorMessage(error);
						if (looksLikeOfflineTransportError(message)) {
							setDecodedOffline('Offline or unreachable');
						} else {
							decodedStatus = null;
						}
						finish(`Status read failed: ${message}`, 'Printer status read failed.');
					}
				);
			},
			(error) => {
				const message = toErrorMessage(error);
				if (looksLikeOfflineTransportError(message)) {
					setDecodedOffline('Offline or unreachable');
				} else {
					decodedStatus = null;
				}
				finish(`Status send failed: ${message}`, 'Printer status request failed.');
			}
		);
	}

	function printTestLabel() {
		if (!selectedPrinter) {
			statusMessage = 'Select a Bluetooth printer first.';
			return;
		}

		loading = true;
		statusMessage = `Sending ${pageSize} demo label to ${selectedPrinter.name}...`;
		const labelZpl = buildDemoLabel();

		selectedPrinter.send(
			labelZpl,
			() => {
				loading = false;
				statusMessage =
					'Print job sent. If no label prints, check media size, paper, battery, and Bluetooth pairing in Browser Print app.';
			},
			(error) => {
				loading = false;
				const message = error instanceof Error ? error.message : String(error);
				statusMessage = `Print failed: ${message}`;
			}
		);
	}

	onMount(() => {
		void initBrowserPrint();
	});
</script>

<svelte:head>
	<title>Zebra Bluetooth Print Test</title>
</svelte:head>

<main class="page">
	<h1>Zebra QLn420 Bluetooth Print Test</h1>
	<p class="help">
		Use this page in Android Chrome with the Zebra Browser Print app installed. It discovers Bluetooth
		printers, queries status, and sends GS1 demo labels for selected page sizes.
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
		<select id="page-size" bind:value={pageSize} disabled={loading}>
			{#each PAGE_SIZE_OPTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>

		<div class="actions">
			<button type="button" onclick={discoverBluetoothPrinters} disabled={loading || !browserPrintReady}>
				Refresh printers
			</button>
			<button type="button" onclick={queryPrinterStatus} disabled={loading || !selectedPrinter}>
				Query printer status
			</button>
			<button type="button" onclick={printTestLabel} disabled={loading || !selectedPrinter}>
				Print selected demo label
			</button>
		</div>

		<div class="flags">
			<span class:ok={readyFlag() === 'ok'} class:bad={readyFlag() === 'bad'} class:unknown={readyFlag() === 'unknown'}>
				Ready
			</span>
			<span class:ok={problemFlag(decodedStatus?.offline) === 'ok'} class:bad={problemFlag(decodedStatus?.offline) === 'bad'} class:unknown={problemFlag(decodedStatus?.offline) === 'unknown'}>
				Offline
			</span>
			<span class:ok={problemFlag(decodedStatus?.paperOut) === 'ok'} class:bad={problemFlag(decodedStatus?.paperOut) === 'bad'} class:unknown={problemFlag(decodedStatus?.paperOut) === 'unknown'}>
				Paper Out
			</span>
			<span class:ok={problemFlag(decodedStatus?.headOpen) === 'ok'} class:bad={problemFlag(decodedStatus?.headOpen) === 'bad'} class:unknown={problemFlag(decodedStatus?.headOpen) === 'unknown'}>
				Head Open
			</span>
			<span class:ok={problemFlag(decodedStatus?.paused) === 'ok'} class:bad={problemFlag(decodedStatus?.paused) === 'bad'} class:unknown={problemFlag(decodedStatus?.paused) === 'unknown'}>
				Paused
			</span>
			<span class:ok={problemFlag(decodedStatus?.ribbonOut) === 'ok'} class:bad={problemFlag(decodedStatus?.ribbonOut) === 'bad'} class:unknown={problemFlag(decodedStatus?.ribbonOut) === 'unknown'}>
				Ribbon Out
			</span>
		</div>

		<p class="status"><strong>Printer status:</strong> {printerStatus}</p>
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

	.flags {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.flags span {
		font-size: 0.8rem;
		padding: 0.25rem 0.5rem;
		border-radius: 999px;
		border: 1px solid #cbd5e1;
		background: #f1f5f9;
	}

	.flags span.ok {
		background: #dcfce7;
		border-color: #22c55e;
		color: #166534;
	}

	.flags span.bad {
		background: #fee2e2;
		border-color: #ef4444;
		color: #991b1b;
	}

	.flags span.unknown {
		background: #e2e8f0;
		border-color: #94a3b8;
		color: #334155;
	}
</style>