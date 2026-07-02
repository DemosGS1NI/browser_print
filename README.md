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

This project uses the SvelteKit Vercel adapter. Zebra USB/Bluetooth printing uses Zebra Browser Print, while LAN printing is sent from the browser to a local print agent.

```sh
npm run build
npm run preview
```

The computer running the browser and print agent must be able to reach the printer on the same LAN. Select `LAN`, enter the printer IP, and use **Test connection** before printing a sample.

For a Honeywell PM42, enable its Net1/raw TCP service, select the ZSim command language, and run the local print agent on `http://localhost:8080`. The app checks `GET /ping` and sends labels to `POST /print` as JSON containing `printerHostname` and `text`.

Configure the print agent's CORS allowlist to include the deployed Vercel origin. Keep the agent restricted to trusted origins and printer addresses.
