<script lang="ts">
	import { onMount } from 'svelte';
	import {
		buildCalibrationLabel3x3,
		buildDemoLabel as buildZplDemoLabel,
		DIGITAL_LINK_QR_URL,
		SIZE_DOTS,
		type PageSize
	} from '$lib/printing/zpl';
	import browserPrintUrl from '../../../zebra-browser-print-js-v31250/BrowserPrint-3.1.250.min.js?url';

	type BrowserPrintDevice = {
		name: string;
		uid: string;
		connection?: string;
		deviceType?: string;
		send: (
			data: string,
			onSuccess?: (response?: unknown) => void,
			onError?: (error: unknown) => void
		) => void;
		read?: (onSuccess?: (response?: unknown) => void, onError?: (error: unknown) => void) => void;
	};

	type TransportFilter = 'bluetooth' | 'usb' | 'lan';
	type PrinterBrand = 'zebra' | 'honeywell';

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

	const DEFAULT_LAN_PRINTER_IP = '192.168.1.123';
	const PRINT_AGENT_URL = 'http://localhost:8080';

	let browserPrintReady = $state(false);
	let loading = $state(true);
	let statusMessage = $state('Loading BrowserPrint library...');
	let printers = $state<BrowserPrintDevice[]>([]);
	let selectedUid = $state('');
	let selectedPrinter = $state<BrowserPrintDevice | null>(null);
	let pageSize = $state<PageSize>('4x6');
	let printerBrand = $state<PrinterBrand>('zebra');
	let transportFilter = $state<TransportFilter>('bluetooth');
	let printerIp = $state(DEFAULT_LAN_PRINTER_IP);
	let previewImageUrl = $state('');
	let previewLoading = $state(false);
	let previewError = $state('');
	let previewAbortController: AbortController | null = null;
	let zebraDiscoveryRequestId = 0;

	const PAGE_SIZE_OPTIONS: { value: PageSize; label: string }[] = [
		{ value: '4x6', label: '4x6 Logistic Label (GS1-128)' },
		{ value: '4x4', label: '4x4 Case Label (GTIN-14)' },
		{ value: '3x3', label: '3x3 GS1 Digital Link QR' }
	];

	const PRINTER_BRAND_OPTIONS: { value: PrinterBrand; label: string }[] = [
		{ value: 'zebra', label: 'ZEBRA' },
		{ value: 'honeywell', label: 'HONEYWELL' }
	];

	const TRANSPORT_OPTIONS: { value: TransportFilter; label: string }[] = [
		{ value: 'bluetooth', label: 'Bluetooth' },
		{ value: 'usb', label: 'USB' },
		{ value: 'lan', label: 'LAN' }
	];

	const PRINTER_DISCOVERY_TIMEOUT_MS = 5000;

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
			if (printerBrand === 'zebra') {
				statusMessage = 'BrowserPrint ready. Discovering Zebra printers...';
				await discoverZebraPrinters();
			}
		} catch (error) {
			if (printerBrand === 'zebra') {
				const message = error instanceof Error ? error.message : String(error);
				statusMessage = `Zebra Browser Print initialization failed: ${message}`;
			}
		} finally {
			loading = false;
		}
	}

	function getDefaultPrinter(): Promise<BrowserPrintDevice | null> {
		return new Promise((resolve, reject) => {
			const win = window as WindowWithZebra;
			if (!win.BrowserPrint) {
				reject(new Error('BrowserPrint API is not available.'));
				return;
			}

			win.BrowserPrint.getDefaultDevice('printer', resolve, reject);
		});
	}

	function getLocalPrinters(): Promise<BrowserPrintDevice[]> {
		return new Promise((resolve, reject) => {
			const win = window as WindowWithZebra;
			if (!win.BrowserPrint) {
				reject(new Error('BrowserPrint API is not available.'));
				return;
			}

			win.BrowserPrint.getLocalDevices(
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

	function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(
				() => reject(new Error(`Printer discovery timed out after ${timeoutMs / 1000} seconds.`)),
				timeoutMs
			);

			promise.then(
				(value) => {
					clearTimeout(timeoutId);
					resolve(value);
				},
				(error: unknown) => {
					clearTimeout(timeoutId);
					reject(error);
				}
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

		return (
			connection.includes('network') || connection.includes('tcp') || connection.includes('lan')
		);
	}

	function pickInitialPrinter(deviceList: BrowserPrintDevice[]) {
		const preferredByName = deviceList.find((device) =>
			device.name.toLowerCase().includes('qln420')
		);
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

	function getPreviewQrUrl(): string | null {
		if (pageSize !== '3x3') return null;
		return DIGITAL_LINK_QR_URL;
	}

	async function renderAccuratePreview() {
		previewAbortController?.abort();
		const abortController = new AbortController();
		previewAbortController = abortController;
		previewLoading = true;
		previewError = '';

		if (previewImageUrl) {
			URL.revokeObjectURL(previewImageUrl);
			previewImageUrl = '';
		}

		const previewSize = pageSize;
		const zpl = buildZplDemoLabel(pageSize);

		try {
			const response = await fetch(
				`https://api.labelary.com/v1/printers/8dpmm/labels/${previewSize}/0/`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded'
					},
					body: zpl,
					signal: abortController.signal
				}
			);

			if (!response.ok) {
				throw new Error(`Preview render failed (${response.status})`);
			}

			const blob = await response.blob();
			const imageUrl = URL.createObjectURL(blob);
			if (previewAbortController !== abortController) {
				URL.revokeObjectURL(imageUrl);
				return;
			}

			previewImageUrl = imageUrl;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				return;
			}

			if (previewAbortController === abortController) {
				previewError = error instanceof Error ? error.message : String(error);
			}
		} finally {
			if (previewAbortController === abortController) {
				previewLoading = false;
				previewAbortController = null;
			}
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

	async function discoverZebraPrinters() {
		if (printerBrand !== 'zebra' || transportFilter === 'lan') {
			return;
		}
		const requestId = ++zebraDiscoveryRequestId;

		const win = window as WindowWithZebra;
		if (!win.BrowserPrint) {
			statusMessage = 'BrowserPrint API is not available.';
			return;
		}

		loading = true;
		statusMessage = 'Searching for printers...';

		try {
			const [defaultResult, localResult] = await Promise.allSettled([
				withTimeout(getDefaultPrinter(), PRINTER_DISCOVERY_TIMEOUT_MS),
				withTimeout(getLocalPrinters(), PRINTER_DISCOVERY_TIMEOUT_MS)
			]);
			const defaultPrinter = defaultResult.status === 'fulfilled' ? defaultResult.value : null;
			const localPrinters = localResult.status === 'fulfilled' ? localResult.value : [];
			const merged = [defaultPrinter, ...localPrinters].filter(
				(device): device is BrowserPrintDevice => !!device
			);

			const seenUids: Record<string, boolean> = {};
			const uniqueByUid = merged.filter((device) => {
				if (seenUids[device.uid]) {
					return false;
				}
				seenUids[device.uid] = true;
				return true;
			});

			const filteredDevices = uniqueByUid.filter((device) => matchesTransportFilter(device));
			if (printerBrand !== 'zebra' || requestId !== zebraDiscoveryRequestId) {
				return;
			}

			printers = filteredDevices;

			const initial = pickInitialPrinter(filteredDevices);
			if (initial) {
				selectedUid = initial.uid;
				syncSelectedPrinter();
				statusMessage = `Ready. Selected printer: ${initial.name}`;
			} else {
				selectedUid = '';
				selectedPrinter = null;
				statusMessage = `No ${transportFilter.toUpperCase()} Zebra printer is connected. Label previews remain available.`;
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
		zebraDiscoveryRequestId += 1;
		selectedUid = '';
		selectedPrinter = null;
		if (printerBrand === 'zebra' && transportFilter !== 'lan') {
			void discoverZebraPrinters();
		} else if (transportFilter === 'lan') {
			statusMessage = 'Enter the LAN printer IP address, then test the local print agent.';
		}
	}

	function onPrinterBrandChange() {
		zebraDiscoveryRequestId += 1;
		printers = [];
		selectedUid = '';
		selectedPrinter = null;

		if (printerBrand === 'honeywell') {
			transportFilter = 'lan';
			loading = false;
			statusMessage = 'Honeywell selected. Test the local print agent before printing.';
			return;
		}

		transportFilter = 'bluetooth';
		if (browserPrintReady) {
			void discoverZebraPrinters();
		} else {
			statusMessage = 'Zebra selected. Waiting for Browser Print to initialize...';
		}
	}

	function onPageSizeChange() {
		void renderAccuratePreview();
	}

	async function getPrintAgentError(response: Response): Promise<string> {
		const body = await response.text();
		if (!body) return `Print agent request failed (${response.status}).`;

		try {
			const result = JSON.parse(body) as { error?: string; message?: string };
			return result.error ?? result.message ?? `Print agent request failed (${response.status}).`;
		} catch {
			return body;
		}
	}

	async function pingPrintAgent(): Promise<void> {
		const response = await fetch(`${PRINT_AGENT_URL}/ping`);
		if (!response.ok) throw new Error(await getPrintAgentError(response));
	}

	async function printWithAgent(zpl: string): Promise<void> {
		const response = await fetch(`${PRINT_AGENT_URL}/print`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ printerHostname: printerIp.trim(), text: zpl })
		});
		if (!response.ok) throw new Error(await getPrintAgentError(response));
	}

	async function testLanPrinter() {
		loading = true;

		try {
			statusMessage = `Checking local print agent at ${PRINT_AGENT_URL}...`;
			await pingPrintAgent();
			statusMessage = 'Local print agent is online and ready.';
		} catch (error) {
			statusMessage = `Connection test failed: ${toErrorMessage(error)}`;
		} finally {
			loading = false;
		}
	}

	async function printTestLabel() {
		if (transportFilter === 'lan') {
			loading = true;
			const labelZpl = buildZplDemoLabel(pageSize);
			try {
				statusMessage = `Sending ${pageSize} ZPL label through the local print agent...`;
				await printWithAgent(labelZpl);
				statusMessage = 'Print job accepted by the local print agent.';
			} catch (error) {
				statusMessage = `Print failed: ${toErrorMessage(error)}`;
			} finally {
				loading = false;
			}
			return;
		}

		const activePrinter = getActiveSelectedPrinter();
		if (!activePrinter) {
			statusMessage = 'Select a printer first.';
			return;
		}

		loading = true;
		statusMessage = `Sending ${pageSize} demo label to ${activePrinter.name}...`;
		const labelZpl = buildZplDemoLabel(pageSize);

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
		void renderAccuratePreview();

		return () => {
			const activePreviewRequest = previewAbortController;
			previewAbortController = null;
			activePreviewRequest?.abort();
			if (previewImageUrl) {
				URL.revokeObjectURL(previewImageUrl);
			}
		};
	});
</script>

<svelte:head>
	<title>Web App Print Test</title>
</svelte:head>

<main class="page">
	<h1>Web App Print Test</h1>
	<p class="help">
		Select a printer brand and GS1 label sample. Zebra USB/Bluetooth printing uses Browser Print;
		LAN printing uses the local print agent. Label previews work without a connected printer.
	</p>

	<div class="panel">
		<label for="printer-brand">Printer brand</label>
		<select id="printer-brand" bind:value={printerBrand} onchange={onPrinterBrandChange}>
			{#each PRINTER_BRAND_OPTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>

		<label for="transport">Connection type</label>
		<select
			id="transport"
			bind:value={transportFilter}
			onchange={onTransportChange}
			disabled={loading || printerBrand === 'honeywell'}
		>
			{#each TRANSPORT_OPTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>

		{#if transportFilter === 'lan'}
			<label for="printer-ip">Printer IP address</label>
			<input
				id="printer-ip"
				type="text"
				bind:value={printerIp}
				inputmode="decimal"
				placeholder="192.168.1.100"
				autocomplete="off"
				spellcheck="false"
			/>
			<p class="field-help">
				ZPL will be sent through the local print agent at {PRINT_AGENT_URL}.
			</p>
		{/if}

		{#if transportFilter !== 'lan'}
			<label for="printer">Available printer</label>
			<select
				id="printer"
				bind:value={selectedUid}
				onchange={onPrinterChange}
				disabled={loading || printers.length === 0}
			>
				<option value="">Select printer</option>
				{#each printers as printer (printer.uid)}
					<option value={printer.uid}>{printer.name}</option>
				{/each}
			</select>
		{/if}

		<label for="page-size">Demo label type</label>
		<select id="page-size" bind:value={pageSize} onchange={onPageSizeChange} disabled={loading}>
			{#each PAGE_SIZE_OPTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>

		<div class="actions">
			{#if transportFilter === 'lan'}
				<button type="button" onclick={testLanPrinter} disabled={loading || !printerIp.trim()}>
					Test connection
				</button>
				<button type="button" onclick={printTestLabel} disabled={loading || !printerIp.trim()}>
					Print selected demo label
				</button>
			{:else}
				<button
					type="button"
					onclick={discoverZebraPrinters}
					disabled={loading || !browserPrintReady}
				>
					Refresh printers
				</button>
				<button type="button" onclick={printTestLabel} disabled={loading || !selectedPrinter}>
					Print selected demo label
				</button>
			{/if}
		</div>

		<details class="preview" open>
			<summary>Print Preview (screen only)</summary>
			<div class="preview-card">
				{#if previewLoading}
					<p class="preview-note">Rendering accurate {pageSize} preview from ZPL...</p>
				{:else if previewImageUrl}
					<img
						class="preview-image"
						src={previewImageUrl}
						alt="Accurate {pageSize} preview generated from ZPL"
					/>
				{:else if pageSize === '3x3'}
					<div class="label3x3">
						<div class="p-company">COMPANIA DEMO</div>
						<div class="p-tagline">INNOVACION CALIDAD CONFIANZA</div>
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
				{:else if pageSize === '4x4'}
					<div class="label-generic">
						<strong>4x4 Case Label Preview</strong>
						<p>Company + GS1 data + product and SSCC barcode areas</p>
					</div>
				{:else}
					<div class="label-generic">
						<strong>4x6 Logistics Label Preview</strong>
						<p>From/To blocks + SSCC + GS1-128 + transport reference area</p>
					</div>
				{/if}
				{#if previewError}
					<p class="preview-error">Accurate preview is unavailable right now: {previewError}</p>
				{/if}
				<button
					type="button"
					onclick={renderAccuratePreview}
					disabled={previewLoading}
					class="preview-refresh"
				>
					Refresh accurate preview
				</button>
				{#if pageSize === '3x3'}
					<p class="preview-qr"><strong>QR URL:</strong> {getPreviewQrUrl()}</p>
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
	input,
	button {
		font-size: 1rem;
	}

	input {
		box-sizing: border-box;
		width: 100%;
		padding: 0.5rem 0.6rem;
	}

	.field-help {
		margin: -0.35rem 0 0;
		color: #64748b;
		font-size: 0.875rem;
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
