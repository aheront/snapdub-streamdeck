import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The clipboard's text. Node has no clipboard API of its own, so this asks the OS. */
export async function readClipboard(): Promise<string> {
	try {
		if (process.platform === "darwin") return (await run("pbpaste")).stdout;
		if (process.platform === "win32") {
			return (await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"], { windowsHide: true })).stdout;
		}
	} catch {
		// An empty or non-text clipboard is not an error worth surfacing; the key says "no link".
	}
	return "";
}
