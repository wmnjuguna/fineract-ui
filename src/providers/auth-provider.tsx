"use client";

import { usePathname } from "next/navigation";
import type { Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { useTenantStore } from "@/store/tenant";

interface AuthProviderProps {
	children: React.ReactNode;
	session?: Session | null;
}

function SessionSync() {
	const pathname = usePathname();
	const { update } = useSession();
	const lastSyncedPath = useRef<string | null>(null);

	useEffect(() => {
		if (!pathname || lastSyncedPath.current === pathname) {
			return;
		}

		lastSyncedPath.current = pathname;
		void update();
	}, [pathname, update]);

	return null;
}

/**
 * Keeps the tenant store aligned with the authenticated session.
 * The session tenant is the source of truth (the server resolves it
 * independently); the store only feeds display and legacy headers.
 */
function TenantSync() {
	const { data: session, status } = useSession();
	const { tenantId, setTenantId } = useTenantStore();

	useEffect(() => {
		if (status === "loading") {
			return;
		}

		const sessionTenantId =
			status === "authenticated" ? session?.tenantId || "default" : "default";

		if (sessionTenantId !== tenantId) {
			setTenantId(sessionTenantId);
		}
	}, [status, session?.tenantId, tenantId, setTenantId]);

	return null;
}

export function AuthProvider({ children, session = null }: AuthProviderProps) {
	return (
		<SessionProvider refetchOnWindowFocus session={session}>
			<SessionSync />
			<TenantSync />
			{children}
		</SessionProvider>
	);
}
