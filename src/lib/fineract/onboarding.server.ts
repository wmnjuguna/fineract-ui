import "server-only";

import { getFineractDateConfig } from "@/lib/date-utils";
import { fineractFetch } from "@/lib/fineract/client.server";
import { FINERACT_ENDPOINTS } from "@/lib/fineract/endpoints";
import type {
	CreateStaffResponse,
	PostUsersRequest,
	PostUsersResponse,
	StaffRequest,
} from "@/lib/fineract/generated/types.gen";

export type OnboardStaffAndUserInput = {
	staff: StaffRequest;
	user: PostUsersRequest;
	tenantId?: string;
};

export type OnboardStaffAndUserResult = {
	staffId: number;
	userId?: number;
	staffResponse: CreateStaffResponse;
	userResponse?: PostUsersResponse;
};

export async function onboardStaffAndUser({
	staff,
	user,
	tenantId,
}: OnboardStaffAndUserInput): Promise<OnboardStaffAndUserResult> {
	const staffPayload: StaffRequest = {
		...staff,
		...getFineractDateConfig(),
	};

	const staffResponse = await fineractFetch<CreateStaffResponse>(
		FINERACT_ENDPOINTS.staff,
		{
			method: "POST",
			body: staffPayload,
			tenantId,
		},
	);

	const staffId = staffResponse?.resourceId;
	if (!staffId) {
		throw new Error("Staff creation did not return a resourceId");
	}

	if (!user.email) {
		throw new Error("User email is required to align username with Keycloak");
	}

	const userPayload: PostUsersRequest = {
		...user,
		staffId,
		username: user.email,
		email: user.email,
	};

	try {
		const userResponse = await fineractFetch<PostUsersResponse>(
			FINERACT_ENDPOINTS.users,
			{
				method: "POST",
				body: userPayload,
				tenantId,
			},
		);

		return {
			staffId,
			userId: userResponse?.resourceId,
			staffResponse,
			userResponse,
		};
	} catch (error) {
		const onboardingError: Error & {
			cause?: unknown;
			orphanedStaffId?: number;
		} = new Error("Failed to create user after staff creation");
		onboardingError.cause = error;
		onboardingError.orphanedStaffId = staffId;
		throw onboardingError;
	}
}
