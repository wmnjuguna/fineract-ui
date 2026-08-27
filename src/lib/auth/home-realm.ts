import "server-only";

import { normalizeTenantId } from "@/lib/auth/keycloak";

/** The control-plane route that resolves an identifier to its home realm(s). */
const DISCOVERY_PATH = "/api/public/sign-in/home-realms";

/** Carries the resolved realm choice to the chooser screen when a person belongs to more than one. */
const CHOICE_COOKIE = "fineract.signin-choice";

/** Long enough to pick an organisation, short enough not to linger. */
const CHOICE_MAX_AGE_SECONDS = 5 * 60;

/**
 * The base URL of the tenancy (control-plane) service that owns the identity directory. On the shared Docker
 * network this is the service name; the default keeps a local `pnpm dev` working against a service on 8080.
 */
function discoveryBaseUrl(): string {
	return (
		process.env.TENANT_MGMT_API_BASE_URL ?? "http://127.0.0.1:8080"
	).replace(/\/+$/, "");
}

/**
 * The realm(s) a work email may sign in to, resolved by the control plane — never by the browser, and never
 * from anything the person typed as a tenant. One realm is a redirect; more than one is a choice.
 *
 * An unknown email comes back as the decoy realm, shaped exactly like a single-realm hit, so this call reveals
 * neither which partners nor which people exist (SEC-10). A discovery that cannot answer throws, and the caller
 * renders that as the one sign-in failure — never as "no such account".
 */
export async function resolveHomeRealms(identifier: string): Promise<string[]> {
	const response = await fetch(`${discoveryBaseUrl()}${DISCOVERY_PATH}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ identifier }),
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(
			`Home-realm discovery is unavailable (${response.status}).`,
		);
	}

	const body = (await response.json()) as { data?: { realms?: unknown } };
	const realms = Array.isArray(body.data?.realms) ? body.data.realms : [];

	const resolved: string[] = [];
	for (const realm of realms) {
		const normalized = normalizeTenantId(realm);
		if (normalized && !resolved.includes(normalized)) {
			resolved.push(normalized);
		}
	}
	return resolved;
}

/** A pending multi-organisation sign-in: the email that was proven, and the realms it may reach. */
export type SignInChoice = { email: string; realms: string[] };

/**
 * Hold a multi-organisation sign-in across the redirect to the chooser. `httpOnly` because the browser never
 * reads it back — the person picks, the server acts.
 */
export async function rememberSignInChoice(
	choice: SignInChoice,
): Promise<void> {
	const { cookies } = await import("next/headers");
	const store = await cookies();

	store.set(CHOICE_COOKIE, JSON.stringify(choice), {
		httpOnly: true,
		maxAge: CHOICE_MAX_AGE_SECONDS,
		path: "/",
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
	});
}

/** The pending sign-in choice for this request, if one is still in flight. */
export async function readSignInChoice(): Promise<SignInChoice | undefined> {
	const { cookies } = await import("next/headers");
	const store = await cookies();
	const raw = store.get(CHOICE_COOKIE)?.value;
	if (!raw) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(raw) as SignInChoice;
		const realms = Array.isArray(parsed?.realms)
			? parsed.realms
					.map((realm) => normalizeTenantId(realm))
					.filter((realm): realm is string => Boolean(realm))
			: [];
		if (typeof parsed?.email === "string" && realms.length > 0) {
			return { email: parsed.email, realms };
		}
	} catch {
		// A malformed cookie is no choice at all.
	}
	return undefined;
}

/** Drop the pending choice once a realm has been settled on. */
export async function clearSignInChoice(): Promise<void> {
	const { cookies } = await import("next/headers");
	const store = await cookies();
	store.delete(CHOICE_COOKIE);
}
