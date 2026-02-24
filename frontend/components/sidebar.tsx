"use client";

import { clsx } from "clsx";
import {
	Activity,
	Bot,
	ChevronsLeft,
	ChevronsRight,
	FileText,
	FlaskConical,
	GitCompare,
	GraduationCap,
	LayoutDashboard,
	Menu,
	Settings,
	TestTubes,
	X,
	Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useSidebar } from "./sidebar-context";
import { ThemeToggle } from "./theme-toggle";
import { PreloadLink } from "./ui/preload-link";

interface NavItem {
	name: string;
	href: string;
	icon: LucideIcon;
}

interface NavGroup {
	label: string;
	items: NavItem[];
}

const navGroups: NavGroup[] = [
	{
		label: "Monitor",
		items: [
			{ name: "Command Center", href: "/", icon: LayoutDashboard },
			{ name: "Agents", href: "/agents", icon: Bot },
			{ name: "Traces", href: "/traces", icon: Activity },
		],
	},
	{
		label: "Evaluate",
		items: [
			{ name: "Suites", href: "/suites", icon: FlaskConical },
			{ name: "Eval Runs", href: "/eval-runs", icon: Zap },
			{ name: "Compare", href: "/compare", icon: GitCompare },
		],
	},
	{
		label: "Improve",
		items: [
			{ name: "Experiments", href: "/experiments", icon: TestTubes },
			{ name: "Prompts", href: "/prompts", icon: FileText },
			{ name: "Training", href: "/training", icon: GraduationCap },
		],
	},
];

/** Mobile hamburger button -- rendered outside the sidebar in the top bar area */
export function MobileMenuButton() {
	const { openMobile } = useSidebar();

	return (
		<button
			type="button"
			onClick={openMobile}
			className="md:hidden fixed top-3 left-3 z-40 w-10 h-10 rounded-lg bg-surface-card border border-border flex items-center justify-center hover:bg-surface-raised transition-colors"
			aria-label="Open navigation menu"
		>
			<Menu className="w-5 h-5 text-content-secondary" />
		</button>
	);
}

