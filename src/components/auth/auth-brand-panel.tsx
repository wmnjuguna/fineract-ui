import { Building2, KeyRound, LineChart, ShieldCheck } from "lucide-react";

const HIGHLIGHTS = [
	{
		icon: ShieldCheck,
		title: "Bank-grade security",
		description: "Encrypted sessions with audited, role-based access control.",
	},
	{
		icon: Building2,
		title: "Multi-tenant core",
		description: "Isolated tenants on a single, scalable financial platform.",
	},
	{
		icon: KeyRound,
		title: "Flexible sign-in",
		description:
			"Single sign-on or direct credentials — your choice per tenant.",
	},
] as const;

export function AuthBrandPanel() {
	return (
		<div className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-8">
			{/* Ambient gradient + floating accents */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--brand-secondary)_55%,transparent),transparent_60%)]"
			/>
			<div
				aria-hidden
				className="animate-float pointer-events-none absolute -right-8 top-16 h-48 w-48 rounded-full bg-[var(--brand-accent)]/30 blur-3xl"
			/>
			<div
				aria-hidden
				className="animate-float pointer-events-none absolute -left-6 bottom-10 h-40 w-40 rounded-full bg-[var(--brand-secondary)]/30 blur-3xl"
				style={{ animationDelay: "1.5s" }}
			/>

			<div className="relative z-10 flex items-center gap-2">
				<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/15 ring-1 ring-primary-foreground/20">
					<LineChart className="h-6 w-6" />
				</div>
				<span className="text-xl font-bold tracking-tight">Taalam FinCore</span>
			</div>

			<div className="relative z-10 max-w-md space-y-6">
				<div className="space-y-3">
					<h2 className="text-balance text-4xl font-bold leading-tight tracking-tight">
						The modern core for banking & lending operations.
					</h2>
					<p className="text-pretty text-base text-primary-foreground/80">
						Manage offices, clients, loans, and accounting from one secure,
						multi-tenant platform built on Apache Fineract.
					</p>
				</div>

				<ul className="space-y-3">
					{HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
						<li key={title} className="flex items-start gap-3">
							<div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-foreground/15 ring-1 ring-primary-foreground/20">
								<Icon className="h-4 w-4" />
							</div>
							<div className="space-y-1">
								<p className="text-sm font-semibold">{title}</p>
								<p className="text-sm text-primary-foreground/70">
									{description}
								</p>
							</div>
						</li>
					))}
				</ul>
			</div>

			<p className="relative z-10 text-xs text-primary-foreground/60">
				© {new Date().getFullYear()} Taalam FinCore. All rights reserved.
			</p>
		</div>
	);
}
