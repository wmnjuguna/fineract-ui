import { NextRequest, NextResponse } from "next/server";
import { invalidRequestResponse } from "@/lib/fineract/api-error-response";
import {
	fineractFetchResponse,
	getTenantFromRequest,
} from "@/lib/fineract/client.server";
import { FINERACT_ENDPOINTS } from "@/lib/fineract/endpoints";
import { normalizeApiError } from "@/lib/fineract/ui-api-error";

/**
 * GET /api/fineract/loans/[loanId]/documents/[documentId]/attachment
 * Downloads the actual document file
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ loanId: string; documentId: string }> },
) {
	try {
		const tenantId = getTenantFromRequest(request);
		const { loanId, documentId } = await params;
		const loanIdNum = parseInt(loanId, 10);
		const documentIdNum = parseInt(documentId, 10);

		if (isNaN(loanIdNum) || isNaN(documentIdNum)) {
			return invalidRequestResponse("Invalid loan ID or document ID");
		}

		const path = `${FINERACT_ENDPOINTS.loanDocuments(loanIdNum)}/${documentIdNum}/attachment`;

		const response = await fineractFetchResponse(path, {
			method: "GET",
			tenantId,
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			const mappedError = normalizeApiError({
				status: response.status,
				data: errorData,
				headers: response.headers,
				message: response.statusText,
			});
			return NextResponse.json(mappedError, {
				status: mappedError.httpStatus || 500,
			});
		}

		// Get content type and disposition from original response
		const contentType =
			response.headers.get("content-type") || "application/octet-stream";
		const contentDisposition = response.headers.get("content-disposition");

		// Stream the file back
		const blob = await response.blob();

		const headers: HeadersInit = {
			"Content-Type": contentType,
		};

		if (contentDisposition) {
			headers["Content-Disposition"] = contentDisposition;
		}

		return new NextResponse(blob, { headers });
	} catch (error) {
		const mappedError = normalizeApiError(error);
		return NextResponse.json(mappedError, {
			status: mappedError.httpStatus || 500,
		});
	}
}
