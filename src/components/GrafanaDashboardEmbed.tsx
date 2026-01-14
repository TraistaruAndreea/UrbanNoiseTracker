import { useMemo } from "react";

function slugify(title: string): string {
	return title
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-");
}

export type GrafanaDashboardEmbedProps = {
	title: string;
	uid: string;
	panelId?: number;
	height?: number | string;
	orgId?: number;
	theme?: "light" | "dark";
	kiosk?: boolean;
	refresh?: string;
};

export default function GrafanaDashboardEmbed({
	title,
	uid,
	panelId = 1,
	height = "calc(100vh - 170px)",
	orgId = 1,
	theme = "light",
	kiosk = true,
	refresh = "30s",
}: GrafanaDashboardEmbedProps) {
	const baseUrl = (import.meta.env.VITE_GRAFANA_URL as string | undefined) ?? "http://localhost:3001";

	const dashboardHref = useMemo(() => {
		const slug = slugify(title) || "dashboard";
		const url = new URL(`${baseUrl.replace(/\/$/, "")}/d/${encodeURIComponent(uid)}/${encodeURIComponent(slug)}`);
		url.searchParams.set("orgId", String(orgId));
		url.searchParams.set("theme", theme);
		url.searchParams.set("refresh", refresh);
		if (kiosk) url.searchParams.set("kiosk", "1");
		return url.toString();
	}, [baseUrl, uid, title, orgId, theme, kiosk, refresh]);

	const iframeSrc = useMemo(() => {
		const slug = slugify(title) || "dashboard";
		const url = new URL(`${baseUrl.replace(/\/$/, "")}/d-solo/${encodeURIComponent(uid)}/${encodeURIComponent(slug)}`);
		url.searchParams.set("orgId", String(orgId));
		url.searchParams.set("panelId", String(panelId));
		url.searchParams.set("theme", theme);
		url.searchParams.set("refresh", refresh);
		if (kiosk) url.searchParams.set("kiosk", "1");
		return url.toString();
	}, [baseUrl, uid, title, orgId, panelId, theme, kiosk, refresh]);

	return (
		<section
			style={{
				width: "100%",
				border: "1px solid #e5e7eb",
				borderRadius: 14,
				overflow: "hidden",
				background: "#ffffff",
			}}
		>
			<div
				style={{
					padding: 10,
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					gap: 12,
					borderBottom: "1px solid #e5e7eb",
				}}
			>
				<div style={{ fontWeight: 900, color: "#111827" }}>{title}</div>
				<a
					href={dashboardHref}
					target="_blank"
					rel="noreferrer"
					style={{
						fontSize: 13,
						color: "#111827",
						fontWeight: 800,
						textDecoration: "none",
						border: "1px solid #e5e7eb",
						padding: "6px 10px",
						borderRadius: 12,
						background: "#ffffff",
					}}
				>
					Deschide în Grafana
				</a>
			</div>

			<iframe
				title={title}
				src={iframeSrc}
				style={{ width: "100%", height, border: 0, display: "block", background: "#ffffff" }}
				loading="lazy"
			/>
		</section>
	);
}
