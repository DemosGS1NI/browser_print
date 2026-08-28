# Architecture

Este documento describe la arquitectura tecnica del repositorio `browser-print`, sus dependencias, requisitos y flujo de impresion.

## Stack tecnico

- Lenguaje: TypeScript.
- Framework web: SvelteKit.
- UI runtime: Svelte 5 con runes habilitado desde `svelte.config.js`.
- Bundler/dev server: Vite.
- Estilos: Tailwind CSS v4 y `@tailwindcss/forms`.
- Adapter: `@sveltejs/adapter-vercel`.
- Pruebas unitarias: Vitest.
- Pruebas de componentes en navegador: Vitest Browser con Playwright.
- Pruebas e2e: Playwright.
- SDK de impresion local Zebra: Zebra Browser Print JavaScript SDK, version incluida en `src/zebra-browser-print-js-v31250`.
- Package manager: npm.

## Estructura relevante

```text
.
├── DOCS/
│   ├── OVERVIEW.md
│   └── ARCHITECTURE.md
├── src/
│   ├── lib/
│   │   └── printing/
│   │       ├── zpl.ts
│   │       └── zpl.spec.ts
│   ├── routes/
│   │   ├── +page.svelte
│   │   ├── demo/
│   │   │   ├── +page.svelte
│   │   │   ├── bluetooth/
│   │   │   │   └── +page.svelte
│   │   │   └── playwright/
│   │   │       ├── +page.svelte
│   │   │       └── page.svelte.e2e.ts
│   │   └── layout.css
│   └── zebra-browser-print-js-v31250/
│       ├── BrowserPrint-3.1.250.min.js
│       ├── BrowserPrint-Zebra-1.1.250.min.js
│       ├── Documentation/
│       └── sample/
├── package.json
├── playwright.config.ts
├── svelte.config.js
├── tsconfig.json
└── vite.config.ts
```

## Modulos principales

### `src/routes/demo/bluetooth/+page.svelte`

Es la pantalla principal de la demo de impresion. Aunque el nombre de la ruta incluye `bluetooth`, esta pantalla tambien maneja USB y LAN.

Responsabilidades:

- Cargar dinamicamente el SDK `BrowserPrint-3.1.250.min.js`.
- Detectar impresoras Zebra locales usando `window.BrowserPrint`.
- Filtrar impresoras por tipo de conexion: Bluetooth, USB o LAN.
- Permitir seleccion de marca: Zebra o Honeywell.
- Forzar LAN cuando la marca seleccionada es Honeywell.
- Permitir ingresar la IP de impresora para pruebas LAN.
- Probar conexion contra el agente local con `GET /ping`.
- Enviar ZPL al agente local con `POST /print`.
- Enviar ZPL directamente a dispositivos Zebra descubiertos por Browser Print.
- Renderizar una vista previa usando Labelary.
- Mostrar estados de error y mensajes de progreso para descubrimiento, conexion e impresion.

### `src/lib/printing/zpl.ts`

Centraliza la generacion de etiquetas ZPL usadas por la demo.

Contiene:

- Tipos de tamanos de etiqueta: `4x6`, `4x4`, `3x3`.
- Mapa de dimensiones en dots para impresoras de 8 dpmm.
- Constructores de etiquetas:
  - `buildLogisticsLabel4x6`
  - `buildCaseLabel4x4`
  - `buildCaseLabelDataMatrix4x4`
  - `buildCaseLabelDigitalLink4x4`
  - `buildDigitalLinkLabel3x3`
  - `buildCalibrationLabel3x3`
  - `buildDemoLabel`
- Datos GS1 demo genericos para GTIN, lote, serial, fechas y Digital Link.

### `src/lib/printing/zpl.spec.ts`

Pruebas unitarias para validar que las etiquetas ZPL:

- Empiezan con `^XA`.
- Terminan con `^XZ`.
- Incluyen ancho `^PW` y largo `^LL` esperados.
- Incluyen datos GS1 correctos.
- Codifican FNC1 y separadores para GS1-128 y GS1 DataMatrix.
- Incluyen la URL de GS1 Digital Link cuando corresponde.

