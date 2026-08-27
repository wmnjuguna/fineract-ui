export const AUTHENTICATED_HOME = "/config";
export const SIGN_IN_PATH = "/auth/signin";
export const REFRESH_ACCESS_TOKEN_ERROR = "RefreshAccessTokenError";

const PUBLIC_PATHS = new Set([
	"/",
	SIGN_IN_PATH,
	"/auth/signin/choose",
	"/auth/error",
	"/auth/signout",
]);
const INTERNAL_PATH_PATTERN = /^\/(?!\/)/;

type OidcSessionLike = {
	accessToken?: unknown;
	authError?: unknown;
	provider?: unknown;
};

type ValidOidcSession = OidcSessionLike & {
	accessToken: string;
	provider: "keycloak";
};

export function isPublicAuthPath(pathname: string) {
	return PUBLIC_PATHS.has(pathname);
}

export function hasValidOidcSession(
	session: OidcSessionLike | null | undefined,
): session is ValidOidcSession {
	return (
		session?.provider === "keycloak" &&
		typeof session.accessToken === "string" &&
		session.accessToken.trim().length > 0 &&
		session.authError !== REFRESH_ACCESS_TOKEN_ERROR
	);
}

export function normalizeCallbackPath(
	value: string | string[] | undefined,
	fallback = AUTHENTICATED_HOME,
) {
	const candidate = Array.isArray(value) ? value[0] : value;

	if (!(candidate && INTERNAL_PATH_PATTERN.test(candidate))) {
		return fallback;
	}

	try {
		const url = new URL(candidate, "https://fineract.local");

		if (isPublicAuthPath(url.pathname)) {
			return fallback;
		}

		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return fallback;
	}
}
