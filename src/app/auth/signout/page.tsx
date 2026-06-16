import { X } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	buildKeycloakLogoutUrl,
	clearKeycloakTenantHintCookie,
	getRequestOrigin,
} from "@/lib/auth/keycloak";

export default function SignOutPage() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="space-y-1">
					<CardTitle className="text-2xl font-bold">Sign Out</CardTitle>
					<CardDescription>Are you sure you want to sign out?</CardDescription>
				</CardHeader>
				<CardContent>
					<form
						action={async () => {
							"use server";
							const session = await auth();
							const postLogoutRedirectUri = await getRequestOrigin();

							await clearKeycloakTenantHintCookie();
							await signOut({ redirect: false, redirectTo: "/" });

							if (session?.provider === "keycloak") {
								const keycloakLogoutUrl = buildKeycloakLogoutUrl({
									idToken: session.idToken,
									issuer: session.issuer,
									postLogoutRedirectUri,
								});

								if (keycloakLogoutUrl) {
									redirect(keycloakLogoutUrl);
								}
							}

							redirect("/");
						}}
						className="space-y-4"
					>
						<Button
							type="submit"
							variant="destructive"
							className="w-full"
							size="lg"
						>
							Sign out
						</Button>
						<Button type="button" variant="outline" className="w-full" asChild>
							<Link href="/config">
								<X className="w-4 h-4 mr-2" />
								Cancel
							</Link>
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
