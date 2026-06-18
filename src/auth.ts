import type { NextAuthConfig, Profile } from "next-auth";
import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Keycloak from "next-auth/providers/keycloak";
import {
	getDefaultTenantId,
	getKeycloakClientId,
	getKeycloakRuntimeConfig,
	getKeycloakTenantHint,
	getTenantIdFromIssuer,
} from "@/lib/auth/keycloak";
import {
	AUTHENTICATED_HOME,
	hasValidOidcSession,
	REFRESH_ACCESS_TOKEN_ERROR,
	SIGN_IN_PATH,
} from "@/lib/auth/routes";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (
		typeof value === "string" &&
		value.trim() &&
		!Number.isNaN(Number(value))
	) {
		return Number(value);
	}

	return undefined;
}

function addRoleValues(roles: Set<string>, value: unknown) {
	if (!Array.isArray(value)) {
		return;
	}

	for (const item of value) {
		if (typeof item === "string" && item.trim()) {
			roles.add(item);
			continue;
		}

		if (!isRecord(item)) {
			continue;
		}

		const roleName =
			getString(item.name) ?? getString(item.code) ?? getString(item.authority);
		if (roleName) {
			roles.add(roleName);
		}
	}
}

function getProfileRecord(profile: Profile | undefined): JsonRecord {
	return isRecord(profile) ? profile : {};
}

function getKeycloakRoles(profile: Profile | undefined): string[] {
	const profileRecord = getProfileRecord(profile);
	const clientId = getKeycloakClientId();
	const roles = new Set<string>();

	addRoleValues(roles, profileRecord.roles);

	const realmAccess = isRecord(profileRecord.realm_access)
		? profileRecord.realm_access
		: null;
	addRoleValues(roles, realmAccess?.roles);

	const resourceAccess = isRecord(profileRecord.resource_access)
		? profileRecord.resource_access
		: null;
	const clientAccess =
		resourceAccess && isRecord(resourceAccess[clientId])
			? resourceAccess[clientId]
			: null;
	addRoleValues(roles, clientAccess?.roles);

	if (resourceAccess) {
		for (const resource of Object.values(resourceAccess)) {
			if (isRecord(resource)) {
				addRoleValues(roles, resource.roles);
			}
		}
	}

	return [...roles];
}

function getProfileUsername(profile: Profile | undefined): string | undefined {
	const profileRecord = getProfileRecord(profile);
	return (
		getString(profileRecord.preferred_username) ??
		getString(profileRecord.email) ??
		getString(profile?.name)
	);
}

function getProfileIssuer(profile: Profile | undefined): string | undefined {
	const profileRecord = getProfileRecord(profile);
	return getString(profileRecord.iss);
}

function getAccountExpiresAt(account: {
	expires_at?: number;
	expires_in?: number;
}): number | undefined {
	if (typeof account.expires_at === "number") {
		return account.expires_at;
	}

	if (typeof account.expires_in === "number") {
		return Math.floor(Date.now() / 1000) + account.expires_in;
	}

	return undefined;
}

async function refreshKeycloakAccessToken(token: JWT): Promise<JWT> {
	if (!token.issuer || !token.refreshToken) {
		return {
			...token,
			authError: REFRESH_ACCESS_TOKEN_ERROR,
		};
	}

	try {
		const body = new URLSearchParams({
			client_id: getKeycloakClientId(),
			grant_type: "refresh_token",
			refresh_token: token.refreshToken,
		});
		const clientSecret = process.env.AUTH_KEYCLOAK_SECRET?.trim();
		if (clientSecret) {
			body.set("client_secret", clientSecret);
		}

		const response = await fetch(
			`${token.issuer.replace(/\/+$/, "")}/protocol/openid-connect/token`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body,
				cache: "no-store",
			},
		);

		const refreshedToken: unknown = await response.json().catch(() => null);
		if (!response.ok || !isRecord(refreshedToken)) {
			console.error("Keycloak token refresh failed", {
				status: response.status,
				body: refreshedToken,
			});
			return {
				...token,
				authError: REFRESH_ACCESS_TOKEN_ERROR,
			};
		}

		const accessToken = getString(refreshedToken.access_token);
		const expiresIn = getNumber(refreshedToken.expires_in);
		if (!accessToken) {
			return {
				...token,
				authError: REFRESH_ACCESS_TOKEN_ERROR,
			};
		}

		return {
			...token,
			accessToken,
			expiresAt: expiresIn
				? Math.floor(Date.now() / 1000) + expiresIn
				: token.expiresAt,
			idToken: getString(refreshedToken.id_token) ?? token.idToken,
			refreshToken:
				getString(refreshedToken.refresh_token) ?? token.refreshToken,
			authError: undefined,
		};
	} catch (error) {
		console.error("Keycloak token refresh error:", error);
		return {
			...token,
			authError: REFRESH_ACCESS_TOKEN_ERROR,
		};
	}
}

