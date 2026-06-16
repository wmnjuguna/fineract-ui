import { NextRequest, NextResponse } from "next/server";
import { invalidRequestResponse } from "@/lib/fineract/api-error-response";
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
 * POST /api/fineract/glaccounts/uploadtemplate
 * Uploads GL accounts template file
 */
export async function POST(request: NextRequest) {
	try {
		const requestedTenantId = getTenantFromRequest(request);
		const { authHeader, tenantId } = await resolveFineractRequestContext({
			tenantId: requestedTenantId,
		});
		const formData = await request.formData();
		const fileEntry =
			formData.get("file") || formData.get("uploadedInputStream");
		const file = fileEntry instanceof File ? fileEntry : null;
		const locale = (formData.get("locale") as string | null) || "en";
		const dateFormat =
			(formData.get("dateFormat") as string | null) || "dd MMMM yyyy";

		if (!file) {
			return invalidRequestResponse("Template file is required");
		}
		if (file.size === 0) {
			return invalidRequestResponse("Template file is empty");
		}

		const fineractFormData = new FormData();
		fineractFormData.append("file", file, file.name);
		fineractFormData.append("locale", locale);
		fineractFormData.append("dateFormat", dateFormat);

		const response = await fetch(
			`${FINERACT_BASE_URL}${FINERACT_ENDPOINTS.glAccountsUploadTemplate}`,
			{
				method: "POST",
				headers: {
					Authorization: authHeader,
					"fineract-platform-tenantid": tenantId,
				},
				body: fineractFormData,
				cache: "no-store",
			},
		);

		const responseText = await response.text();
		let parsedData: unknown = null;
		if (responseText) {
			try {
				parsedData = JSON.parse(responseText);
			} catch {
				parsedData = { message: responseText };
			}
		}

		if (!response.ok) {
			const mappedError = normalizeApiError({
				status: response.status,
				data: parsedData,
				headers: response.headers,
				message: response.statusText,
			});
			return NextResponse.json(mappedError, {
				status: mappedError.httpStatus || response.status,
			});
		}

		return NextResponse.json(parsedData);
	} catch (error) {
		const mappedError = normalizeApiError(error);
		return NextResponse.json(mappedError, {
			status: mappedError.httpStatus || 500,
		});
	}
}
