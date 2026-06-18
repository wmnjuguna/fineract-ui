import "server-only";
import { auth } from "@/auth";
import { hasValidOidcSession } from "@/lib/auth/routes";

export async function getSession() {
	return await auth();
}

export async function getCurrentUser() {
	const session = await getSession();
	return session?.user;
}

export async function requireAuth() {
	const session = await getSession();

	if (!session?.user || !hasValidOidcSession(session)) {
		throw new Error("Unauthorized");
	}

	return session;
}

export async function getAccessToken() {
	const session = await getSession();

	if (!hasValidOidcSession(session)) {
		throw new Error("No OIDC access token available");
	}

	return session.accessToken;
}

export async function getUserIdentity() {
	const session = await requireAuth();

	if (!session?.username) {
		throw new Error("No user identity available");
	}

	return {
		username: session.username,
		tenantId: session.tenantId || "default",
	};
}

export function hasRole(
	session: { user?: { roles?: string[] } } | null,
	role: string,
): boolean {
	return session?.user?.roles?.includes(role) ?? false;
}

export function hasAnyRole(
	session: { user?: { roles?: string[] } } | null,
	roles: string[],
): boolean {
	return roles.some((role) => hasRole(session, role));
}
