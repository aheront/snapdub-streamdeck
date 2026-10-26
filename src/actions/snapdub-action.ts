import type { JsonObject, JsonValue } from "@elgato/utils";
import streamDeck, { type SendToPluginEvent, SingletonAction } from "@elgato/streamdeck";

import { currentSession, saveSession, signIn } from "../snapdub/auth";
import { type Account, callTool } from "../snapdub/client";

type Message = { event?: string };

// Every SnapDub action, so a sign-in from one key's panel redraws the other kinds of keys too.
const everyAction = new Set<SnapDubAction<JsonObject>>();

/**
 * What every SnapDub key shares: the sign-in block at the top of its settings panel and the
 * template list. Both actions' panels send the same messages, answered here.
 */
export abstract class SnapDubAction<T extends JsonObject> extends SingletonAction<T> {
	constructor() {
		super();
		everyAction.add(this as unknown as SnapDubAction<JsonObject>);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, T>): Promise<void> {
		const { event } = (ev.payload ?? {}) as Message;
		switch (event) {
			case "status":
				return this.sendSession();
			case "signIn":
				try {
					await streamDeck.ui.sendToPropertyInspector({ event: "session", busy: true });
					const session = await signIn();
					const me = await callTool<Account>("whoami");
					await saveSession({ ...session, account: me.account });
				} catch (error) {
					streamDeck.logger.warn(`sign-in failed: ${error}`);
					await streamDeck.ui.sendToPropertyInspector({ event: "session", error: "Sign-in didn't finish. Try again." });
					return;
				}
				await this.sendSession();
				return redrawAll();
			case "signOut":
				await saveSession(undefined);
				await this.sendSession();
				return redrawAll();
			case "getTemplates":
				return this.sendTemplates();
		}
	}

	/** Called after signing in or out (from any key's panel), so keys can redraw. */
	async signedInChanged(): Promise<void> {}

	private async sendSession(): Promise<void> {
		const session = await currentSession();
		await streamDeck.ui.sendToPropertyInspector({ event: "session", signedIn: !!session, account: session?.account ?? null });
	}

	// The shape sdpi-components' datasource expects back: { event, items: [{ label, value }] }.
	private async sendTemplates(): Promise<void> {
		let items: { label: string; value: string }[] = [];
		try {
			const { templates } = await callTool<{ templates: { name: string }[] }>("list_templates");
			items = templates.map((t) => ({ label: t.name, value: t.name }));
		} catch {
			// Not signed in yet, or offline: the list is just empty, "No template" still works.
		}
		await streamDeck.ui.sendToPropertyInspector({ event: "getTemplates", items: [{ label: "No template", value: "" }, ...items] });
	}
}

async function redrawAll(): Promise<void> {
	for (const a of everyAction) await a.signedInChanged();
}
