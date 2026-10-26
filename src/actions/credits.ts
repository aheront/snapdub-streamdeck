import { action, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";

import { openInBrowser } from "../snapdub/browser";
import { type Account, callTool, SignInNeeded } from "../snapdub/client";
import { creditsTitle } from "../snapdub/format";
import { SnapDubAction } from "./snapdub-action";

const REFRESH_MS = 5 * 60 * 1000;

/** Shows the credits left on the key; pressing it opens the plan page. */
@action({ UUID: "ai.snapdub.streamdeck.credits" })
export class Credits extends SnapDubAction<Record<string, never>> {
	private timer?: NodeJS.Timeout;
	private upgradeUrl = "https://snapdub.ai/billing";

	override async onWillAppear(_ev: WillAppearEvent<Record<string, never>>): Promise<void> {
		await this.refresh();
		this.timer ??= setInterval(() => void this.refresh(), REFRESH_MS);
	}

	override onWillDisappear(_ev: WillDisappearEvent<Record<string, never>>): void {
		if ([...this.actions].length > 0) return;
		clearInterval(this.timer);
		this.timer = undefined;
	}

	override async onKeyDown(_ev: KeyDownEvent<Record<string, never>>): Promise<void> {
		await openInBrowser(this.upgradeUrl);
		await this.refresh();
	}

	override async signedInChanged(): Promise<void> {
		await this.refresh();
	}

	private async refresh(): Promise<void> {
		let title: string;
		try {
			const me = await callTool<Account>("whoami");
			if (me.upgrade_url) this.upgradeUrl = me.upgrade_url;
			title = creditsTitle(me.credits_left ?? 0);
		} catch (error) {
			title = error instanceof SignInNeeded ? "Sign in" : "";
		}
		for (const a of this.actions) if (a.isKey()) await a.setTitle(title);
	}
}
