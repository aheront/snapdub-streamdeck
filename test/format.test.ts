import { strict as assert } from "node:assert";
import { test } from "node:test";

import { creditsTitle, findLink, isFinished, videoTitle } from "../src/snapdub/format.ts";

test("findLink takes the link out of whatever else was copied", () => {
	assert.equal(findLink("watch this https://youtu.be/abc123?t=5, it's good"), "https://youtu.be/abc123?t=5");
	assert.equal(findLink("(https://www.twitch.tv/videos/1)"), "https://www.twitch.tv/videos/1");
	assert.equal(findLink("no link here"), undefined);
	assert.equal(findLink(undefined), undefined);
});

test("videoTitle fits a key", () => {
	assert.equal(videoTitle({ status: "making the clips", progress_percent: 42 }), "42%");
	assert.equal(videoTitle({ status: "processing", progress_percent: 100 }), "99%");
	assert.equal(videoTitle({ status: "done", clips_ready: 12 }), "12\nclips\nready");
	assert.equal(videoTitle({ status: "failed" }), "Failed");
	assert.equal(videoTitle({ status: "waiting to start" }), "Queued");
});

test("creditsTitle shortens big numbers", () => {
	assert.equal(creditsTitle(352), "352\ncredits");
	assert.equal(creditsTitle(12500), "12.5k\ncredits");
	assert.equal(creditsTitle(150000), "150k\ncredits");
	assert.equal(creditsTitle(-3), "0\ncredits");
});

test("isFinished", () => {
	assert.equal(isFinished("done"), true);
	assert.equal(isFinished("failed"), true);
	assert.equal(isFinished("processing"), false);
});
