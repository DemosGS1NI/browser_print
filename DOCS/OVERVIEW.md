# Overview

Este repositorio contiene una aplicacion demo para validar si una aplicacion web puede imprimir en impresoras locales desde el navegador.

El objetivo principal es probar distintos escenarios de impresion con diferentes marcas, modelos y tipos de conexion de impresoras, especialmente impresoras de etiquetas compatibles con ZPL. La demo permite seleccionar una marca de impresora, un tipo de conexion y una etiqueta de prueba, generar el contenido ZPL correspondiente, mostrar una vista previa en pantalla y enviar el trabajo de impresion al dispositivo local.

## Que hace este repo

- Ejecuta una aplicacion web construida con SvelteKit.
- Prueba impresion hacia impresoras Zebra mediante Zebra Browser Print.
- Prueba impresion por red LAN mediante un agente local de impresion en `http://localhost:8080`.
- Incluye soporte inicial para escenarios Honeywell usando ZPL/ZSim por LAN.
- Genera etiquetas demo en ZPL para varios tamanos y formatos.
- Muestra una vista previa de la etiqueta antes de imprimir.
- Incluye pruebas unitarias para la generacion de ZPL.
- Incluye una prueba e2e minima con Playwright.

## Escenarios de prueba

La ruta principal de la demo esta en `/demo/bluetooth` y permite probar:

- Marca de impresora: `ZEBRA` o `HONEYWELL`.
- Conexion: `Bluetooth`, `USB` o `LAN`.
- Etiquetas demo:
  - `Etiqueta logistica 4x6 (GS1-128)`
  - `Etiqueta generica 4x4 (GS1-128)`
  - `Etiqueta generica 4x4 (GS1 DataMatrix)`
  - `Etiqueta generica 4x4 (Digital Link QR)`
  - `Etiqueta 3x3 GS1 Digital Link QR`

## Como se usa

Instalar dependencias:

```sh
npm install
```

Ejecutar ambiente de desarrollo:

```sh
npm run dev
```

Abrir la aplicacion y entrar a:

```text
/demo/bluetooth
```

Para impresoras Zebra por USB o Bluetooth, la maquina local debe tener instalado y activo Zebra Browser Print. La aplicacion detecta impresoras locales usando el SDK de Browser Print incluido en el repositorio.

Para impresion LAN, la aplicacion espera que exista un agente local en:

```text
http://localhost:8080
```

Ese agente debe exponer:

- `GET /ping` para validar que el agente esta disponible.
- `POST /print` para recibir el trabajo de impresion.

El cuerpo esperado por `POST /print` es JSON:

```json
{
	"printerHostname": "192.168.1.100",
	"text": "^XA...^XZ"
}
```

## Notas importantes

- Esta aplicacion es una demo tecnica, no un sistema final de produccion.
- La impresion real depende de permisos del navegador, disponibilidad del agente local, configuracion de red, CORS, drivers, firmware y lenguaje configurado en la impresora.
- Las etiquetas demo estan pensadas para impresoras que entienden ZPL o un modo compatible como ZSim.
- La vista previa usa un servicio externo para renderizar ZPL cuando esta disponible; si falla, la app sigue permitiendo probar impresion.
- En despliegues web, el navegador no puede abrir sockets TCP directos hacia impresoras LAN. Por eso se usa un agente local que recibe HTTP desde la web y se comunica con la impresora.