async function authProviders(
	request?: Request,
): Promise<NextAuthConfig["providers"]> {
	const tenantHint =
		(await getKeycloakTenantHint(request)) ?? getDefaultTenantId();
	const keycloakConfig = getKeycloakRuntimeConfig(tenantHint);
	if (!keycloakConfig) {
		return [];
	}

	return [
		Keycloak({
			authorization: {
				params: {
					scope: "openid email profile offline_access",
				},
			},
			clientId: keycloakConfig.clientId,
			...(keycloakConfig.clientSecret
				? { clientSecret: keycloakConfig.clientSecret }
				: { client: { token_endpoint_auth_method: "none" } }),
			issuer: keycloakConfig.issuer,
			checks: ["pkce", "state"],
		}),
	];
}

export async function authConfig(request?: Request): Promise<NextAuthConfig> {
	return {
		providers: await authProviders(request),
		callbacks: {
			async signIn({ account, profile }) {
				if (account?.provider !== "keycloak") {
					return false;
				}

				const issuer = getProfileIssuer(profile);
				return Boolean(issuer && getTenantIdFromIssuer(issuer));
			},
			async jwt({ token, account, profile }) {
				if (account?.provider === "keycloak") {
					const issuer = getProfileIssuer(profile);
					const tenantId = getTenantIdFromIssuer(issuer);

					token.accessToken = account.access_token;
					token.idToken = account.id_token;
					token.refreshToken = account.refresh_token;
					token.expiresAt = getAccountExpiresAt(account);
					token.provider = "keycloak";
					token.issuer = issuer;
					token.tenantId = tenantId ?? undefined;
					token.username = getProfileUsername(profile);
					token.email = profile?.email;
					token.name = profile?.name;
					token.roles = getKeycloakRoles(profile);
					token.authError = undefined;

					return token;
				}

				if (token.provider !== "keycloak") {
					return token;
				}

				if (
					typeof token.expiresAt === "number" &&
					Date.now() < (token.expiresAt - 60) * 1000
				) {
					return token;
				}

				return refreshKeycloakAccessToken(token);
			},
			async session({ session, token }) {
				if (token) {
					session.accessToken = token.accessToken;
					session.idToken = token.idToken;
					session.refreshToken = token.refreshToken;
					session.expiresAt = token.expiresAt;
					session.provider = token.provider;
					session.issuer = token.issuer;
					session.username = token.username;
					session.tenantId = token.tenantId;
					session.authError = token.authError;
					const existingUser = session.user ?? {};
					session.user = {
						...existingUser,
						email: token.email ?? existingUser.email ?? null,
						name: token.name ?? existingUser.name ?? null,
						roles: token.roles ?? [],
					};
				}

				return session;
			},
			async authorized({ auth, request }) {
				const hasValidSession = hasValidOidcSession(auth);
				const isOnAdminPage = request.nextUrl.pathname.startsWith("/config");
				const isOnLoginPage = request.nextUrl.pathname.startsWith(SIGN_IN_PATH);

				if (isOnAdminPage) {
					return hasValidSession;
				}

				if (hasValidSession && isOnLoginPage) {
					return Response.redirect(
						new URL(AUTHENTICATED_HOME, request.nextUrl),
					);
				}

				return true;
			},
		},
		pages: {
			signIn: "/auth/signin",
			error: "/auth/error",
		},
		session: {
			strategy: "jwt",
			maxAge: 30 * 24 * 60 * 60,
		},
		trustHost: true,
	};
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
