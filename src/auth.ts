import type { NextAuthConfig, Profile } from "next-auth";
import NextAuth from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import Keycloak from "next-auth/providers/keycloak";
import {
	getAuthLoginMode,
	getDefaultTenantId,
	getKeycloakClientId,
	getKeycloakRuntimeConfig,
	getKeycloakTenantHint,
	getTenantIdFromIssuer,
	normalizeTenantId,
} from "@/lib/auth/keycloak";

type ExtendedUser = {
	email?: string | null;
	name?: string | null;
	username?: string;
	roles?: string[];
	tenantId?: string;
	credentials?: string;
};

type FineractAuthUser = ExtendedUser & {
	id: string;
};

type JsonRecord = Record<string, unknown>;

const FINERACT_BASE_URL =
	process.env.FINERACT_BASE_URL ||
	"https://demo.fineract.dev/fineract-provider/api";

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

function getTenantIdFromCredentials(
	credentials: Partial<Record<string, unknown>>,
) {
	const submittedTenantId = getString(credentials.tenantId);
	const tenantIdCandidate = submittedTenantId || getDefaultTenantId();
	return normalizeTenantId(tenantIdCandidate);
}

/**
 * Authenticate user against Fineract API using POST /v1/authentication.
 */
async function authenticateWithFineract(
	username: string,
	password: string,
	tenantId: string,
): Promise<FineractAuthUser | null> {
	try {
		const authHeader = Buffer.from(`${username}:${password}`).toString(
			"base64",
		);

		const response = await fetch(
			`${FINERACT_BASE_URL}/v1/authentication?returnClientList=false`,
			{
				method: "POST",
				headers: {
					Authorization: `Basic ${authHeader}`,
					"fineract-platform-tenantid": tenantId,
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify({ username, password }),
				cache: "no-store",
			},
		);

		if (!response.ok) {
			return null;
		}

		const userData: unknown = await response.json();
		if (!isRecord(userData) || userData.authenticated !== true) {
			return null;
		}

		const roles = new Set<string>();
		addRoleValues(roles, userData.roles);
		const userId = userData.userId;
		const resolvedUsername = getString(userData.username) ?? username;
		const officeName = getString(userData.officeName);

		return {
			id:
				typeof userId === "number" || typeof userId === "string"
					? String(userId)
					: username,
			username: resolvedUsername,
			email: `${resolvedUsername}@fineract.local`,
			name: officeName ?? resolvedUsername,
			roles: [...roles],
			tenantId,
		};
	} catch (error) {
		console.error("Fineract authentication error:", error);
		return null;
	}
}

async function refreshKeycloakAccessToken(token: JWT): Promise<JWT> {
	if (!token.issuer || !token.refreshToken) {
		return {
			...token,
			authError: "RefreshAccessTokenError",
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
				authError: "RefreshAccessTokenError",
			};
		}

		const accessToken = getString(refreshedToken.access_token);
		const expiresIn = getNumber(refreshedToken.expires_in);
		if (!accessToken) {
			return {
				...token,
				authError: "RefreshAccessTokenError",
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
			authError: "RefreshAccessTokenError",
		};
	}
}

function credentialsProvider() {
	return Credentials({
		id: "credentials",
		name: "Username & Password",
		credentials: {
			username: { label: "Username", type: "text" },
			password: { label: "Password", type: "password" },
			tenantId: { label: "Tenant ID", type: "text" },
		},
		async authorize(credentials) {
			const username = getString(credentials?.username);
			const password = getString(credentials?.password);
			const tenantId = getTenantIdFromCredentials(credentials ?? {});

			if (!username || !password || !tenantId) {
				return null;
			}

			const user = await authenticateWithFineract(username, password, tenantId);
			if (!user) {
				return null;
			}

			return {
				...user,
				credentials: Buffer.from(`${username}:${password}`).toString("base64"),
			};
		},
	});
}

async function authProviders(
	request?: Request,
): Promise<NextAuthConfig["providers"]> {
	const mode = getAuthLoginMode();
	const providers: NextAuthConfig["providers"] = [];

	if (mode !== "keycloak") {
		providers.push(credentialsProvider());
	}

	if (mode === "credentials") {
		return providers;
	}

	const tenantHint =
		(await getKeycloakTenantHint(request)) ?? getDefaultTenantId();
	const keycloakConfig = getKeycloakRuntimeConfig(tenantHint);
	if (!keycloakConfig) {
		return providers;
	}

	providers.push(
		Keycloak({
			clientId: keycloakConfig.clientId,
			...(keycloakConfig.clientSecret
				? { clientSecret: keycloakConfig.clientSecret }
				: { client: { token_endpoint_auth_method: "none" } }),
			issuer: keycloakConfig.issuer,
			checks: ["pkce", "state"],
		}),
	);

	return providers;
}

export async function authConfig(request?: Request): Promise<NextAuthConfig> {
	return {
		providers: await authProviders(request),
		callbacks: {
			async signIn({ account, profile }) {
				if (account?.provider !== "keycloak") {
					return true;
				}

				const issuer = getProfileIssuer(profile);
				return Boolean(issuer && getTenantIdFromIssuer(issuer));
			},
			async jwt({ token, account, profile, user }) {
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

				if (account?.provider === "credentials" && user) {
					token.username = (user as ExtendedUser).username;
					token.email = user.email;
					token.name = user.name;
					token.roles = (user as ExtendedUser).roles || [];
					token.tenantId =
						(user as ExtendedUser).tenantId || getDefaultTenantId();
					token.provider = "credentials";
					token.credentials = (user as ExtendedUser).credentials;
					token.authError = undefined;
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
					session.credentials = token.credentials;
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
				const isLoggedIn = !!auth?.user;
				const isOnAdminPage = request.nextUrl.pathname.startsWith("/config");
				const isOnLoginPage =
					request.nextUrl.pathname.startsWith("/auth/signin");

				if (isOnAdminPage) {
					if (!isLoggedIn) return false;
					return true;
				}

				if (isLoggedIn && isOnLoginPage) {
					return Response.redirect(new URL("/config", request.nextUrl));
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
