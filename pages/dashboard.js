import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut, updatePassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { TopNav, greetingFor, todayLabel } from "../components/TopNav";

const fmt = (n) => "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtCurr = (n, c) => (Number(n) || 0).toLocaleString() + (c ? " " + c : "");
const sign = (n) => (Number(n) >= 0 ? "+" : "") + fmt(n);

// For Funded accounts, balance display starts from 0 (P&L only, since trader profit is what matters)
// For Challenge accounts (In Challenge), balance = starting + P&L (e.g. $150K + $4,500 = $154,500)
// For Blown accounts, show 0 since they're done
function displayBalance(account) {
  const status = account.status || "";
  const pl = account.totalPL || 0;
  const start = account.startingBalance || 0;
  if (status === "Funded") return pl;          // Funded: just the P&L profit
  if (status === "Blown") return 0;             // Blown: account is gone
  if (status === "Closed") return 0;            // Closed: no longer active
  return start + pl;                            // In Challenge / default: starting + P&L
}

function balanceLabel(account) {
  const status = account.status || "";
  if (status === "Funded") return "Profit";
  if (status === "Blown") return "Blown";
  if (status === "Closed") return "Closed";
  return "Current Balance";
}

const badgeClass = (s) => {
  const m = {
    "In Progress": "blue", "Active": "green", "Net Profit": "green", "Net Loss": "red",
    "Failed — Calculating": "yellow", "Passed — Funded": "green", "Abandoned": "gray",
    "Completed": "blue", "Pending": "yellow", "Failed": "red", "Reversed": "gray",
    "Yes — Split Unlocked": "green", "No — Still Recovering": "yellow", "Partially Recovered": "yellow",
    "In Challenge": "yellow", "Funded": "green", "Blown": "red", "Closed": "gray",
  };
  return m[s] || "gray";
};

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [showPwd, setShowPwd] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [chFilter, setChFilter] = useState("all");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.replace("/login"); return; }
      if (u.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) { router.replace("/admin"); return; }
      setUser(u);
      try {
        const res = await fetch(`/api/investor-data?email=${encodeURIComponent(u.email)}`);
        const json = await res.json();
        if (res.ok) setData(json);
        else setData({ error: json.error });
      } catch (e) { setData({ error: e.message }); }
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const handleSignOut = async () => { await signOut(auth); router.replace("/login"); };
  const handlePwdChange = async () => {
    setPwdMsg("");
    if (newPwd.length < 6) { setPwdMsg("Password must be at least 6 characters"); return; }
    try {
      await updatePassword(auth.currentUser, newPwd);
      setPwdMsg("✓ Password updated successfully");
      setNewPwd("");
      setTimeout(() => setShowPwd(false), 1800);
    } catch (e) {
      setPwdMsg("Error: " + e.message);
    }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 80, color: "var(--text-muted)" }}>Loading your portfolio...</div>;
  if (!data) return null;
  if (data.error) return (
    <>
      <TopNav userName="" onSignOut={handleSignOut} />
      <div className="container">
        <div className="card" style={{ textAlign: "center", padding: 60 }}>
          <h2>⚠ Account Not Found</h2>
          <p style={{ color: "var(--text-muted)", marginTop: 14 }}>{data.error}</p>
          <p style={{ color: "var(--text-muted)", marginTop: 8, fontSize: 13 }}>Please contact your administrator.</p>
        </div>
      </div>
    </>
  );

  const { profile, evaluations, withdrawals, movements, accounts, totals } = data;
  const g = greetingFor(profile.name);

  // Investor sees: capital they put in, what they've earned (only from funded withdrawals)
  const totalInvested = profile.capitalInvested || 0;
  const investorNetPL = totals.investorNetPL || 0;
  const roiPct = totalInvested > 0 ? ((investorNetPL / totalInvested) * 100) : 0;

  return (
    <>
      <TopNav userName={profile.name} onSignOut={handleSignOut} />
      <div className="container">
        <div className="greeting-row">
          <div className="greeting">
            <h1>{g.hello}, <span className="name">{g.name}.</span></h1>
            <div className="date">{todayLabel()}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="live-pill">Live · Notion Sync</span>
            <button className="btn-secondary" onClick={() => setShowPwd(!showPwd)} style={{ padding: "6px 14px", fontSize: 12 }}>
              {showPwd ? "Cancel" : "Change Password"}
            </button>
          </div>
        </div>

        {showPwd && (
          <div className="card" style={{ maxWidth: 480, marginBottom: 24 }}>
            <div className="card-title">Change Password</div>
            {pwdMsg && <div className={pwdMsg.startsWith("Error") ? "error-msg" : "success-msg"}>{pwdMsg}</div>}
            <div className="field-group">
              <label className="field-label">New Password</label>
              <input className="field-input" type="password" placeholder="At least 6 characters" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={handlePwdChange}>Update Password</button>
          </div>
        )}

        <div className="stat-grid">
          <div className="stat featured">
            <div className="stat-label">Capital Invested</div>
            <div className="stat-value">{fmt(totalInvested)}</div>
            <div className="stat-sub">Your contribution to operations</div>
          </div>
          <div className="stat">
            <div className="stat-label">Total Earned</div>
            <div className={"stat-value " + (investorNetPL >= 0 ? "green" : "red")}>{fmt(investorNetPL)}</div>
            <div className={"stat-sub " + (roiPct >= 0 ? "up" : "down")}>
              {roiPct >= 0 ? "▲" : "▼"} {Math.abs(roiPct).toFixed(1)}% return
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Active Challenges</div>
            <div className="stat-value">{totals.activeEvalCount}</div>
            <div className="stat-sub">{totals.evaluationCount} total challenges</div>
          </div>
          <div className="stat">
            <div className="stat-label">Withdrawals</div>
            <div className="stat-value">{withdrawals.length}</div>
            <div className="stat-sub">{withdrawals.length === 0 ? "None yet" : "Funded payouts"}</div>
          </div>
        </div>

        <div className="tab-bar">
          {[
            { id: "overview", label: "Overview" },
            { id: "challenges", label: `Challenges (${evaluations.length})` },
            { id: "accounts", label: `Prop Accounts (${accounts.length})` },
            { id: "withdrawals", label: `Withdrawals (${withdrawals.length})` },
            { id: "movements", label: `Money Movements (${movements.length})` },
          ].map(t => (
            <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</div>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <div className="section-h"><h2>Active Challenges</h2><span className="count-pill">{evaluations.length} total</span></div>
            {evaluations.length === 0 ? (
              <div className="card empty-state">No challenges yet</div>
            ) : (
              <div className="ch-grid">
                {evaluations.slice(0, 6).map(e => {
                  const target = (e.accountSize === "$50K" ? 53000 : e.accountSize === "$100K" ? 106000 : e.accountSize === "$150K" ? 159000 : 0);
                  const pct = e.brokerPL && target ? Math.min(100, Math.max(0, (e.brokerPL / target) * 100 + 50)) : 0;
                  const stat = e.status || "";
                  const isFailed = stat === "Failed" || stat === "Net Loss" || stat === "Failed — Calculating" || stat === "Abandoned";
                  const isPassed = stat === "Net Profit" || stat === "Passed — Funded";
                  const cls = isFailed ? "failed" : isPassed ? "" : "pending";
                  return (
                    <div key={e.id} className={`ch-card ${cls}`}>
                      <div className="ch-head">
                        <div className="ch-size" style={{ color: isFailed ? "var(--red)" : "var(--text)" }}>{e.accountSize || "—"}</div>
                        <span className={`badge-tag ${badgeClass(stat)}`}>{stat || "Active"}</span>
                      </div>
                      <div className="ch-phase">{e.stage || "—"} · {e.propFirm || ""}</div>
                      <div className="progress-row"><span>To target</span><span>{pct.toFixed(0)}%</span></div>
                      <div className="progress-bar"><div style={{ width: `${pct}%`, background: isFailed ? "var(--red)" : "var(--green)" }} /></div>
                      <div className="ch-stats">
                        <div>
                          <div className="ch-stat-l">{isFailed ? "Result" : "Stage"}</div>
                          <div className="ch-stat-v" style={{ fontSize: 14, color: isFailed ? "var(--red)" : "var(--text)" }}>{isFailed ? "Failed" : (e.stage || "—")}</div>
                        </div>
                        <div>
                          <div className="ch-stat-l">You Earned</div>
                          <div className="ch-stat-v" style={{ fontSize: 14, color: isFailed ? "var(--red)" : "var(--text)" }}>{isFailed ? "$0" : "—"}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="section-h"><h2>Prop Firm Accounts</h2><span className="count-pill">{accounts.length} accounts</span></div>
            <div className="card" style={{ padding: 0 }}>
              {accounts.length === 0 ? (
                <div className="empty-state">No prop firm accounts linked yet</div>
              ) : (
                <div className="tbl-wrap"><table>
                  <thead><tr><th>Account Name</th><th>Prop Firm</th><th>Status</th><th>Starting</th><th>P&L</th><th>Balance</th></tr></thead>
                  <tbody>
                    {accounts.map(a => {
                      const bal = displayBalance(a);
                      const lbl = balanceLabel(a);
                      const isFunded = a.status === "Funded";
                      return (
                        <tr key={a.id}>
                          <td style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</td>
                          <td>{a.propFirm || "—"}</td>
                          <td><span className={`badge-tag ${badgeClass(a.status)}`}>{a.status || "—"}</span></td>
                          <td className="text-dim">{isFunded ? "—" : fmt(a.startingBalance)}</td>
                          <td className={(a.totalPL || 0) >= 0 ? "text-green" : "text-red"}>{sign(a.totalPL)}</td>
                          <td style={{ fontWeight: 700, color: bal >= 0 ? "var(--text)" : "var(--red)" }}>
                            {fmt(bal)}
                            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500, marginTop: 2 }}>{lbl}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table></div>
              )}
            </div>

            <div className="section-h"><h2>Recent Withdrawals</h2><span className="count-pill">{withdrawals.length} records</span></div>
            <div className="card" style={{ padding: 0 }}>
              {withdrawals.length === 0 ? (
                <div className="empty-state">No withdrawals yet</div>
              ) : (
                <div className="tbl-wrap"><table>
                  <thead><tr><th>Date</th><th>Stage</th><th>Net Received</th><th>Your Share</th><th>Status</th></tr></thead>
                  <tbody>
                    {withdrawals.slice(0, 5).map(w => (
                      <tr key={w.id}>
                        <td className="text-mono text-dim">{w.date || "—"}</td>
                        <td><span className={`badge-tag ${badgeClass(w.stage)}`}>{w.stage || "—"}</span></td>
                        <td>{fmt(w.netReceived)}</td>
                        <td className="text-green" style={{ fontWeight: 700 }}>{fmt(w.investorShare)}</td>
                        <td><span className={`badge-tag ${badgeClass(w.status)}`}>{w.status || "—"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          </>
        )}

        {tab === "challenges" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  { id: "all", label: "All", count: evaluations.length },
                  { id: "active", label: "Active", count: evaluations.filter(e => e.status === "In Progress" || e.status === "Active").length },
                  { id: "passed", label: "Passed", count: evaluations.filter(e => e.status === "Net Profit" || e.status === "Passed — Funded").length },
                  { id: "failed", label: "Failed", count: evaluations.filter(e => e.status === "Failed" || e.status === "Net Loss" || e.status === "Failed — Calculating").length },
                  { id: "completed", label: "Completed", count: evaluations.filter(e => e.status === "Completed").length },
                  { id: "abandoned", label: "Abandoned", count: evaluations.filter(e => e.status === "Abandoned").length },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setChFilter(f.id)}
                    style={{
                      padding: "8px 14px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      background: chFilter === f.id ? "var(--green)" : "var(--bg-card)",
                      color: chFilter === f.id ? "#000" : "var(--text)",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {f.label} <span style={{ opacity: 0.7, marginLeft: 4 }}>({f.count})</span>
                  </button>
                ))}
              </div>
              <select
                value={chFilter}
                onChange={(e) => setChFilter(e.target.value)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                  color: "var(--text)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="passed">Passed Only</option>
                <option value="failed">Failed Only</option>
                <option value="completed">Completed</option>
                <option value="abandoned">Abandoned</option>
              </select>
            </div>
            {(() => {
              const filtered = evaluations.filter(e => {
                if (chFilter === "all") return true;
                if (chFilter === "active") return e.status === "In Progress" || e.status === "Active";
                if (chFilter === "passed") return e.status === "Net Profit" || e.status === "Passed — Funded";
                if (chFilter === "failed") return e.status === "Failed" || e.status === "Net Loss" || e.status === "Failed — Calculating";
                if (chFilter === "completed") return e.status === "Completed";
                if (chFilter === "abandoned") return e.status === "Abandoned";
                return true;
              });
              if (filtered.length === 0) return <div className="card empty-state">No challenges match this filter</div>;
              return (
                <div className="ch-grid">
                  {filtered.map(e => {
                    const target = (e.accountSize === "$50K" ? 53000 : e.accountSize === "$100K" ? 106000 : e.accountSize === "$150K" ? 159000 : 0);
                    const pct = e.brokerPL && target ? Math.min(100, Math.max(0, (e.brokerPL / target) * 100 + 50)) : 0;
                    const stat = e.status || "";
                    const isFailed = stat === "Failed" || stat === "Net Loss" || stat === "Failed — Calculating" || stat === "Abandoned";
                    const isPassed = stat === "Net Profit" || stat === "Passed — Funded";
                    const cls = isFailed ? "failed" : isPassed ? "" : "pending";
                    return (
                      <div key={e.id} className={`ch-card ${cls}`}>
                        <div className="ch-head">
                          <div className="ch-size" style={{ color: isFailed ? "var(--red)" : "var(--text)" }}>{e.accountSize || "—"}</div>
                          <span className={`badge-tag ${badgeClass(stat)}`}>{stat || "Active"}</span>
                        </div>
                        <div className="ch-phase">{e.client} · {e.stage || "—"} · {e.propFirm}</div>
                        <div className="progress-row"><span>To target</span><span>{pct.toFixed(0)}%</span></div>
                        <div className="progress-bar"><div style={{ width: `${pct}%`, background: isFailed ? "var(--red)" : "var(--green)" }} /></div>
                        <div className="ch-stats">
                          <div>
                            <div className="ch-stat-l">{isFailed ? "Result" : "Stage"}</div>
                            <div className="ch-stat-v" style={{ fontSize: 14, color: isFailed ? "var(--red)" : "var(--text)" }}>{isFailed ? "Failed" : (e.stage || "—")}</div>
                          </div>
                          <div>
                            <div className="ch-stat-l">You Earned</div>
                            <div className="ch-stat-v" style={{ fontSize: 14, color: isFailed ? "var(--red)" : "var(--text)" }}>{isFailed ? "$0" : "—"}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        )}

        {tab === "accounts" && (
          <div className="card" style={{ padding: 0 }}>
            {accounts.length === 0 ? (
              <div className="empty-state">No prop firm accounts linked to your evaluations</div>
            ) : (
              <div className="tbl-wrap"><table>
                <thead><tr><th>Account Name</th><th>Prop Firm</th><th>Status</th><th>Starting Balance</th><th>Total P&L</th><th>Balance</th></tr></thead>
                <tbody>
                  {accounts.map(a => {
                    const bal = displayBalance(a);
                    const lbl = balanceLabel(a);
                    const isFunded = a.status === "Funded";
                    return (
                      <tr key={a.id}>
                        <td style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</td>
                        <td>{a.propFirm || "—"}</td>
                        <td><span className={`badge-tag ${badgeClass(a.status)}`}>{a.status || "—"}</span></td>
                        <td className="text-dim">{isFunded ? "—" : fmt(a.startingBalance)}</td>
                        <td className={(a.totalPL || 0) >= 0 ? "text-green" : "text-red"} style={{ fontWeight: 600 }}>{sign(a.totalPL)}</td>
                        <td style={{ fontWeight: 700, fontSize: 15, color: bal >= 0 ? "var(--text)" : "var(--red)" }}>
                          {fmt(bal)}
                          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500, marginTop: 2 }}>{lbl}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}
          </div>
        )}

        {tab === "withdrawals" && (
          <div className="card" style={{ padding: 0 }}>
            {withdrawals.length === 0 ? (
              <div className="empty-state">No withdrawals yet</div>
            ) : (
              <div className="tbl-wrap"><table>
                <thead><tr><th>Date</th><th>Stage</th><th>Gross</th><th>Net Received</th><th>Your Share</th><th>Recovery</th><th>Status</th></tr></thead>
                <tbody>
                  {withdrawals.map(w => (
                    <tr key={w.id}>
                      <td className="text-mono text-dim">{w.date || "—"}</td>
                      <td><span className={`badge-tag ${badgeClass(w.stage)}`}>{w.stage || "—"}</span></td>
                      <td>{fmt(w.gross)}</td>
                      <td>{fmt(w.netReceived)}</td>
                      <td className="text-green" style={{ fontWeight: 700 }}>{fmt(w.investorShare)}</td>
                      <td><span className={`badge-tag ${badgeClass(w.recoveryStatus)}`}>{w.recoveryStatus || "—"}</span></td>
                      <td><span className={`badge-tag ${badgeClass(w.status)}`}>{w.status || "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        )}

        {tab === "movements" && (
          <div className="card" style={{ padding: 0 }}>
            {movements.length === 0 ? (
              <div className="empty-state">No money movements yet</div>
            ) : (
              <div className="tbl-wrap"><table>
                <thead><tr><th>Date</th><th>Type</th><th>From</th><th>To</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id}>
                      <td className="text-mono text-dim">{m.date || "—"}</td>
                      <td>{m.type || "—"}</td>
                      <td className="text-dim">{m.from || "—"}</td>
                      <td className="text-dim">{m.to || "—"}</td>
                      <td style={{ fontWeight: 600 }}>{fmtCurr(m.amount, m.currency)}</td>
                      <td><span className={`badge-tag ${badgeClass(m.status)}`}>{m.status || "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
