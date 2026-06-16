import {
	Building2,
	KeyRound,
	LineChart,
	Lock,
	LogIn,
	User,
} from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { SignInErrorFeedback } from "@/components/auth/sign-in-error-feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
	getAuthLoginSettings,
	normalizeTenantId,
	setKeycloakTenantHintCookie,
} from "@/lib/auth/keycloak";

function getSignInErrorRedirectUrl(error: string, callbackUrl: string) {
	const params = new URLSearchParams({
		error,
		callbackUrl,
	});

	return `/auth/signin?${params.toString()}`;
}

function getSubmittedTenantId(value: FormDataEntryValue | null): string | null {
	return typeof value === "string" ? normalizeTenantId(value) : null;
}

export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
	const resolvedSearchParams = await searchParams;
	const callbackUrl = resolvedSearchParams?.callbackUrl || "/config";
	const loginSettings = getAuthLoginSettings();
	const showSeparator =
		loginSettings.keycloakEnabled && loginSettings.credentialsEnabled;

	return (
		<div className="flex min-h-dvh overflow-hidden">
			<div className="flex w-full flex-col justify-center overflow-y-auto px-6 py-8 lg:w-1/2 lg:px-8">
				<div className="mx-auto w-full max-w-md space-y-6">
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<div className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary">
								<LineChart className="h-6 w-6 text-primary-foreground" />
							</div>
							<h1 className="text-2xl font-bold text-foreground">
								Taalam FinCore
							</h1>
						</div>
						<h2 className="text-3xl font-bold text-foreground">
							Sign Into Your Account
						</h2>
					</div>

					<SignInErrorFeedback errorCode={resolvedSearchParams?.error} />

					{loginSettings.keycloakRequired &&
						!loginSettings.keycloakConfigured && (
							<Alert variant="destructive">
								<AlertTitle>Keycloak sign-in unavailable</AlertTitle>
								<AlertDescription>
									Keycloak sign-in is required but no Keycloak issuer is
									configured.
								</AlertDescription>
							</Alert>
						)}

					{loginSettings.keycloakEnabled && (
						<form
							action={async (formData: FormData) => {
								"use server";

								const tenantId = getSubmittedTenantId(formData.get("tenantId"));
								if (!tenantId) {
									redirect(
										getSignInErrorRedirectUrl("InvalidTenant", callbackUrl),
									);
								}

								if (!getAuthLoginSettings().keycloakEnabled) {
									redirect(
										getSignInErrorRedirectUrl(
											"KeycloakUnavailable",
											callbackUrl,
										),
									);
								}

								try {
									await setKeycloakTenantHintCookie(tenantId);
									await signIn("keycloak", {
										redirectTo: callbackUrl,
									});
								} catch (error) {
									if (error instanceof AuthError) {
										redirect(
											getSignInErrorRedirectUrl(error.type, callbackUrl),
										);
									}

									throw error;
								}
							}}
							className="space-y-4"
						>
							<div className="space-y-2">
								<Label
									htmlFor="keycloakTenantId"
									className="text-sm font-medium"
								>
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
								Sign in with Keycloak
							</Button>
						</form>
					)}

					{showSeparator && (
						<div className="relative">
							<div className="absolute inset-0 flex items-center">
								<Separator />
							</div>
							<div className="relative flex justify-center text-xs uppercase">
								<span className="bg-background px-2 text-muted-foreground">
									Or continue with credentials
								</span>
							</div>
						</div>
					)}

					{loginSettings.credentialsEnabled && (
						<form
							action={async (formData: FormData) => {
								"use server";

								const tenantValue = formData.get("tenantId");
								const tenantId =
									typeof tenantValue === "string" && tenantValue.trim()
										? normalizeTenantId(tenantValue)
										: getAuthLoginSettings().defaultTenantId;

								if (!tenantId) {
									redirect(
										getSignInErrorRedirectUrl("InvalidTenant", callbackUrl),
									);
								}

								const username = formData.get("username");
								const password = formData.get("password");

								try {
									await signIn("credentials", {
										username,
										password,
										tenantId,
										redirectTo: callbackUrl,
									});
								} catch (error) {
									if (error instanceof AuthError) {
										redirect(
											getSignInErrorRedirectUrl(error.type, callbackUrl),
										);
									}

									throw error;
								}
							}}
							className="space-y-6"
						>
							<div className="space-y-4">
								<div className="space-y-2">
									<Label htmlFor="username" className="text-sm font-medium">
										Username
									</Label>
									<div className="relative">
										<Input
											id="username"
											name="username"
											type="text"
											placeholder="Enter your username"
											required
											className="pl-8"
										/>
										<User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
									</div>
								</div>

								<div className="space-y-2">
									<Label htmlFor="password" className="text-sm font-medium">
										Password
									</Label>
									<div className="relative">
										<Input
											id="password"
											name="password"
											type="password"
											placeholder="Enter your password"
											required
											className="pl-8"
										/>
										<Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
									</div>
								</div>

								<div className="space-y-2">
									<Label
										htmlFor="credentialsTenantId"
										className="text-sm font-medium"
									>
										Tenant ID
									</Label>
									<div className="relative">
										<Input
											id="credentialsTenantId"
											name="tenantId"
											type="text"
											placeholder={loginSettings.defaultTenantId}
											defaultValue={loginSettings.defaultTenantId}
											className="pl-8"
										/>
										<Building2 className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
									</div>
								</div>
							</div>

							<Button type="submit" className="w-full" size="lg">
								<LogIn className="mr-2 h-4 w-4" />
								Sign in with Credentials
							</Button>
						</form>
					)}

					<div className="text-center text-sm text-muted-foreground">
						Authorized access only.
					</div>
				</div>
			</div>

			<div className="relative hidden bg-primary lg:block lg:w-1/2">
				<Image
					src="/login-illustration.svg"
					alt="Taalam FinCore - Financial Management"
					fill
					className="object-cover"
					sizes="(min-width: 1024px) 50vw, 100vw"
					priority
				/>
			</div>
		</div>
	);
}
