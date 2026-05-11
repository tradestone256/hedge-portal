import { useEffect } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const saved = localStorage.getItem("ts-theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved);

    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) router.replace("/login");
      else if (user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) router.replace("/admin");
      else router.replace("/dashboard");
    });
    return () => unsub();
  }, [router]);

  return (
    <div style={{ textAlign: "center", padding: 80, color: "var(--text-muted)" }}>
      Loading...
    </div>
  );
}
