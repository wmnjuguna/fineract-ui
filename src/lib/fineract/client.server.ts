import "server-only";
import { getDefaultTenantId, normalizeTenantId } from "@/lib/auth/keycloak";
import { getSession } from "@/lib/auth/session";
import { normalizeApiError } from "@/lib/fineract/ui-api-error";

/**
 * Server-side Fineract client
 * This file can only be imported in server components and API routes
 */

const FINERACT_BASE_URL =
	process.env.FINERACT_BASE_URL ||
	"https://demo.fineract.dev/fineract-provider/api";
const FINERACT_USERNAME = process.env.FINERACT_USERNAME || "mifos";
const FINERACT_PASSWORD = process.env.FINERACT_PASSWORD || "password";

interface FineractRequestOptions {
	method?: string;
	body?: unknown;
	tenantId?: string; // Made optional - will use session tenantId if not provided
	headers?: Record<string, string>;
	useBasicAuth?: boolean; // Optional flag to use basic auth instead of bearer token
}

type ResolvedRequestContext = {
	authHeader: string;
	tenantId: string;
};

function getServiceBasicAuthHeader(): string {
	const basicAuth = Buffer.from(
		`${FINERACT_USERNAME}:${FINERACT_PASSWORD}`,
	).toString("base64");
	return `Basic ${basicAuth}`;
}

function authenticationRequiredError(message = "Authentication is required") {
	return normalizeApiError({
		status: 401,
		data: {
			code: "UNAUTHORIZED",
			message,
		},
	});
}

function invalidTenantError() {
	return normalizeApiError({
		status: 400,
		data: {
			code: "INVALID_TENANT",
			message: "Invalid tenant ID",
		},
	});
}

export async function resolveFineractRequestContext(
	options: FineractRequestOptions,
): Promise<ResolvedRequestContext> {
	const { tenantId: providedTenantId, useBasicAuth = false } = options;
	const session = await getSession();

	if (!session?.user) {
		throw authenticationRequiredError();
	}

	const tenantId =
		normalizeTenantId(session.tenantId) ??
		normalizeTenantId(providedTenantId) ??
		getDefaultTenantId();

	if (session.authError) {
		throw authenticationRequiredError("Session authentication has expired");
	}

	if (useBasicAuth) {
		return {
			authHeader: getServiceBasicAuthHeader(),
			tenantId,
		};
	}

	if (session.provider === "keycloak" && session.accessToken) {
		return {
			authHeader: `Bearer ${session.accessToken}`,
			tenantId,
		};
	}

	if (session.provider === "credentials" && session.credentials) {
		return {
			authHeader: `Basic ${session.credentials}`,
			tenantId,
		};
	}

	throw authenticationRequiredError();
}

function buildRequestInit(
	method: string,
	authHeader: string,
	tenantId: string,
	headers: Record<string, string>,
	body: unknown,
): RequestInit {
	const requestHeaders: Record<string, string> = {
		Authorization: authHeader,
		"fineract-platform-tenantid": tenantId,
		...headers,
	};

	if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
		requestHeaders["Content-Type"] =
			requestHeaders["Content-Type"] || "application/json";
	}

	const requestInit: RequestInit = {
		method,
		headers: requestHeaders,
		cache: "no-store",
	};

	if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
		requestInit.body = JSON.stringify(body);
	}

	return requestInit;
}

export async function fineractFetchResponse(
	path: string,
	options: FineractRequestOptions,
): Promise<Response> {
	const { method = "GET", body, headers = {} } = options;
	const { authHeader, tenantId } = await resolveFineractRequestContext(options);
	const requestInit = buildRequestInit(
		method,
		authHeader,
		tenantId,
		headers,
		body,
	);

	return fetch(`${FINERACT_BASE_URL}${path}`, requestInit);
}

/**
 * Makes authenticated requests to Fineract API
 * Automatically detects authentication method based on session:
 * - For Keycloak provider: Uses Bearer token
 * - For Credentials provider: Uses Basic auth with user's credentials
 * - Explicit useBasicAuth calls require an authenticated session first
 */
export async function fineractFetch<T = unknown>(
	path: string,
	options: FineractRequestOptions,
): Promise<T> {
	const response = await fineractFetchResponse(path, options);

	// Handle non-JSON and empty responses safely.
	if (response.status === 204) {
		return null as T;
	}

	const rawBody = await response.text();
	let data: unknown = null;
	if (rawBody) {
		try {
			data = JSON.parse(rawBody);
		} catch {
			data = { message: rawBody };
		}
	}

	if (!response.ok) {
		throw normalizeApiError({
			status: response.status,
			data: data ?? rawBody,
			headers: response.headers,
			message: response.statusText || "Request failed",
		});
	}

	return data as T;
}

/**
 * Validates tenant ID header from request
 */
export function getTenantFromRequest(request: Request): string {
	// Check for tenant ID in different header formats
	const tenantId =
		request.headers.get("x-tenant-id") ||
		request.headers.get("fineract-platform-tenantid") ||
		request.headers.get("X-Tenant-Id");

	if (!tenantId) {
		return getDefaultTenantId();
	}

	const normalizedTenantId = normalizeTenantId(tenantId);
	if (!normalizedTenantId) {
		throw invalidTenantError();
	}

	return normalizedTenantId;
}
