import streamDeck from "@elgato/streamdeck";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Opens a page in the person's default browser. Stream Deck's own openUrl hands long links to its
 * deep-link handler, which drops them ("Unhandled command"), so ask the OS first.
 */
export async function openInBrowser(url: string): Promise<void> {
	try {
		if (process.platform === "darwin") return void (await run("open", [url]));
		if (process.platform === "win32") return void (await run("rundll32", ["url.dll,FileProtocolHandler", url], { windowsHide: true }));
	} catch (error) {
		streamDeck.logger.warn(`could not open the browser: ${error}`);
	}
	await streamDeck.system.openUrl(url);
}
