import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { logout } from "../lib/auth";
import { useEffect, useMemo, useState } from "react";
import { getDisplayNameForUser } from "../lib/userProfile";

export default function Navbar() {
	const { user } = useAuth();
	const loc = useLocation();
	const [displayName, setDisplayName] = useState<string>("");

	const username = useMemo(() => {
		if (displayName) return displayName;
		const email = user?.email ?? "";
		return email ? email.split("@")[0] : "";
	}, [displayName, user?.email]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!user) {
				setDisplayName("");
				return;
			}
			try {
				const name = await getDisplayNameForUser({ uid: user.uid, email: user.email });
				if (cancelled) return;
				setDisplayName(name);
			} catch {
				// ignore
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [user?.uid]);

	const linkStyle = (path: string) => ({
		textDecoration: "none",
		padding: "8px 10px",
		borderRadius: 10,
		border: "1px solid #ddd",
		background: loc.pathname === path ? "#16213e" : "#fff",
		color: loc.pathname === path ? "#fff" : "#16213e",
		fontWeight: 600,
	});

	return (
		<div
			style={{
				position: "sticky",
				top: 0,
				zIndex: 60,
				background: "rgba(255,255,255,0.95)",
				borderBottom: "1px solid #eee",
				padding: 12,
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				gap: 12,
			}}
		>
			<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
				<Link to="/" style={linkStyle("/")}>Harta</Link>
				<Link to="/analytics" style={linkStyle("/analytics")}>Statistici</Link>
				<Link to="/account" style={linkStyle("/account")}>Cont</Link>
			</div>

			<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
				{user?.email ? (
					<>
						<Link
							to="/account"
							style={{
								color: "#16213e",
								fontSize: 13,
								textDecoration: "none",
								fontWeight: 700,
							}}
							title="Deschide contul"
						>
							{username || user.email}
						</Link>
						<button
							onClick={() => logout()}
							style={{
								padding: "8px 10px",
								borderRadius: 10,
								border: "1px solid #ddd",
								background: "#fff",
								cursor: "pointer",
							}}
						>
							Logout
						</button>
					</>
				) : (
					<Link to="/login" style={linkStyle("/login")}>Login</Link>
				)}
			</div>
		</div>
	);
}
