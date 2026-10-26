// Pure helpers with no Stream Deck or network dependency, so they can be tested with plain node.

/** The first http(s) link in a piece of text, or undefined. Clipboards often hold more than the link. */
export function findLink(text: string | undefined): string | undefined {
	const match = text?.match(/https?:\/\/[^\s<>"']+/i);
	return match?.[0].replace(/[),.;!?]+$/, "");
}

/** What a key shows for a video, in at most three short lines (a key fits about 7 characters a line). */
export function videoTitle(video: { status?: string; progress_percent?: number; clips_ready?: number }): string {
	switch (video.status) {
		case "done":
			return `${video.clips_ready ?? 0}\nclips\nready`;
		case "failed":
			return "Failed";
		case "making the clips":
		case "processing":
			return `${Math.max(0, Math.min(99, video.progress_percent ?? 0))}%`;
		case "fetching the video":
			return "Fetching";
		default:
			return "Queued";
	}
}

/** Credits as a key title: 12500 -> "12.5k". */
export function creditsTitle(credits: number): string {
	const n = Math.max(0, Math.floor(credits));
	if (n < 10_000) return `${n}\ncredits`;
	return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, "")}k\ncredits`;
}

export function isFinished(status: string | undefined): boolean {
	return status === "done" || status === "failed";
}
