"use client";

import { KeyRound, LogIn } from "lucide-react";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AuthMethodTabsProps = {
	ssoForm: ReactNode;
	credentialsForm: ReactNode;
};

export function AuthMethodTabs({
	ssoForm,
	credentialsForm,
}: AuthMethodTabsProps) {
	return (
		<Tabs defaultValue="sso" className="w-full">
			<TabsList className="grid w-full grid-cols-2">
				<TabsTrigger value="sso">
					<KeyRound className="h-4 w-4" />
					Single sign-on
				</TabsTrigger>
				<TabsTrigger value="credentials">
					<LogIn className="h-4 w-4" />
					Credentials
				</TabsTrigger>
			</TabsList>
			<TabsContent value="sso" className="pt-4">
				{ssoForm}
			</TabsContent>
			<TabsContent value="credentials" className="pt-4">
				{credentialsForm}
			</TabsContent>
		</Tabs>
	);
}
