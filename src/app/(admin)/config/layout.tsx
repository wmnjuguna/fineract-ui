import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { ConfigPageLoadingSkeleton } from "@/components/config/config-page-loading-skeleton";
import { Sidebar } from "@/components/config/sidebar";
import { TenantSwitcher } from "@/components/config/tenant-switcher";
import { TopBar } from "@/components/config/topbar";
import {
	AUTHENTICATED_HOME,
	hasValidOidcSession,
	SIGN_IN_PATH,
} from "@/lib/auth/routes";

export default async function ConfigLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth();

	if (!hasValidOidcSession(session)) {
		redirect(
			`${SIGN_IN_PATH}?callbackUrl=${encodeURIComponent(AUTHENTICATED_HOME)}`,
		);
	}

	return (
		<div className="flex h-screen">
			{/* Sidebar */}
			<aside className="w-72 border-r border-sidebar-border bg-sidebar flex flex-col">
				<TenantSwitcher />
				<div className="flex-1 overflow-y-auto">
					<Sidebar />
				</div>
			</aside>

			{/* Main content */}
			<main className="flex-1 overflow-y-auto">
				<TopBar />
				<div className="container mx-auto px-4 py-4">
					<Suspense fallback={<ConfigPageLoadingSkeleton />}>
						{children}
					</Suspense>
				</div>
			</main>
		</div>
	);
}