### `src/routes/demo/playwright`

Ruta pequena usada como ejemplo para pruebas e2e con Playwright.

## Flujo de impresion

### Zebra por USB o Bluetooth

1. La pagina carga `BrowserPrint-3.1.250.min.js`.
2. El SDK expone `window.BrowserPrint`.
3. La app consulta:
   - `getDefaultDevice('printer')`
   - `getLocalDevices(..., 'printer')`
4. La lista se filtra por conexion.
5. El usuario selecciona una impresora.
6. La app genera ZPL con `buildDemoLabel`.
7. La app llama `selectedPrinter.send(zpl, onSuccess, onError)`.

Requisito: Zebra Browser Print debe estar instalado, activo y con permisos para acceder a la impresora local.

### LAN mediante agente local

1. El usuario selecciona conexion `LAN` o marca `HONEYWELL`.
2. La app muestra un campo para la IP de la impresora.
3. La app valida el agente local llamando:

```http
GET http://localhost:8080/ping
```

4. Para imprimir, la app envia:

```http
POST http://localhost:8080/print
Content-Type: application/json
```

Con cuerpo:

```json
{
	"printerHostname": "192.168.1.100",
	"text": "^XA...^XZ"
}
```

5. El agente local es responsable de abrir la conexion real con la impresora LAN y transmitir el ZPL.

Este diseno evita la limitacion del navegador: una pagina web no puede conectarse directamente por TCP/raw socket a una impresora de red.

## Requisitos de entorno

### Desarrollo

- Node.js compatible con SvelteKit, Vite y TypeScript usados por el proyecto.
- npm.
- Navegador moderno.
- Dependencias instaladas con `npm install`.

### Impresion Zebra local

- Zebra Browser Print instalado en la computadora donde se abre el navegador.
- Impresora Zebra emparejada por Bluetooth o conectada por USB.
- La impresora debe estar visible para Zebra Browser Print.
- La impresora debe entender ZPL.

### Impresion LAN

- Agente local escuchando en `http://localhost:8080`.
- Endpoint `GET /ping`.
- Endpoint `POST /print`.
- La computadora que ejecuta el agente debe poder alcanzar la IP de la impresora.
- La impresora debe tener habilitado el servicio de impresion por red, normalmente raw TCP en puerto `9100`.
- Para Honeywell PM42, se espera Net1/raw TCP activo y lenguaje de comandos ZSim.
- CORS del agente local debe permitir el origen de la aplicacion web, especialmente si esta desplegada en Vercel.

## Dependencias principales

Dependencias de desarrollo declaradas en `package.json`:

- `@sveltejs/kit`: framework de aplicacion.
- `@sveltejs/adapter-vercel`: adapter de despliegue.
- `@sveltejs/vite-plugin-svelte`: integracion Svelte con Vite.
- `svelte`: framework UI.
- `vite`: dev server y build tool.
- `typescript`: tipado estatico.
- `tailwindcss`, `@tailwindcss/vite`, `@tailwindcss/forms`: estilos y formularios.
- `vitest`: pruebas unitarias.
- `vitest-browser-svelte`: pruebas de componentes Svelte.
- `@vitest/browser-playwright`: provider Playwright para Vitest Browser.
- `@playwright/test` y `playwright`: pruebas e2e y navegador automatizado.
- `prettier`, `prettier-plugin-svelte`, `prettier-plugin-tailwindcss`: formato de codigo.
- `@types/node`: tipos de Node.js.

## Scripts npm

```sh
npm run dev
```

Inicia el servidor de desarrollo Vite.

```sh
npm run build
```

Compila la aplicacion para produccion.

```sh
npm run preview
```

Sirve localmente el build de produccion.

```sh
npm run check
```

Ejecuta `svelte-kit sync` y `svelte-check`.

```sh
npm run lint
```

Valida formato con Prettier.

