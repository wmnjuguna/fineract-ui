import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
	interface Session {
		accessToken?: string;
		idToken?: string;
		refreshToken?: string;
		expiresAt?: number;
		provider?: string;
		issuer?: string;
		username?: string;
		tenantId?: string;
		authError?: string;
		user: {
			roles?: string[];
		} & DefaultSession["user"];
	}

	interface User {
		roles?: string[];
		username?: string;
		tenantId?: string;
	}
}

declare module "next-auth/jwt" {
	interface JWT extends DefaultJWT {
		accessToken?: string;
		idToken?: string;
		refreshToken?: string;
		expiresAt?: number;
		roles?: string[];
		provider?: string;
		issuer?: string;
		username?: string;
		tenantId?: string;
		authError?: string;
	}
}
