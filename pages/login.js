import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("ts-theme") : "dark";
    document.documentElement.setAttribute("data-theme", saved || "dark");
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      if (result.user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError("Invalid email or password");
    }
    setLoading(false);
  };

  return (
    <div className="login-grid">
      <div className="login-left">
        <div className="login-brand">
          <div className="logo-box">
            <svg viewBox="0 0 100 100" width="42" height="42" xmlns="http://www.w3.org/2000/svg">
              <rect x="20" y="20" width="60" height="60" transform="rotate(45 50 50)" fill="none" stroke="#7c3aed" strokeWidth="4"/>
              <path d="M 35 40 L 50 30 L 65 40 M 50 30 L 50 65" stroke="#7c3aed" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="brand-name">Tradestone <span className="brand-suffix">Portal</span></div>
        </div>
        <div>
          <h1 className="login-headline">Your investments,<br />crystal clear.</h1>
          <p className="login-sub">Real-time visibility into your portfolio performance, active challenges and hedging positions — all in one place.</p>
        </div>
        <div className="login-bottom-stats">
          <div>
            <div className="login-stat-num">Live</div>
            <div className="login-stat-lbl">Notion Sync</div>
          </div>
          <div>
            <div className="login-stat-num">100%</div>
            <div className="login-stat-lbl">Secure</div>
          </div>
          <div>
            <div className="login-stat-num">24/7</div>
            <div className="login-stat-lbl">Access</div>
          </div>
        </div>
      </div>
      <div className="login-right">
        <h2>Welcome back.</h2>
        <p className="desc">Sign in to your Tradestone investor account to view your portfolio.</p>
        <form onSubmit={handleLogin}>
          {error && <div className="error-msg">{error}</div>}
          <div className="field-group">
            <label className="field-label">Email Address</label>
            <input className="field-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field-group">
            <label className="field-label">Password</label>
            <input className="field-input" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Signing in..." : "Sign In →"}
          </button>
        </form>
        <p style={{ marginTop: 20, fontSize: 12, color: "var(--text-muted)" }}>
          Forgot password? Contact admin to reset.
        </p>
      </div>
    </div>
  );
}