```sh
npm run format
```

Aplica formato con Prettier.

```sh
npm run test:unit
```

Ejecuta pruebas unitarias y de componentes configuradas en Vitest.

```sh
npm run test:e2e
```

Instala navegadores de Playwright si hace falta y ejecuta pruebas e2e.

```sh
npm test
```

Ejecuta pruebas unitarias en modo `--run` y luego pruebas e2e.

## Configuracion

### `svelte.config.js`

- Usa `@sveltejs/adapter-vercel`.
- Habilita runes para el proyecto.
- Evita forzar runes dentro de `node_modules`.

### `vite.config.ts`

- Usa plugins `tailwindcss()` y `sveltekit()`.
- Configura Vitest con dos proyectos:
  - `client`: pruebas Svelte en Chromium headless mediante Playwright.
  - `server`: pruebas Node para archivos TypeScript/JavaScript no Svelte.
- Excluye `src/lib/server/**` de los proyectos de prueba.

### `playwright.config.ts`

- Levanta el servidor con `npm run build && npm run preview`.
- Usa el puerto `4173`.
- Ejecuta archivos `*.e2e.ts` o `*.e2e.js`.

### `tsconfig.json`

- Extiende la configuracion generada por SvelteKit.
- Usa `strict: true`.
- Usa `moduleResolution: "bundler"`.
- Excluye la documentacion HTML del SDK Zebra en `src/zebra-browser-print-js-v31250/Documentation/**`.

## Servicios externos

### Labelary

La app intenta renderizar una vista previa precisa enviando el ZPL a:

```text
https://api.labelary.com/v1/printers/8dpmm/labels/{size}/0/
```

Este servicio se usa solo para vista previa en pantalla. No es parte del flujo de impresion real.

### Zebra Browser Print

El SDK incluido en el repo permite comunicarse con el servicio local de Zebra Browser Print desde el navegador. La app lo carga como asset mediante import con `?url`.

## Consideraciones de seguridad

- El agente local de impresion no debe aceptar origenes desconocidos.
- El agente debe limitar las IPs de impresora permitidas.
- No se debe exponer el agente local a redes no confiables.
- La aplicacion envia ZPL raw; validar y controlar quien puede generar o enviar comandos es importante en un entorno real.
- En produccion, configurar CORS explicitamente para el dominio desplegado.

## Como extender la demo

Para agregar una nueva etiqueta:

1. Crear un nuevo constructor en `src/lib/printing/zpl.ts`.
2. Agregar el tipo o valor correspondiente a `LabelSample`.
3. Agregar la opcion en `PAGE_SIZE_OPTIONS` dentro de `src/routes/demo/bluetooth/+page.svelte`.
4. Actualizar `buildDemoLabel`.
5. Agregar pruebas en `src/lib/printing/zpl.spec.ts`.

Para agregar otra marca de impresora:

1. Extender `PrinterBrand`.
2. Agregar la marca a `PRINTER_BRAND_OPTIONS`.
3. Definir que transportes soporta.
4. Implementar su metodo de descubrimiento o envio.
5. Documentar requisitos de drivers, firmware, lenguaje de comandos y servicio local.

Para agregar otro transporte:

1. Extender `TransportFilter`.
2. Agregar la opcion a `TRANSPORT_OPTIONS`.
3. Implementar deteccion, validacion y envio.
4. Agregar mensajes de estado claros para errores de conexion.

## Limitaciones conocidas

- El navegador no puede imprimir directamente a impresoras LAN por raw TCP; requiere agente local.
- Zebra USB/Bluetooth depende de Zebra Browser Print y de que el dispositivo aparezca correctamente en ese servicio.
- Honeywell esta modelado como flujo LAN compatible con ZPL/ZSim, no como integracion SDK nativa.
- La ruta `/demo/bluetooth` contiene tambien logica USB y LAN; el nombre historico de la ruta puede no describir todo su alcance actual.
- La vista previa precisa depende de disponibilidad de red hacia Labelary.
