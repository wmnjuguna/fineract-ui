import { NextRequest, NextResponse } from "next/server";
import {
	getTenantFromRequest,
	resolveFineractRequestContext,
} from "@/lib/fineract/client.server";
import { FINERACT_ENDPOINTS } from "@/lib/fineract/endpoints";
import { normalizeApiError } from "@/lib/fineract/ui-api-error";

const FINERACT_BASE_URL =
	process.env.FINERACT_BASE_URL ||
	"https://demo.fineract.dev/fineract-provider/api";

/**
 * GET /api/fineract/glaccounts/downloadtemplate
 * Downloads GL accounts Excel template
 */
export async function GET(request: NextRequest) {
	try {
		const requestedTenantId = getTenantFromRequest(request);
		const { authHeader, tenantId } = await resolveFineractRequestContext({
			tenantId: requestedTenantId,
		});
		const searchParams = request.nextUrl.searchParams.toString();
		const path = searchParams
			? `${FINERACT_ENDPOINTS.glAccountsDownloadTemplate}?${searchParams}`
			: FINERACT_ENDPOINTS.glAccountsDownloadTemplate;
		const url = `${FINERACT_BASE_URL}${path}`;

		const response = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: authHeader,
				"fineract-platform-tenantid": tenantId,
				Accept: "application/vnd.ms-excel",
			},
			cache: "no-store",
		});

		if (!response.ok) {
			const text = await response.text();
			let errorData: unknown;
			try {
				errorData = JSON.parse(text);
			} catch {
				errorData = { message: text || response.statusText };
			}
			const mappedError = normalizeApiError({
				status: response.status,
				data: errorData,
				headers: response.headers,
				message: response.statusText,
			});
			return NextResponse.json(mappedError, {
				status: mappedError.httpStatus || response.status,
			});
		}

		const data = await response.arrayBuffer();
		const filename =
			response.headers.get("content-disposition") ||
			`attachment; filename=\"glaccounts-template.xls\"`;

		return new NextResponse(data, {
			status: 200,
			headers: {
				"Content-Type":
					response.headers.get("content-type") || "application/vnd.ms-excel",
				"Content-Disposition": filename,
				"Content-Length": data.byteLength.toString(),
			},
		});
	} catch (error) {
		const mappedError = normalizeApiError(error);
		return NextResponse.json(mappedError, {
			status: mappedError.httpStatus || 500,
		});
	}
}
