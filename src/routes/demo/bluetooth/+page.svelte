<script lang="ts">
	import { onMount } from 'svelte';
	import {
		buildCalibrationLabel3x3,
		buildDemoLabel as buildZplDemoLabel,
		DIGITAL_LINK_QR_URL,
		GENERIC_CASE_DIGITAL_LINK_URL,
		getPageSize,
		SIZE_DOTS,
		type LabelSample
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
	let statusMessage = $state('Cargando la librería BrowserPrint...');
	let printers = $state<BrowserPrintDevice[]>([]);
	let selectedUid = $state('');
	let selectedPrinter = $state<BrowserPrintDevice | null>(null);
	let pageSize = $state<LabelSample>('4x6');
	let printerBrand = $state<PrinterBrand>('zebra');
	let transportFilter = $state<TransportFilter>('bluetooth');
	let printerIp = $state(DEFAULT_LAN_PRINTER_IP);
	let previewImageUrl = $state('');
	let previewLoading = $state(false);
	let previewError = $state('');
	let previewAbortController: AbortController | null = null;
	let zebraDiscoveryRequestId = 0;

	const PAGE_SIZE_OPTIONS: { value: LabelSample; label: string }[] = [
		{ value: '4x6', label: 'Etiqueta logística 4x6 (GS1-128)' },
		{ value: '4x4', label: 'Etiqueta genérica 4x4 (GS1-128)' },
		{ value: '4x4-datamatrix', label: 'Etiqueta genérica 4x4 (GS1 DataMatrix)' },
		{ value: '4x4-digital-link', label: 'Etiqueta genérica 4x4 (QR Digital Link)' },
		{ value: '3x3', label: 'Etiqueta 3x3 GS1 Digital Link QR' }
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
	const TEST_FLOW_STEPS = [
		{
			title: 'Selecciona',
			text: 'Escoge la marca, el tipo de conexión y la etiqueta que quieres probar.'
		},
		{
			title: 'Verifica',
			text: 'Confirma que Browser Print o el agente local puedan comunicarse con la impresora.'
		},
		{
			title: 'Imprime',
			text: 'Envía ZPL real para validar tamaño, códigos GS1, calibración y conectividad.'
		}
	];
	const REQUIREMENT_ITEMS = [
		'Zebra Browser Print para USB/Bluetooth',
		'Agente local en localhost:8080 para LAN',
		'Impresora compatible con ZPL o ZSim'
	];

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
			script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
			document.head.appendChild(script);
		});
	}

	async function initBrowserPrint() {
		loading = true;
		statusMessage = 'Cargando la librería BrowserPrint...';

		try {
			const win = window as WindowWithZebra;
			await loadScript(browserPrintUrl);
			if (!win.BrowserPrint) {
				throw new Error('BrowserPrint cargó, pero no se inicializó.');
			}

			browserPrintReady = true;
			if (printerBrand === 'zebra') {
				statusMessage = 'BrowserPrint está listo. Buscando impresoras Zebra...';
				await discoverZebraPrinters();
			}
		} catch (error) {
			if (printerBrand === 'zebra') {
				const message = error instanceof Error ? error.message : String(error);
				statusMessage = `No se pudo iniciar Zebra Browser Print: ${message}`;
			}
		} finally {
			loading = false;
		}
	}

	function getDefaultPrinter(): Promise<BrowserPrintDevice | null> {
		return new Promise((resolve, reject) => {
			const win = window as WindowWithZebra;
			if (!win.BrowserPrint) {
				reject(new Error('La API de BrowserPrint no está disponible.'));
				return;
			}

			win.BrowserPrint.getDefaultDevice('printer', resolve, reject);
		});
	}

	function getLocalPrinters(): Promise<BrowserPrintDevice[]> {
		return new Promise((resolve, reject) => {
			const win = window as WindowWithZebra;
			if (!win.BrowserPrint) {
				reject(new Error('La API de BrowserPrint no está disponible.'));
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
				() => reject(new Error(`La búsqueda de impresoras excedió ${timeoutMs / 1000} segundos.`)),
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
			? '. La conexión parece estar fuera de línea. Reconecta en Zebra Browser Print y presiona Actualizar impresoras.'
			: '';
		statusMessage = `${context}: ${message}${hint}`;
	}

	function getPreviewQrUrl(): string | null {
		if (pageSize === '3x3') return DIGITAL_LINK_QR_URL;
		if (pageSize === '4x4-digital-link') return GENERIC_CASE_DIGITAL_LINK_URL;
		return null;
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

		const previewSize = getPageSize(pageSize);
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
				throw new Error(`El render de la vista previa falló (${response.status})`);
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
			statusMessage = 'La API de BrowserPrint no está disponible.';
			return;
		}

		loading = true;
		statusMessage = 'Buscando impresoras...';

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
				statusMessage = `Listo. Impresora seleccionada: ${initial.name}`;
			} else {
				selectedUid = '';
				selectedPrinter = null;
				statusMessage = `No hay una impresora Zebra por ${transportFilter.toUpperCase()} conectada. La vista previa sigue disponible.`;
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			statusMessage = `La búsqueda falló: ${message}`;
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
			statusMessage = `Impresora seleccionada: ${selectedPrinter.name}`;
		}
	}

	function onTransportChange() {
		zebraDiscoveryRequestId += 1;
		selectedUid = '';
		selectedPrinter = null;
		if (printerBrand === 'zebra' && transportFilter !== 'lan') {
			void discoverZebraPrinters();
		} else if (transportFilter === 'lan') {
			statusMessage = 'Ingresa la IP de la impresora LAN y luego prueba el agente local.';
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
			statusMessage = 'Honeywell seleccionado. Prueba el agente local antes de imprimir.';
			return;
		}

		transportFilter = 'bluetooth';
		if (browserPrintReady) {
			void discoverZebraPrinters();
		} else {
			statusMessage = 'Zebra seleccionado. Esperando que Browser Print inicie...';
		}
	}

	function onPageSizeChange() {
		void renderAccuratePreview();
	}

	async function getPrintAgentError(response: Response): Promise<string> {
		const body = await response.text();
		if (!body) return `La solicitud al agente de impresión falló (${response.status}).`;

		try {
			const result = JSON.parse(body) as { error?: string; message?: string };
			return (
				result.error ??
				result.message ??
				`La solicitud al agente de impresión falló (${response.status}).`
			);
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
			statusMessage = `Revisando el agente local en ${PRINT_AGENT_URL}...`;
			await pingPrintAgent();
			statusMessage = 'El agente local está en línea y listo.';
		} catch (error) {
			statusMessage = `La prueba de conexión falló: ${toErrorMessage(error)}`;
		} finally {
			loading = false;
		}
	}

	async function printTestLabel() {
		if (transportFilter === 'lan') {
			loading = true;
			const labelZpl = buildZplDemoLabel(pageSize);
			try {
				statusMessage = `Enviando etiqueta ZPL ${pageSize} mediante el agente local...`;
				await printWithAgent(labelZpl);
				statusMessage = 'El agente local aceptó el trabajo de impresión.';
			} catch (error) {
				statusMessage = `La impresión falló: ${toErrorMessage(error)}`;
			} finally {
				loading = false;
			}
			return;
		}

		const activePrinter = getActiveSelectedPrinter();
		if (!activePrinter) {
			statusMessage = 'Primero selecciona una impresora.';
			return;
		}

		loading = true;
		statusMessage = `Enviando etiqueta demo ${pageSize} a ${activePrinter.name}...`;
		const labelZpl = buildZplDemoLabel(pageSize);

		activePrinter.send(
			labelZpl,
			() => {
				loading = false;
				statusMessage =
					'Trabajo enviado. Si no sale la etiqueta, revisa tamaño de papel, batería, emparejamiento y configuración en Browser Print.';
			},
			(error) => {
				loading = false;
				const message = toErrorMessage(error);
				handleTransportFailure(message, 'La impresión falló');
			}
		);
	}

	function printCalibrationPattern3x3() {
		const activePrinter = getActiveSelectedPrinter();
		if (!activePrinter) {
			statusMessage = 'Primero selecciona una impresora.';
			return;
		}

		loading = true;
		statusMessage = `Enviando patrón de calibración 3x3 a ${activePrinter.name}...`;
		const labelZpl = buildCalibrationLabel3x3();

		activePrinter.send(
			labelZpl,
			() => {
				loading = false;
				statusMessage =
					'Etiqueta de calibración enviada. Revisa si usa la siguiente etiqueta disponible y si los bordes se ven completos.';
			},
			(error) => {
				loading = false;
				const message = toErrorMessage(error);
				handleTransportFailure(message, 'La impresión de calibración falló');
			}
		);
	}

	function sendRawCommand(command: string, successMessage: string, errorPrefix: string) {
		const activePrinter = getActiveSelectedPrinter();
		if (!activePrinter) {
			statusMessage = 'Primero selecciona una impresora.';
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
			'Comando de calibración de papel enviado (~JC). La impresora puede avanzar etiquetas mientras calibra.',
			'El comando de calibración falló'
		);
	}

	function printSafeMode3x3() {
		const activePrinter = getActiveSelectedPrinter();
		if (!activePrinter) {
			statusMessage = 'Primero selecciona una impresora.';
			return;
		}

		loading = true;
		statusMessage = `Enviando prueba segura 3x3 a ${activePrinter.name}...`;
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
			'^FO24,24^CF0,26^FD3x3 MODO SEGURO^FS',
			'^FO24,60^CF0,20^FDSin ^XB. Gap sensing. DT.^FS',
			'^FO24,565^CF0,20^FDMarca final^FS',
			'^PQ1,0,1,N',
			'^XZ'
		].join('');

		activePrinter.send(
			safeZpl,
			() => {
				loading = false;
				statusMessage =
					'Etiqueta de modo seguro enviada. Si la primera etiqueta sigue en blanco, probablemente el problema está en la configuración de la impresora.';
			},
			(error) => {
				loading = false;
				const message = toErrorMessage(error);
				handleTransportFailure(message, 'La impresión de modo seguro falló');
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
	<title>Prueba de impresión web</title>
</svelte:head>

<main class="page">
	<section class="hero" aria-labelledby="page-title">
		<div>
			<p class="eyebrow">Laboratorio de impresión local</p>
			<h1 id="page-title">Prueba de impresión desde una aplicación web</h1>
			<p class="help">
				Esta demo valida si el navegador puede enviar etiquetas ZPL a impresoras locales por USB,
				Bluetooth o LAN usando Zebra Browser Print o un agente local de impresión.
			</p>
		</div>
		<div class="hero-meter" aria-label="Resumen de tecnología">
			<strong>ZPL</strong>
			<span>GS1-128 / DataMatrix / Digital Link QR</span>
		</div>
	</section>

	<section class="explainer" aria-label="Cómo funciona la prueba">
		{#each TEST_FLOW_STEPS as step (step.title)}
			<div class="flow-step">
				<strong>{step.title}</strong>
				<span>{step.text}</span>
			</div>
		{/each}
	</section>

	<div class="panel">
		<div class="panel-header">
			<div>
				<h2>Configurar prueba</h2>
				<p>Elige el escenario y envía una etiqueta demo a la impresora seleccionada.</p>
			</div>
			<span class="connection-badge">{transportFilter.toUpperCase()}</span>
		</div>

		<div class="form-grid">
			<div class="field">
				<label for="printer-brand">Marca de impresora</label>
				<select id="printer-brand" bind:value={printerBrand} onchange={onPrinterBrandChange}>
					{#each PRINTER_BRAND_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<label for="transport">Tipo de conexión</label>
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
			</div>

			{#if transportFilter === 'lan'}
				<div class="field">
					<label for="printer-ip">Dirección IP de la impresora</label>
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
						El ZPL se enviará mediante el agente local en {PRINT_AGENT_URL}.
					</p>
				</div>
			{/if}

			{#if transportFilter !== 'lan'}
				<div class="field">
					<label for="printer">Impresora disponible</label>
					<select
						id="printer"
						bind:value={selectedUid}
						onchange={onPrinterChange}
						disabled={loading || printers.length === 0}
					>
						<option value="">Seleccionar impresora</option>
						{#each printers as printer (printer.uid)}
							<option value={printer.uid}>{printer.name}</option>
						{/each}
					</select>
				</div>
			{/if}

			<div class="field field-wide">
				<label for="page-size">Tipo de etiqueta demo</label>
				<select id="page-size" bind:value={pageSize} onchange={onPageSizeChange} disabled={loading}>
					{#each PAGE_SIZE_OPTIONS as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="actions">
			{#if transportFilter === 'lan'}
				<button type="button" onclick={testLanPrinter} disabled={loading || !printerIp.trim()}>
					Probar conexión
				</button>
				<button type="button" onclick={printTestLabel} disabled={loading || !printerIp.trim()}>
					Imprimir etiqueta seleccionada
				</button>
			{:else}
				<button
					type="button"
					onclick={discoverZebraPrinters}
					disabled={loading || !browserPrintReady}
				>
					Actualizar impresoras
				</button>
				<button type="button" onclick={printTestLabel} disabled={loading || !selectedPrinter}>
					Imprimir etiqueta seleccionada
				</button>
			{/if}
		</div>

		<div class="requirements" aria-label="Requisitos del escenario">
			{#each REQUIREMENT_ITEMS as item (item)}
				<span>{item}</span>
			{/each}
		</div>

		<details class="preview" open>
			<summary>Vista previa de impresión (solo pantalla)</summary>
			<div class="preview-card">
				{#if previewLoading}
					<p class="preview-note">Renderizando vista previa precisa {pageSize} desde ZPL...</p>
				{:else if previewImageUrl}
					<img
						class="preview-image"
						src={previewImageUrl}
						alt="Vista previa precisa {pageSize} generada desde ZPL"
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
				{:else if pageSize.startsWith('4x4')}
					<div class="label-generic">
						<strong>Vista previa de etiqueta genérica 4x4</strong>
						{#if pageSize === '4x4'}
							<p>Encabezado de producto + GTIN/peso neto + dos códigos GS1-128</p>
						{:else if pageSize === '4x4-datamatrix'}
							<p>Encabezado de producto + GTIN/peso neto + GS1 DataMatrix</p>
						{:else}
							<p>Encabezado de producto + GTIN/peso neto + QR GS1 Digital Link</p>
						{/if}
					</div>
				{:else}
					<div class="label-generic">
						<strong>Vista previa de etiqueta logística 4x6</strong>
						<p>Bloques origen/destino + SSCC + GS1-128 + referencia de transporte</p>
					</div>
				{/if}
				{#if previewError}
					<p class="preview-error">
						La vista previa precisa no está disponible ahora: {previewError}
					</p>
				{/if}
				<button
					type="button"
					onclick={renderAccuratePreview}
					disabled={previewLoading}
					class="preview-refresh"
				>
					Actualizar vista previa
				</button>
				{#if getPreviewQrUrl()}
					<p class="preview-qr"><strong>URL del QR:</strong> {getPreviewQrUrl()}</p>
				{/if}
			</div>
		</details>
		<p class="status" aria-live="polite">{statusMessage}</p>
	</div>
</main>

<style>
	:global(body) {
		min-height: 100vh;
		margin: 0;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
		color: #16211b;
		background:
			linear-gradient(135deg, rgba(239, 246, 241, 0.95), rgba(250, 251, 248, 0.96)),
			linear-gradient(90deg, rgba(32, 99, 74, 0.08), rgba(200, 118, 44, 0.1));
	}

	.page {
		width: min(100% - 2rem, 72rem);
		margin: 0 auto;
		padding: 2.5rem 0 3rem;
	}

	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
		gap: 2rem;
		align-items: end;
		margin-bottom: 1.5rem;
		padding-bottom: 1.75rem;
		border-bottom: 1px solid rgba(22, 33, 27, 0.12);
	}

	.eyebrow {
		margin: 0 0 0.6rem;
		color: #28724e;
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	h1,
	h2 {
		margin: 0;
		line-height: 1.05;
	}

	h1 {
		max-width: 48rem;
		font-size: clamp(2.15rem, 5vw, 4.8rem);
		font-weight: 850;
	}

	.help {
		max-width: 45rem;
		margin: 1rem 0 0;
		color: #4a5a50;
		font-size: 1.08rem;
		line-height: 1.65;
	}

	.hero-meter {
		display: grid;
		gap: 0.45rem;
		padding: 1rem;
		border: 1px solid rgba(40, 114, 78, 0.22);
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.72);
		box-shadow: 0 20px 45px rgba(22, 33, 27, 0.08);
	}

	.hero-meter strong {
		font-size: 2.6rem;
		line-height: 1;
		color: #1f6f52;
	}

	.hero-meter span {
		color: #5b655e;
		font-weight: 650;
	}

	.explainer {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.8rem;
		margin-bottom: 1.1rem;
	}

	.flow-step {
		display: grid;
		gap: 0.35rem;
		padding: 1rem;
		border: 1px solid rgba(22, 33, 27, 0.1);
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.64);
	}

	.flow-step strong {
		color: #1d6148;
		font-size: 0.95rem;
	}

	.flow-step span {
		color: #516157;
		font-size: 0.92rem;
		line-height: 1.45;
	}

	.panel {
		display: grid;
		gap: 1rem;
		padding: 1.1rem;
		border: 1px solid rgba(22, 33, 27, 0.12);
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.82);
		box-shadow: 0 24px 70px rgba(22, 33, 27, 0.1);
	}

	.panel-header {
		display: flex;
		gap: 1rem;
		align-items: start;
		justify-content: space-between;
		padding-bottom: 0.85rem;
		border-bottom: 1px solid rgba(22, 33, 27, 0.1);
	}

	.panel-header h2 {
		font-size: 1.25rem;
	}

	.panel-header p {
		margin: 0.35rem 0 0;
		color: #5c695f;
		line-height: 1.45;
	}

	.connection-badge {
		flex: 0 0 auto;
		padding: 0.35rem 0.55rem;
		border: 1px solid rgba(32, 111, 82, 0.24);
		border-radius: 999px;
		color: #1f6f52;
		background: #edf8f1;
		font-size: 0.75rem;
		font-weight: 800;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.9rem;
	}

	.field {
		display: grid;
		gap: 0.4rem;
	}

	.field-wide {
		grid-column: 1 / -1;
	}

	label {
		color: #233229;
		font-size: 0.9rem;
		font-weight: 600;
	}

	select,
	input,
	button {
		font-size: 1rem;
	}

	select,
	input {
		box-sizing: border-box;
		width: 100%;
		min-height: 2.75rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid #cdd9d1;
		border-radius: 0.45rem;
		color: #16211b;
		background: #ffffff;
	}

	select:focus,
	input:focus,
	button:focus-visible {
		outline: 3px solid rgba(40, 114, 78, 0.18);
		outline-offset: 2px;
		border-color: #28724e;
	}

	.field-help {
		margin: 0;
		color: #68766e;
		font-size: 0.875rem;
		line-height: 1.4;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		padding-top: 0.25rem;
	}

	.requirements {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.requirements span {
		padding: 0.36rem 0.55rem;
		border: 1px solid rgba(124, 93, 57, 0.18);
		border-radius: 999px;
		color: #67523b;
		background: #fff7ea;
		font-size: 0.82rem;
		font-weight: 650;
	}

	.preview {
		overflow: hidden;
		border: 1px solid #d4ded8;
		border-radius: 0.5rem;
		background: #ffffff;
	}

	.preview summary {
		cursor: pointer;
		font-weight: 600;
		padding: 0.8rem 0.95rem;
		background: #f5f8f6;
	}

	.preview-card {
		padding: 1rem;
	}

	.preview-card p {
		margin: 0.4rem 0;
	}

	.label3x3 {
		position: relative;
		width: min(100%, 420px);
		aspect-ratio: 1 / 1;
		background: #fff;
		border: 1px solid #cbd5d8;
		border-radius: 0.35rem;
		box-shadow: inset 0 0 0 1px rgba(22, 33, 27, 0.03);
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
		border: 1px dashed #98aca1;
		border-radius: 0.35rem;
		padding: 1rem;
		background: #fbfdfb;
		color: #26352c;
	}

	.label-generic strong {
		display: block;
		margin-bottom: 0.25rem;
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
		color: #a5363a;
	}

	.preview-image {
		display: block;
		width: min(100%, 420px);
		height: auto;
		border: 1px solid #cbd5d8;
		border-radius: 0.35rem;
		background: #fff;
	}

	.preview-refresh {
		margin-top: 0.5rem;
	}

	button {
		min-height: 2.65rem;
		padding: 0.6rem 1rem;
		border: 1px solid #23694e;
		border-radius: 0.45rem;
		color: #ffffff;
		background: #23694e;
		font-weight: 750;
		cursor: pointer;
		transition:
			transform 120ms ease,
			box-shadow 120ms ease,
			background-color 120ms ease;
	}

	button:hover:not(:disabled) {
		transform: translateY(-1px);
		background: #1b5a42;
		box-shadow: 0 10px 24px rgba(35, 105, 78, 0.2);
	}

	.preview-refresh {
		border-color: #cdd9d1;
		color: #24322a;
		background: #ffffff;
	}

	.preview-refresh:hover:not(:disabled) {
		background: #f5f8f6;
		box-shadow: none;
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.status {
		margin: 0;
		padding: 0.85rem 0.95rem;
		border-left: 4px solid #c8762c;
		border-radius: 0.4rem;
		color: #3f362b;
		background: #fff7ea;
		font-size: 0.95rem;
		line-height: 1.45;
	}

	@media (max-width: 760px) {
		.page {
			width: min(100% - 1rem, 72rem);
			padding-top: 1rem;
		}

		.hero,
		.explainer,
		.form-grid {
			grid-template-columns: 1fr;
		}

		.hero {
			gap: 1rem;
		}

		.panel-header {
			display: grid;
		}

		.actions {
			display: grid;
		}

		button {
			width: 100%;
		}
	}
</style>
