import { KeyRound, LineChart, Mail } from "lucide-react";
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
	clearSignInChoice,
	rememberSignInChoice,
	resolveHomeRealms,
} from "@/lib/auth/home-realm";
import {
	getAuthLoginSettings,
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

	// The realm the token is minted in still comes from the issuer, unforgeable; the tenant hint only selects
	// which realm's sign-in to open, and `login_hint` carries the email on so it is not typed twice.
	async function startSignIn(email: string, realm: string) {
		await setKeycloakTenantHintCookie(realm);
		await clearSignInChoice();

		try {
			await signIn(
				"keycloak",
				{ redirectTo: callbackUrl },
				{ login_hint: email },
			);
		} catch (error) {
			if (error instanceof AuthError) {
				redirect(getSignInErrorRedirectUrl("SignIn", callbackUrl));
			}

			throw error;
		}
	}

	const keycloakForm = (
		<form
			action={async (formData: FormData) => {
				"use server";

				const raw = formData.get("email");
				const email = typeof raw === "string" ? raw.trim() : "";

				// Blank is refused rather than defaulted. An empty box is not an identity,
				// so refusing it tells a caller nothing about which accounts exist.
				if (!email) {
					redirect(getSignInErrorRedirectUrl("MissingEmail", callbackUrl));
				}

				if (!getAuthLoginSettings().keycloakConfigured) {
					redirect(
						getSignInErrorRedirectUrl("KeycloakUnavailable", callbackUrl),
					);
				}

				let realms: string[] = [];
				try {
					realms = await resolveHomeRealms(email);
				} catch {
					// Discovery could not answer. One failure, same as any other (SEC-10).
					redirect(getSignInErrorRedirectUrl("SignIn", callbackUrl));
				}

				// Never happens once a decoy realm is provisioned; refused the one way if it does.
				if (realms.length === 0) {
					redirect(getSignInErrorRedirectUrl("SignIn", callbackUrl));
				}

				if (realms.length > 1) {
					await rememberSignInChoice({ email, realms });
					redirect(
						`/auth/signin/choose?${new URLSearchParams({ callbackUrl })}`,
					);
				}

				await startSignIn(email, realms[0]);
			}}
			className="space-y-4"
		>
			<div className="space-y-2">
				<Label htmlFor="email" className="text-sm font-medium">
					Work email address
				</Label>
				<div className="relative">
					<Input
						id="email"
						name="email"
						type="email"
						autoCapitalize="none"
						autoComplete="username"
						autoCorrect="off"
						spellCheck={false}
						placeholder="you@organisation.com"
						required
						className="pl-8"
					/>
					<Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
				</div>
				<p className="text-xs text-muted-foreground">
					Enter your work email. We take you to your organisation&apos;s secure
					sign-in — no tenant ID to remember.
				</p>
			</div>

			<Button type="submit" className="w-full" size="lg">
				<KeyRound className="mr-2 h-4 w-4" />
				Continue
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
