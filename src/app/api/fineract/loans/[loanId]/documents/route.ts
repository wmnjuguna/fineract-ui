import { NextRequest, NextResponse } from "next/server";
import { invalidRequestResponse } from "@/lib/fineract/api-error-response";
import {
	fineractFetch,
	getTenantFromRequest,
	resolveFineractRequestContext,
} from "@/lib/fineract/client.server";
import { FINERACT_ENDPOINTS } from "@/lib/fineract/endpoints";
import { normalizeApiError } from "@/lib/fineract/ui-api-error";

/**
 * GET /api/fineract/loans/[loanId]/documents
 * Fetches all documents for a loan
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ loanId: string }> },
) {
	try {
		const tenantId = getTenantFromRequest(request);
		const { loanId } = await params;
		const loanIdNum = parseInt(loanId, 10);

		if (isNaN(loanIdNum)) {
			return invalidRequestResponse("Invalid loan ID");
		}

		const path = FINERACT_ENDPOINTS.loanDocuments(loanIdNum);
		const documents = await fineractFetch(path, {
			method: "GET",
			tenantId,
		});

		return NextResponse.json(documents);
	} catch (error) {
		const mappedError = normalizeApiError(error);
		return NextResponse.json(mappedError, {
			status: mappedError.httpStatus || 500,
		});
	}
}

/**
 * POST /api/fineract/loans/[loanId]/documents
 * Uploads a new document to a loan (multipart form data)
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ loanId: string }> },
) {
	try {
		const requestedTenantId = getTenantFromRequest(request);
		const { authHeader, tenantId } = await resolveFineractRequestContext({
			tenantId: requestedTenantId,
		});
		const { loanId } = await params;
		const loanIdNum = parseInt(loanId, 10);

		if (isNaN(loanIdNum)) {
			return invalidRequestResponse("Invalid loan ID");
		}

		// Parse the multipart form data
		const formData = await request.formData();
		const file = formData.get("file") as File | null;
		const name = formData.get("name") as string | null;
		const description = formData.get("description") as string | null;

		if (!file) {
			return invalidRequestResponse("File is required");
		}

		if (!name) {
			return invalidRequestResponse("Document name is required");
		}

		// Create FormData for Fineract API
		const fineractFormData = new FormData();
		fineractFormData.append("file", file);
		fineractFormData.append("name", name);
		if (description) {
			fineractFormData.append("description", description);
		}

		// Make request to Fineract
		const FINERACT_BASE_URL =
			process.env.FINERACT_BASE_URL ||
			"https://demo.fineract.dev/fineract-provider/api";
		const path = FINERACT_ENDPOINTS.loanDocuments(loanIdNum);
		const url = `${FINERACT_BASE_URL}${path}`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: authHeader,
				"fineract-platform-tenantid": tenantId,
			},
			body: fineractFormData,
		});

		const data = await response.json();

		if (!response.ok) {
			const mappedError = normalizeApiError({
				status: response.status,
				data,
				headers: response.headers,
				message: response.statusText,
			});
			return NextResponse.json(mappedError, {
				status: mappedError.httpStatus || 500,
			});
		}

		return NextResponse.json(data, { status: 201 });
	} catch (error) {
		const mappedError = normalizeApiError(error);
		return NextResponse.json(mappedError, {
			status: mappedError.httpStatus || 500,
		});
	}
}
