export const KEYCLOAK_TENANT_HINT_COOKIE = "fineract.keycloak-tenant";

const DEFAULT_KEYCLOAK_CLIENT_ID = "fineract-ui";
const DEFAULT_TENANT_ID = "default";
const KEYCLOAK_TENANT_HINT_MAX_AGE_SECONDS = 10 * 60;
const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;

export type AuthLoginMode = "dual" | "keycloak" | "credentials";

export type KeycloakRuntimeConfig = {
	clientId: string;
	clientSecret?: string;
	defaultTenantId: string;
	issuer: string;
	tenantRealmEnabled: boolean;
};

export function normalizeTenantId(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const tenantId = value.trim();
	if (!TENANT_ID_PATTERN.test(tenantId)) {
		return null;
	}

	return tenantId;
}

export function getDefaultTenantId(): string {
	return (
		normalizeTenantId(process.env.AUTH_KEYCLOAK_DEFAULT_TENANT) ??
		DEFAULT_TENANT_ID
	);
}

export function getAuthLoginMode(): AuthLoginMode {
	const value = process.env.AUTH_LOGIN_MODE?.trim().toLowerCase();
	if (value === "keycloak" || value === "credentials") {
		return value;
	}

	return "dual";
}

export function getKeycloakClientId(): string {
	return process.env.AUTH_KEYCLOAK_ID?.trim() || DEFAULT_KEYCLOAK_CLIENT_ID;
}

function getKeycloakBaseUrl(): string | null {
	const baseUrl = process.env.AUTH_KEYCLOAK_BASE_URL?.trim();
	if (!baseUrl) {
		return null;
	}

	return baseUrl.replace(/\/+$/, "");
}

function getLegacyKeycloakIssuer(): string | null {
	const issuer = process.env.AUTH_KEYCLOAK_ISSUER?.trim();
	if (!issuer) {
		return null;
	}

	return issuer.replace(/\/+$/, "");
}

export function getKeycloakIssuerForTenant(tenantId: string): string | null {
	const normalizedTenantId = normalizeTenantId(tenantId);
	if (!normalizedTenantId) {
		return null;
	}

	const baseUrl = getKeycloakBaseUrl();
	if (baseUrl) {
		return `${baseUrl}/realms/${encodeURIComponent(normalizedTenantId)}`;
	}

	return getLegacyKeycloakIssuer();
}

export function getTenantIdFromIssuer(issuer: unknown): string | null {
	if (typeof issuer !== "string" || !issuer.trim()) {
		return null;
	}

	try {
		const url = new URL(issuer);
		const parts = url.pathname.split("/").filter(Boolean);
		const realmsIndex = parts.lastIndexOf("realms");
		if (realmsIndex === -1 || !parts[realmsIndex + 1]) {
			return null;
		}

		return normalizeTenantId(decodeURIComponent(parts[realmsIndex + 1]));
	} catch {
		return null;
	}
}

export function getKeycloakRuntimeConfig(
	tenantId: string,
): KeycloakRuntimeConfig | null {
	const normalizedTenantId = normalizeTenantId(tenantId);
	if (!normalizedTenantId) {
		return null;
	}

	const issuer = getKeycloakIssuerForTenant(normalizedTenantId);
	if (!issuer) {
		return null;
	}

	const clientSecret = process.env.AUTH_KEYCLOAK_SECRET?.trim();

	return {
		clientId: getKeycloakClientId(),
		clientSecret: clientSecret || undefined,
		defaultTenantId: getDefaultTenantId(),
		issuer,
		tenantRealmEnabled: Boolean(getKeycloakBaseUrl()),
	};
}

export function isKeycloakConfigured(): boolean {
	return Boolean(getKeycloakRuntimeConfig(getDefaultTenantId())?.issuer);
}

export function getAuthLoginSettings() {
	const mode = getAuthLoginMode();
	const keycloakConfigured = isKeycloakConfigured();

	return {
		mode,
		defaultTenantId: getDefaultTenantId(),
		keycloakClientId: getKeycloakClientId(),
		credentialsEnabled: mode !== "keycloak",
		keycloakConfigured,
		keycloakEnabled: mode !== "credentials" && keycloakConfigured,
		keycloakRequired: mode === "keycloak",
	};
}

function parseCookieHeader(
	cookieHeader: string | null,
	name: string,
): string | null {
	if (!cookieHeader) {
		return null;
	}

	const cookiePrefix = `${name}=`;
	const cookieValue = cookieHeader
		.split(";")
		.map((cookie) => cookie.trim())
		.find((cookie) => cookie.startsWith(cookiePrefix))
		?.slice(cookiePrefix.length);

	if (!cookieValue) {
		return null;
	}

	try {
		return decodeURIComponent(cookieValue);
	} catch {
		return null;
	}
}

export async function getKeycloakTenantHint(
	request?: Request,
): Promise<string | null> {
	const requestCookieValue = parseCookieHeader(
		request?.headers.get("cookie") ?? null,
		KEYCLOAK_TENANT_HINT_COOKIE,
	);
	const requestTenantId = normalizeTenantId(requestCookieValue);
	if (requestTenantId) {
		return requestTenantId;
	}

	try {
		const { cookies } = await import("next/headers");
		const cookieStore = await cookies();
		return normalizeTenantId(
			cookieStore.get(KEYCLOAK_TENANT_HINT_COOKIE)?.value,
		);
	} catch {
		return null;
	}
}

export async function setKeycloakTenantHintCookie(tenantId: string) {
	const normalizedTenantId = normalizeTenantId(tenantId);
	if (!normalizedTenantId) {
		throw new Error("Invalid tenant ID");
	}

	const { cookies } = await import("next/headers");
	const cookieStore = await cookies();
	cookieStore.set(KEYCLOAK_TENANT_HINT_COOKIE, normalizedTenantId, {
		httpOnly: true,
		maxAge: KEYCLOAK_TENANT_HINT_MAX_AGE_SECONDS,
		path: "/",
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
	});
}

export async function clearKeycloakTenantHintCookie() {
	const { cookies } = await import("next/headers");
	const cookieStore = await cookies();
	cookieStore.set(KEYCLOAK_TENANT_HINT_COOKIE, "", {
		httpOnly: true,
		maxAge: 0,
		path: "/",
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
	});
}

export function buildKeycloakLogoutUrl({
	idToken,
	issuer,
	postLogoutRedirectUri,
}: {
	idToken?: string | null;
	issuer?: string | null;
	postLogoutRedirectUri: string;
}): string | null {
	if (!issuer || !idToken) {
		return null;
	}

	const logoutUrl = new URL(
		`${issuer.replace(/\/+$/, "")}/protocol/openid-connect/logout`,
	);
	logoutUrl.searchParams.set("id_token_hint", idToken);
	logoutUrl.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);

	return logoutUrl.toString();
}

export async function getRequestOrigin(): Promise<string> {
	if (process.env.AUTH_URL) {
		return process.env.AUTH_URL.replace(/\/+$/, "");
	}

	if (process.env.NEXTAUTH_URL) {
		return process.env.NEXTAUTH_URL.replace(/\/+$/, "");
	}

	const { headers } = await import("next/headers");
	const requestHeaders = await headers();
	const host =
		requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
	const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";

	if (!host) {
		return "/";
	}

	return `${protocol}://${host}`;
}
