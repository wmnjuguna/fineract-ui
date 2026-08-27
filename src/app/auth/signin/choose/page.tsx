import { Building2, KeyRound, LineChart } from "lucide-react";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle-client";
import { clearSignInChoice, readSignInChoice } from "@/lib/auth/home-realm";
import { setKeycloakTenantHintCookie } from "@/lib/auth/keycloak";
import {
	AUTHENTICATED_HOME,
	hasValidOidcSession,
	normalizeCallbackPath,
} from "@/lib/auth/routes";

function signInErrorUrl(callbackUrl: string) {
	return `/auth/signin?${new URLSearchParams({ error: "SignIn", callbackUrl })}`;
}

/**
 * The organisation chooser, on its own centred page. A person whose work email reaches more than one
 * organisation lands here after the email step; the pending choice — the email and the realms it resolved to —
 * is carried in an httpOnly cookie, so this page reveals nothing the caller's own identity did not already
 * prove. With no pending choice it falls back to the email step, never a dead end.
 */
export default async function ChooseOrganisationPage({
	searchParams,
}: {
	searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
	const session = await auth();
	const resolvedSearchParams = await searchParams;
	const callbackUrl = normalizeCallbackPath(
		resolvedSearchParams?.callbackUrl,
		AUTHENTICATED_HOME,
	);

	if (hasValidOidcSession(session)) {
		redirect(callbackUrl);
	}

	const choice = await readSignInChoice();
	if (!choice) {
		redirect(`/auth/signin?${new URLSearchParams({ callbackUrl })}`);
	}

	async function chooseAction(formData: FormData) {
		"use server";

		const pending = await readSignInChoice();
		const value = formData.get("realm");
		const realm = typeof value === "string" ? value : "";

		// A tampered or expired choice is answered like any other failure: the realm
		// must be one the person's own identity already resolved to.
		if (!pending || !pending.realms.includes(realm)) {
			redirect(signInErrorUrl(callbackUrl));
		}

		await setKeycloakTenantHintCookie(realm);
		await clearSignInChoice();

		try {
			await signIn(
				"keycloak",
				{ redirectTo: callbackUrl },
				{ login_hint: pending.email },
			);
		} catch (error) {
			if (error instanceof AuthError) {
				redirect(signInErrorUrl(callbackUrl));
			}

			throw error;
		}
	}

	return (
		<div className="relative grid min-h-dvh place-items-center px-6 py-10">
			<div className="absolute right-6 top-6 lg:right-8 lg:top-8">
				<ThemeToggle />
			</div>

			<div className="flex w-full max-w-md flex-col items-center gap-6">
				<div className="flex flex-col items-center gap-2 text-center">
					<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
						<LineChart className="h-6 w-6 text-primary-foreground" />
					</div>
					<span className="text-xl font-bold tracking-tight text-foreground">
						Taalam FinCore
					</span>
				</div>

				<div className="w-full space-y-6 rounded-xl border bg-card p-6 shadow-sm">
					<div className="space-y-1 text-center">
						<h1 className="text-2xl font-bold tracking-tight text-foreground">
							Choose your organisation
						</h1>
						<p className="text-sm text-muted-foreground">
							{choice.email} reaches more than one organisation. Choose where to
							sign in — you can switch by signing out and back in.
						</p>
					</div>

					<form action={chooseAction} className="space-y-4">
						<fieldset className="space-y-2">
							{choice.realms.map((realm, index) => (
								<label
									className="flex items-center gap-3 rounded-md border border-input bg-background p-3 text-sm font-medium transition focus-within:border-ring focus-within:ring-2 focus-within:ring-ring hover:bg-accent/40"
									key={realm}
								>
									<input
										className="h-4 w-4"
										defaultChecked={index === 0}
										name="realm"
										required
										type="radio"
										value={realm}
									/>
									<Building2 className="h-4 w-4 text-primary" />
									<span>{realm}</span>
								</label>
							))}
						</fieldset>

						<Button type="submit" className="w-full" size="lg">
							<KeyRound className="mr-2 h-4 w-4" />
							Continue
						</Button>

						<a
							className="block text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
							href="/auth/signin"
						>
							Use a different email
						</a>
					</form>
				</div>

				<div className="text-center text-xs text-muted-foreground">
					Authorized access only. Activity may be monitored.
				</div>
			</div>
		</div>
	);
}
