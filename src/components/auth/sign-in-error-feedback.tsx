"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type SignInErrorFeedbackProps = {
	errorCode?: string;
};

const AUTH_ERROR_MESSAGES: Record<
	string,
	{ title: string; description: string }
> = {
	AccessDenied: {
		title: "Access denied",
		description: "You do not have permission to sign in.",
	},
	InvalidTenant: {
		title: "Invalid tenant ID",
		description:
			"Use a tenant ID with letters, numbers, dots, underscores, or hyphens.",
	},
	KeycloakUnavailable: {
		title: "Keycloak sign-in unavailable",
		description: "Keycloak sign-in is not configured for this environment.",
	},
	Default: {
		title: "Authentication failed",
		description: "We couldn't sign you in. Please try again.",
	},
};

export function SignInErrorFeedback({ errorCode }: SignInErrorFeedbackProps) {
	const hasShownToast = useRef(false);
	const message =
		errorCode && AUTH_ERROR_MESSAGES[errorCode]
			? AUTH_ERROR_MESSAGES[errorCode]
			: AUTH_ERROR_MESSAGES.Default;

	useEffect(() => {
		if (!errorCode) {
			return;
		}

		if (hasShownToast.current) {
			return;
		}

		toast.error(message.title, {
			description: message.description,
		});
		hasShownToast.current = true;
	}, [errorCode, message.description, message.title]);

	if (!errorCode) {
		return null;
	}

	return (
		<Alert variant="destructive">
			<AlertTitle>{message.title}</AlertTitle>
			<AlertDescription>{message.description}</AlertDescription>
		</Alert>
	);
}
