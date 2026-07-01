# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.15.3 create --template minimal --types ts --add prettier vitest="usages:unit,component" playwright tailwindcss="plugins:forms" mcp="ide:vscode+setup:remote" --install npm browser_print
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

This project uses the SvelteKit Node adapter because LAN printing requires a server-side raw TCP socket.

```sh
npm run build
npm run start
```

The computer running the Node process must be able to reach the printer on the same LAN. Open the app in a browser, select `LAN`, enter the printer IP and raw TCP port (normally `9100`), and use **Test connection** before printing a sample.

For a Honeywell PM42, enable its Net1/raw TCP service and select the ZSim command language before sending these ZPL samples.

### Optional printer allowlist

By default, the API accepts only literal private or local IP addresses. To restrict it to known printers, set a comma-separated allowlist before starting the server:

```sh
PRINTER_IP_ALLOWLIST=192.168.1.50,192.168.1.51 npm run start
```

Keep this test application on a trusted network. Add authentication before exposing its print endpoints beyond that network.
