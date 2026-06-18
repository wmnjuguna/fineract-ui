"use client";

import { LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

export function UserMenu() {
	const { data: session, status } = useSession();
	const isAuthenticated = status === "authenticated";
	const displayName =
		session?.user?.name || session?.username || session?.user?.email || "User";
	const displayEmail = session?.user?.email || session?.username || "No email";
	const providerLabel =
		session?.provider === "keycloak" ? "Keycloak SSO" : "OIDC session";
	const tenantLabel = session?.tenantId || "default";

	if (status === "loading") {
		return (
			<div className="flex items-center gap-2">
				<Skeleton className="h-8 w-8 rounded-full" />
				<Skeleton className="hidden h-4 w-28 md:block" />
			</div>
		);
	}

	if (!isAuthenticated) {
		return (
			<Button asChild size="sm">
				<Link href="/auth/signin">Sign In</Link>
			</Button>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="flex items-center gap-2">
					<div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
						<User className="h-4 w-4" />
					</div>
					<span className="hidden md:inline-block">{displayName}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel>
					<div className="flex flex-col space-y-1">
						<p className="text-sm font-medium">{displayName}</p>
						<p className="text-xs text-muted-foreground">{displayEmail}</p>
						<p className="text-xs text-muted-foreground">
							{providerLabel} - Tenant {tenantLabel}
						</p>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link
						href="/config/profile"
						className="flex items-center cursor-pointer"
					>
						<Settings className="mr-2 h-4 w-4" />
						Profile Settings
					</Link>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link
						href="/auth/signout"
						className="flex items-center cursor-pointer text-destructive"
					>
						<LogOut className="mr-2 h-4 w-4" />
						Sign Out
					</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
