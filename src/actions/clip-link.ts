import streamDeck, { action, type KeyAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";

import { openInBrowser } from "../snapdub/browser";
import { callTool, Refused, SignInNeeded, type Video } from "../snapdub/client";
import { readClipboard } from "../snapdub/clipboard";
import { findLink, isFinished, videoTitle } from "../snapdub/format";
import { SnapDubAction } from "./snapdub-action";

type Settings = {
	/** A fixed link; when empty the key takes the link from the clipboard. */
	link?: string;
	clips?: number | string;
	template?: string;
	/** The video this key started last, so it can keep showing progress after a restart. */
	videoId?: string;
	videoUrl?: string;
	videoStatus?: string;
};

const POLL_MS = 15_000;

/**
 * One key, one video: press it with a stream or video link copied (or set in the key's settings),
 * SnapDub makes the clips, and the key shows the progress. Pressed again once they are ready, it
 * opens them; pressed after that, it starts the next one.
 */
@action({ UUID: "ai.snapdub.streamdeck.clip" })
export class ClipLink extends SnapDubAction<Settings> {
	private timers = new Map<string, NodeJS.Timeout>();

	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const { videoId, videoStatus } = ev.payload.settings;
		if (videoId && !isFinished(videoStatus)) this.watch(ev.action, videoId);
		else await ev.action.setTitle(videoStatus === "done" ? "Open\nclips" : "");
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		this.stop(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const settings = ev.payload.settings;

		// Ready clips from the last press: open them, and the next press starts a new video.
		if (settings.videoStatus === "done" && settings.videoUrl) {
			await openInBrowser(settings.videoUrl);
			await ev.action.setSettings({ ...settings, videoId: undefined, videoUrl: undefined, videoStatus: undefined });
			await ev.action.setTitle("");
			return;
		}
		if (settings.videoId && !isFinished(settings.videoStatus)) {
			if (settings.videoUrl) await openInBrowser(settings.videoUrl);
			return;
		}

		const link = findLink(settings.link) ?? findLink(await readClipboard());
		if (!link) {
			await ev.action.setTitle("Copy a\nlink");
			await ev.action.showAlert();
			return;
		}

		await ev.action.setTitle("Sending");
		try {
			const args: Record<string, unknown> = { url: link };
			const clips = Number(settings.clips);
			if (Number.isInteger(clips) && clips > 0) args.clips = clips;
			if (settings.template) args.template = settings.template;

			const video = await callTool<Video>("create_video", args);
			await ev.action.setSettings({ ...settings, videoId: video.video_id, videoUrl: video.url, videoStatus: video.status });
			await ev.action.setTitle(videoTitle(video));
			this.watch(ev.action, video.video_id);
		} catch (error) {
			await this.explain(ev.action, error);
		}
	}

	override async signedInChanged(): Promise<void> {
		for (const a of this.actions) if (a.isKey()) await a.setTitle("");
	}

	private watch(key: KeyAction<Settings>, videoId: string): void {
		this.stop(key.id);
		const tick = async () => {
			try {
				const video = await callTool<Video>("get_video", { video_id: videoId });
				const settings = await key.getSettings();
				if (settings.videoId !== videoId) return this.stop(key.id);

				await key.setSettings({ ...settings, videoUrl: video.url ?? settings.videoUrl, videoStatus: video.status });
				await key.setTitle(videoTitle(video));
				if (isFinished(video.status)) {
					this.stop(key.id);
					if (video.status === "done") await key.showOk();
					else await key.showAlert();
				}
			} catch (error) {
				if (error instanceof SignInNeeded) {
					this.stop(key.id);
					await key.setTitle("Sign in");
				}
				// Anything else (offline for a minute) just waits for the next tick.
			}
		};
		void tick();
		this.timers.set(key.id, setInterval(tick, POLL_MS));
	}

	private stop(id: string): void {
		clearInterval(this.timers.get(id));
		this.timers.delete(id);
	}

	private async explain(key: KeyAction<Settings>, error: unknown): Promise<void> {
		streamDeck.logger.warn(`create_video failed: ${error}`);
		await key.showAlert();
		if (error instanceof SignInNeeded) return key.setTitle("Sign in");
		if (error instanceof Refused && error.details.code === "insufficient_credits") {
			const url = error.details.upgrade_url;
			if (typeof url === "string") await openInBrowser(url);
			return key.setTitle("Need\ncredits");
		}
		if (error instanceof Refused) return key.setTitle("Can't\nclip\nthis");
		return key.setTitle("Try\nagain");
	}
}