/** The sidebar navigation panel */
function SidebarPanel({ isOverlay }: { isOverlay?: boolean }) {
	const pathname = usePathname();
	const { collapsed, toggleCollapsed, closeMobile } = useSidebar();

	// In overlay (mobile) mode, always show expanded
	const isCollapsed = isOverlay ? false : collapsed;

	return (
		<div
			className={clsx(
				"h-screen flex flex-col bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)] transition-[width] duration-200 ease-in-out",
				isOverlay ? "w-64" : isCollapsed ? "w-16" : "w-64",
			)}
		>
			{/* Logo Section */}
			<div className={clsx("p-6", isCollapsed && "px-3 py-6")}>
				<Link
					href="/"
					className="flex items-center gap-3 group"
					onClick={isOverlay ? closeMobile : undefined}
				>
					<div className="relative flex-shrink-0">
						<div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400 to-accent-500 flex items-center justify-center shadow-neon group-hover:shadow-neon-lg transition-shadow">
							<Zap className="w-5 h-5 text-white" />
						</div>
					</div>
					<div
						className={clsx(
							"overflow-hidden transition-[opacity,width] duration-200",
							isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100",
						)}
					>
						<h1 className="text-xl font-bold text-neon-glow tracking-tight whitespace-nowrap">
							Neon
						</h1>
						<p className="text-[10px] text-content-muted font-medium tracking-wider uppercase whitespace-nowrap">
							Agent Evaluation
						</p>
					</div>
				</Link>
			</div>

			{/* Navigation */}
			<nav className={clsx("flex-1 overflow-y-auto", isCollapsed ? "px-1" : "px-3")}>
				{navGroups.map((group, groupIndex) => (
					<div key={group.label}>
						<div
							className={clsx(
								"text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-1 transition-[opacity,height] duration-200",
								groupIndex === 0 ? "mt-0" : "mt-6",
								isCollapsed
									? "h-0 opacity-0 overflow-hidden mb-0"
									: "px-4 py-2",
							)}
						>
							{group.label}
						</div>
						{isCollapsed && groupIndex > 0 && (
							<div className="border-t border-[var(--sidebar-border)] mx-2 my-2" />
						)}
						<div className="space-y-0.5">
							{group.items.map((item) => {
								const isActive =
									item.href === "/"
										? pathname === "/"
										: pathname.startsWith(item.href);

								return (
									<PreloadLink
										key={item.name}
										href={item.href}
										preloadDelay={50}
										onClick={isOverlay ? closeMobile : undefined}
										className={clsx(
											"nav-item",
											isActive ? "nav-item-active" : "nav-item-inactive",
											isCollapsed && "justify-center px-2",
										)}
										title={isCollapsed ? item.name : undefined}
									>
										<item.icon
											className={clsx(
												"w-5 h-5 flex-shrink-0 transition-colors",
												isCollapsed ? "mr-0" : "mr-3",
												isActive
													? "text-primary-500 dark:text-primary-400"
													: "text-content-muted",
											)}
										/>
										<span
											className={clsx(
												"overflow-hidden transition-[opacity,width] duration-200 whitespace-nowrap",
												isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100",
											)}
										>
											{item.name}
										</span>
									</PreloadLink>
								);
							})}
						</div>
					</div>
				))}

				{/* Divider + Settings */}
				<div className="border-t border-[var(--sidebar-border)] my-2" />
				{(() => {
					const isSettingsActive = pathname.startsWith("/settings");
					return (
						<PreloadLink
							href="/settings"
							preloadDelay={50}
							onClick={isOverlay ? closeMobile : undefined}
							className={clsx(
								"nav-item",
								isSettingsActive ? "nav-item-active" : "nav-item-inactive",
								isCollapsed && "justify-center px-2",
							)}
							title={isCollapsed ? "Settings" : undefined}
						>
							<Settings
								className={clsx(
									"w-5 h-5 flex-shrink-0 transition-colors",
									isCollapsed ? "mr-0" : "mr-3",
									isSettingsActive
										? "text-primary-500 dark:text-primary-400"
										: "text-content-muted",
								)}
							/>
							<span
								className={clsx(
									"overflow-hidden transition-[opacity,width] duration-200 whitespace-nowrap",
									isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100",
								)}
							>
								Settings
							</span>
						</PreloadLink>
					);
				})()}
			</nav>

			{/* Collapse toggle + Footer */}
			<div className="border-t border-[var(--sidebar-border)]">
				{/* Collapse/expand button -- hidden on mobile overlay */}
				{!isOverlay && (
					<button
						type="button"
						onClick={toggleCollapsed}
						className="hidden md:flex w-full items-center gap-2 px-4 py-2 text-xs text-content-muted hover:text-content-secondary hover:bg-surface-raised transition-colors"
						title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
					>
						{isCollapsed ? (
							<ChevronsRight className="w-4 h-4 mx-auto" />
						) : (
							<>
								<ChevronsLeft className="w-4 h-4" />
								<span>Collapse</span>
							</>
						)}
					</button>
				)}

				<div
					className={clsx(
						"p-4 flex items-center",
						isCollapsed ? "justify-center" : "justify-between",
					)}
				>
					{!isCollapsed && (
						<span className="text-xs text-content-muted">v0.2.0</span>
					)}
					<ThemeToggle />
				</div>
			</div>
		</div>
	);
}

/** Mobile overlay backdrop + sidebar drawer */
function MobileOverlay() {
	const { mobileOpen, closeMobile } = useSidebar();
	const pathname = usePathname();
	const prevPathnameRef = useRef(pathname);

	// Close on route change
	useEffect(() => {
		if (pathname !== prevPathnameRef.current) {
			closeMobile();
			prevPathnameRef.current = pathname;
		}
	}, [pathname, closeMobile]);

	// Prevent body scroll when open
	useEffect(() => {
		if (mobileOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [mobileOpen]);

	return (
		<>
			{/* Backdrop */}
			{mobileOpen && (
				<div
					className="md:hidden fixed inset-0 z-40 bg-black/50 transition-opacity"
					onClick={closeMobile}
					onKeyDown={(e: React.KeyboardEvent) => {
						if (e.key === "Escape") closeMobile();
					}}
				/>
			)}

			{/* Sliding panel */}
			<div
				className={clsx(
					"md:hidden fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out",
					mobileOpen ? "translate-x-0" : "-translate-x-full",
				)}
			>
				{/* Close button */}
				{mobileOpen && (
					<button
						type="button"
						onClick={closeMobile}
						className="absolute top-3 right-0 translate-x-full z-50 w-10 h-10 rounded-r-lg bg-surface-card border border-l-0 border-border flex items-center justify-center hover:bg-surface-raised transition-colors"
						aria-label="Close navigation menu"
					>
						<X className="w-5 h-5 text-content-secondary" />
					</button>
				)}
				<SidebarPanel isOverlay />
			</div>
		</>
	);
}

/** Main sidebar export: renders desktop sidebar + mobile overlay */
export function Sidebar() {
	return (
		<>
			{/* Desktop / tablet sidebar -- hidden on mobile */}
			<div className="hidden md:block flex-shrink-0">
				<SidebarPanel />
			</div>

			{/* Mobile overlay */}
			<MobileOverlay />
		</>
	);
}
