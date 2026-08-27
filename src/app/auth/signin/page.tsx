import { Building2, KeyRound, LineChart } from "lucide-react";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { AuthBrandPanel } from "@/components/auth/auth-brand-panel";
import { SignInErrorFeedback } from "@/components/auth/sign-in-error-feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ui/theme-toggle-client";
import {
	getAuthLoginSettings,
	normalizeTenantId,
	setKeycloakTenantHintCookie,
} from "@/lib/auth/keycloak";
import {
	AUTHENTICATED_HOME,
	hasValidOidcSession,
	normalizeCallbackPath,
	REFRESH_ACCESS_TOKEN_ERROR,
} from "@/lib/auth/routes";

function getSignInErrorRedirectUrl(error: string, callbackUrl: string) {
	const params = new URLSearchParams({
		error,
		callbackUrl,
	});

	return `/auth/signin?${params.toString()}`;
}

function getFirstParam(value: string | string[] | undefined) {
	return Array.isArray(value) ? value[0] : value;
}

function getSubmittedTenantId(value: FormDataEntryValue | null): string | null {
	return typeof value === "string" ? normalizeTenantId(value) : null;
}

export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<{
		callbackUrl?: string | string[];
		error?: string | string[];
	}>;
}) {
	const session = await auth();
	const resolvedSearchParams = await searchParams;
	const callbackUrl = normalizeCallbackPath(
		resolvedSearchParams?.callbackUrl,
		AUTHENTICATED_HOME,
	);
	const errorCode = getFirstParam(resolvedSearchParams?.error);
	const loginSettings = getAuthLoginSettings();
	const hasExpiredSession = session?.authError === REFRESH_ACCESS_TOKEN_ERROR;

	if (hasValidOidcSession(session)) {
		redirect(callbackUrl);
	}

	const keycloakForm = (
		<form
			action={async (formData: FormData) => {
				"use server";

				const tenantId = getSubmittedTenantId(formData.get("tenantId"));
				if (!tenantId) {
					redirect(getSignInErrorRedirectUrl("InvalidTenant", callbackUrl));
				}

				if (!getAuthLoginSettings().keycloakConfigured) {
					redirect(
						getSignInErrorRedirectUrl("KeycloakUnavailable", callbackUrl),
					);
				}

				try {
					await setKeycloakTenantHintCookie(tenantId);
					await signIn("keycloak", {
						redirectTo: callbackUrl,
					});
				} catch (error) {
					if (error instanceof AuthError) {
						redirect(getSignInErrorRedirectUrl(error.type, callbackUrl));
					}

					throw error;
				}
			}}
			className="space-y-4"
		>
			<div className="space-y-2">
				<Label htmlFor="keycloakTenantId" className="text-sm font-medium">
					Tenant ID
				</Label>
				<div className="relative">
					<Input
						id="keycloakTenantId"
						name="tenantId"
						type="text"
						placeholder={loginSettings.defaultTenantId}
						defaultValue={loginSettings.defaultTenantId}
						required
						className="pl-8"
					/>
					<Building2 className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
				</div>
			</div>

			<Button type="submit" className="w-full" size="lg">
				<KeyRound className="mr-2 h-4 w-4" />
				Sign in with single sign-on
			</Button>
		</form>
	);

	return (
		<div className="grid min-h-dvh lg:grid-cols-2">
			<AuthBrandPanel />

			<div className="relative flex flex-col justify-center overflow-y-auto px-6 py-8 lg:px-8">
				<div className="absolute right-6 top-6 lg:right-8 lg:top-8">
					<ThemeToggle />
				</div>

				<div className="mx-auto w-full max-w-md space-y-6">
					<div className="space-y-2">
						<div className="flex items-center gap-2 lg:hidden">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
								<LineChart className="h-6 w-6 text-primary-foreground" />
							</div>
							<span className="text-xl font-bold tracking-tight text-foreground">
								Taalam FinCore
							</span>
						</div>
						<h1 className="text-3xl font-bold tracking-tight text-foreground">
							Welcome back
						</h1>
						<p className="text-sm text-muted-foreground">
							Sign in with single sign-on to continue.
						</p>
					</div>

					<SignInErrorFeedback errorCode={errorCode} />

					{hasExpiredSession && (
						<Alert variant="destructive">
							<AlertTitle>Session expired</AlertTitle>
							<AlertDescription>
								Your single sign-on session expired while refreshing access.
								Sign in again to continue.
							</AlertDescription>
						</Alert>
					)}

					{!loginSettings.keycloakConfigured && (
						<Alert variant="destructive">
							<AlertTitle>Single sign-on unavailable</AlertTitle>
							<AlertDescription>
								Single sign-on is required but no Keycloak issuer is configured.
							</AlertDescription>
						</Alert>
					)}

					{loginSettings.keycloakConfigured && keycloakForm}

					<div className="text-center text-xs text-muted-foreground">
						Authorized access only. Activity may be monitored.
					</div>
				</div>
			</div>
		</div>
	);
}
