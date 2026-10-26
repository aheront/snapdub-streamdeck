import streamDeck from "@elgato/streamdeck";

import { accessToken, BASE_URL, currentSession, refresh } from "./auth";

/** The person has to sign in (again) before anything else can happen. */
export class SignInNeeded extends Error {}

/** SnapDub said no in words meant for the person: out of credits, a link it can't import... */
export class Refused extends Error {
	constructor(
		message: string,
		readonly details: Record<string, unknown> = {}
	) {
		super(message);
	}
}

let requestId = 0;

/**
 * Calls one SnapDub MCP tool and returns its structured result. /mcp is stateless JSON-RPC over
 * plain HTTP, so a tool call is a single POST - no session, no event stream.
 */
export async function callTool<T = Record<string, unknown>>(name: string, args: Record<string, unknown> = {}): Promise<T> {
	let token = await accessToken();
	if (!token) {
		streamDeck.logger.info(`${name}: no saved sign-in`);
		throw new SignInNeeded("Sign in to SnapDub first.");
	}

	let response = await post(token, name, args);
	streamDeck.logger.info(`${name}: ${response.status}`);
	if (response.status === 401) {
		const session = await currentSession();
		token = session ? (await refresh(session))?.accessToken : undefined;
		if (!token) throw new SignInNeeded("Your SnapDub sign-in expired. Sign in again.");
		response = await post(token, name, args);
	}
	if (response.status === 401) throw new SignInNeeded("Sign in to SnapDub again.");
	if (!response.ok) throw new Error(`SnapDub answered ${response.status}`);

	const body = (await response.json()) as {
		error?: { message?: string };
		result?: { isError?: boolean; structuredContent?: Record<string, unknown>; content?: { text?: string }[] };
	};
	if (body.error) throw new Error(body.error.message ?? "SnapDub returned an error");
	const result = body.result ?? {};
	if (result.isError) {
		const text = result.content?.map((c) => c.text).join(" ") || "SnapDub couldn't do that.";
		throw new Refused(text, result.structuredContent ?? {});
	}
	return (result.structuredContent ?? JSON.parse(result.content?.[0]?.text ?? "{}")) as T;
}

function post(token: string, name: string, args: Record<string, unknown>): Promise<Response> {
	return fetch(`${BASE_URL}/mcp`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			"MCP-Protocol-Version": "2025-06-18"
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method: "tools/call", params: { name, arguments: args } })
	});
}

export type Video = {
	video_id: string;
	title?: string;
	status?: string;
	progress_percent?: number;
	clips_ready?: number;
	error?: string;
	url?: string;
};

export type Account = { account?: string; plan?: string; credits_left?: number; upgrade_url?: string };
