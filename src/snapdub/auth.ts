import streamDeck from "@elgato/streamdeck";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { openInBrowser } from "./browser";

export const BASE_URL = "https://snapdub.ai";

/** What a sign-in leaves in the plugin's global settings. */
export type Session = {
	clientId: string;
	accessToken: string;
	refreshToken?: string;
	expiresAt: number;
	account?: string;
};

type GlobalSettings = { session?: Session | null };

const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

export async function currentSession(): Promise<Session | undefined> {
	const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
	return settings.session ?? undefined;
}

export async function saveSession(session: Session | undefined): Promise<void> {
	await streamDeck.settings.setGlobalSettings<GlobalSettings>({ session: session ?? null });
}

/**
 * Signs in the way desktop MCP clients do (RFC 8252): a one-off listener on 127.0.0.1, a client
 * registered for exactly that address (RFC 7591), the person approves in their own browser, PKCE
 * instead of a secret. Works for free accounts too - the plugin talks to /mcp, not the paid REST API.
 */
export async function signIn(): Promise<Session> {
	const verifier = base64url(randomBytes(32));
	const challenge = base64url(createHash("sha256").update(verifier).digest());
	const state = base64url(randomBytes(16));

	const { server, port, code } = await listenForCallback(state);
	try {
		const redirectUri = `http://127.0.0.1:${port}/callback`;
		const clientId = await register(redirectUri);
		const authorize = new URL(`${BASE_URL}/oauth/authorize`);
		authorize.search = new URLSearchParams({
			response_type: "code",
			client_id: clientId,
			redirect_uri: redirectUri,
			scope: "mcp",
			state,
			code_challenge: challenge,
			code_challenge_method: "S256"
		}).toString();
		await openInBrowser(authorize.toString());

		const tokens = await tokenRequest({
			grant_type: "authorization_code",
			code: await code,
			redirect_uri: redirectUri,
			client_id: clientId,
			code_verifier: verifier
		});
		const session = toSession(clientId, tokens);
		await saveSession(session);
		return session;
	} finally {
		server.close();
	}
}

/** A token that is still good for a minute, refreshing it first when needed. */
export async function accessToken(): Promise<string | undefined> {
	const session = await currentSession();
	if (!session) return undefined;
	if (session.expiresAt - Date.now() > 60_000) return session.accessToken;
	return (await refresh(session))?.accessToken;
}

export async function refresh(session: Session): Promise<Session | undefined> {
	if (!session.refreshToken) {
		await saveSession(undefined);
		return undefined;
	}
	try {
		const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: session.refreshToken, client_id: session.clientId });
		const next = { ...toSession(session.clientId, tokens), account: session.account };
		await saveSession(next);
		return next;
	} catch (error) {
		// A refresh token that was revoked or already used means signing in again.
		streamDeck.logger.warn(`refresh failed: ${error}`);
		await saveSession(undefined);
		return undefined;
	}
}

async function register(redirectUri: string): Promise<string> {
	const response = await fetch(`${BASE_URL}/oauth/register`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			client_name: "SnapDub for Stream Deck",
			redirect_uris: [redirectUri],
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			scope: "mcp"
		})
	});
	if (!response.ok) throw new Error(`registration failed (${response.status})`);
	return ((await response.json()) as { client_id: string }).client_id;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
	const response = await fetch(`${BASE_URL}/oauth/token`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(params).toString()
	});
	if (!response.ok) throw new Error(`token request failed (${response.status})`);
	return (await response.json()) as TokenResponse;
}

function toSession(clientId: string, tokens: TokenResponse): Session {
	return {
		clientId,
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000
	};
}

function listenForCallback(state: string): Promise<{ server: Server; port: number; code: Promise<string> }> {
	return new Promise((ready, failed) => {
		let deliver: (code: string) => void;
		let reject: (error: Error) => void;
		const code = new Promise<string>((resolve, rejectCode) => {
			deliver = resolve;
			reject = rejectCode;
		});
		const timer = setTimeout(() => reject(new Error("sign-in timed out")), SIGN_IN_TIMEOUT_MS);

		const server = createServer((req, res) => {
			const url = new URL(req.url ?? "/", "http://127.0.0.1");
			if (url.pathname !== "/callback") {
				res.writeHead(404).end();
				return;
			}
			const ok = url.searchParams.get("state") === state && url.searchParams.get("code");
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(page(ok ? "You're signed in. You can close this tab and go back to Stream Deck." : "Sign-in didn't finish. Press Sign in on your Stream Deck to try again."));
			clearTimeout(timer);
			if (ok) deliver(url.searchParams.get("code")!);
			else reject(new Error(url.searchParams.get("error") ?? "sign-in was not completed"));
		});
		server.on("error", failed);
		server.listen(0, "127.0.0.1", () => ready({ server, port: (server.address() as AddressInfo).port, code }));
	});
}

function page(message: string): string {
	return `<!doctype html><meta charset="utf-8"><title>SnapDub</title><body style="font-family:system-ui;display:grid;place-items:center;height:90vh;color:#222"><p style="font-size:18px">${message}</p></body>`;
}

function base64url(buffer: Buffer): string {
	return buffer.toString("base64url");
}
