"use client";

import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

const STORAGE_KEY = "neon-sidebar-collapsed";

interface SidebarContextValue {
	/** Whether the sidebar is collapsed (icon-only mode) */
	collapsed: boolean;
	/** Toggle collapsed state */
	toggleCollapsed: () => void;
	/** Whether the mobile overlay is open */
	mobileOpen: boolean;
	/** Open the mobile sidebar overlay */
	openMobile: () => void;
	/** Close the mobile sidebar overlay */
	closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
	const [collapsed, setCollapsed] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);

	// Hydrate collapsed state from localStorage
	useEffect(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored === "true") {
				setCollapsed(true);
			}
		} catch {
			// localStorage not available
		}
	}, []);

	const toggleCollapsed = useCallback(() => {
		setCollapsed((prev: boolean) => {
			const next = !prev;
			try {
				localStorage.setItem(STORAGE_KEY, String(next));
			} catch {
				// localStorage not available
			}
			return next;
		});
	}, []);

	const openMobile = useCallback(() => setMobileOpen(true), []);
	const closeMobile = useCallback(() => setMobileOpen(false), []);

	// Close mobile sidebar on route change (pathname will change)
	// This is handled by the Sidebar component listening to pathname

	return (
		<SidebarContext.Provider
			value={{ collapsed, toggleCollapsed, mobileOpen, openMobile, closeMobile }}
		>
			{children}
		</SidebarContext.Provider>
	);
}

export function useSidebar(): SidebarContextValue {
	const ctx = useContext(SidebarContext);
	if (!ctx) {
		throw new Error("useSidebar must be used within a SidebarProvider");
	}
	return ctx;
}
