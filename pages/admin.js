import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { TopNav, greetingFor, todayLabel } from "../components/TopNav";

const fmt = (n) => "$" + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtCurr = (n, c) => (Number(n) || 0).toLocaleString() + (c ? " " + c : "");
const sign = (n) => (Number(n) >= 0 ? "+" : "") + fmt(n);

function displayBalance(account) {
  const status = account.status || "";
  const pl = account.totalPL || 0;
  const start = account.startingBalance || 0;
  if (status === "Funded") return pl;
  if (status === "Blown" || status === "Closed") return 0;
  return start + pl;
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
    "Completed": "blue", "Pending": "yellow", "Failed": "red", "Reversed": "gray", "Refunded": "blue", "Paid": "green",
    "In Challenge": "yellow", "Funded": "green", "Blown": "red", "Closed": "gray",
  };
  return m[s] || "gray";
};

// Reusable Topstep-style calendar component
function TopstepCalendar({ dailyData, calMonth, setCalMonth, title, itemLabel = "items" }) {
  const year = calMonth.year;
  const month = calMonth.month;
  const monthLabel = new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  const dailyMap = {};
  for (const [key, day] of Object.entries(dailyData)) {
    const d = new Date(key);
    if (d.getFullYear() === year && d.getMonth() === month) {
      dailyMap[key] = day;
    }
  }

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) {
    const prev = new Date(year, month, -startWeekday + i + 1);
    cells.push({ date: prev, inMonth: false });
  }
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const nxt = new Date(last); nxt.setDate(last.getDate() + 1);
    cells.push({ date: nxt, inMonth: false });
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const monthIncome = Object.values(dailyMap).reduce((s, d) => s + d.income, 0);
  const monthExpenses = Object.values(dailyMap).reduce((s, d) => s + d.expenses, 0);
  const monthNet = monthIncome - monthExpenses;
  const totalItems = Object.values(dailyMap).reduce((s, d) => s + d.count, 0);
  const winningDays = Object.values(dailyMap).filter(d => d.income > d.expenses).length;
  const losingDays = Object.values(dailyMap).filter(d => d.expenses > d.income).length;

  const goPrev = () => {
    const m = month - 1;
    if (m < 0) setCalMonth({ year: year - 1, month: 11 });
    else setCalMonth({ year, month: m });
  };
  const goNext = () => {
    const m = month + 1;
    if (m > 11) setCalMonth({ year: year + 1, month: 0 });
    else setCalMonth({ year, month: m });
  };
  const goToday = () => {
    const d = new Date();
    setCalMonth({ year: d.getFullYear(), month: d.getMonth() });
  };
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = new Date();
  const isToday = (d) => d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <div className="stat" style={{
          background: monthNet >= 0 ? "var(--green)" : "var(--red)",
          borderColor: monthNet >= 0 ? "var(--green)" : "var(--red)",
          color: "#000",
        }}>
          <div className="stat-label" style={{ color: "rgba(0,0,0,0.7)" }}>{title} — {monthLabel}</div>
          <div className="stat-value" style={{ color: "#000" }}>{sign(monthNet)}</div>
          <div className="stat-sub" style={{ color: "rgba(0,0,0,0.65)" }}>{totalItems} {itemLabel}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Wins</div>
          <div className="stat-value green">{fmt(monthIncome)}</div>
          <div className="stat-sub up">{winningDays} day{winningDays === 1 ? "" : "s"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Losses</div>
          <div className="stat-value red">−{fmt(monthExpenses)}</div>
          <div className="stat-sub down">{losingDays} day{losingDays === 1 ? "" : "s"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Win Rate</div>
          <div className="stat-value">{(winningDays + losingDays) > 0 ? ((winningDays / (winningDays + losingDays)) * 100).toFixed(0) : 0}%</div>
          <div className="stat-sub">By trading day</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={goPrev} style={{ padding: "8px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", cursor: "pointer", fontSize: 16 }}>‹</button>
          <h2 style={{ fontSize: 22, fontWeight: 700, minWidth: 200, textAlign: "center" }}>{monthLabel}</h2>
          <button onClick={goNext} style={{ padding: "8px 14px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", cursor: "pointer", fontSize: 16 }}>›</button>
        </div>
        <button onClick={goToday} style={{ padding: "8px 16px", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Today</button>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr) 110px", borderBottom: "1px solid var(--border)" }}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
            <div key={d} style={{ padding: "12px 8px", textAlign: "center", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>{d}</div>
          ))}
          <div style={{ padding: "12px 8px", textAlign: "center", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, borderLeft: "1px solid var(--border)" }}>Week</div>
        </div>
        {weeks.map((week, wi) => {
          const weekTotal = week.reduce((s, c) => {
            if (!c.inMonth) return s;
            const k = dayKey(c.date);
            const day = dailyMap[k];
            if (!day) return s;
            return s + (day.income - day.expenses);
          }, 0);
          const weekItems = week.reduce((s, c) => {
            if (!c.inMonth) return s;
            const k = dayKey(c.date);
            return s + (dailyMap[k]?.count || 0);
          }, 0);
          return (
            <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr) 110px", borderBottom: wi < weeks.length - 1 ? "1px solid var(--border)" : "none", minHeight: 110 }}>
              {week.map((cell, ci) => {
                const k = dayKey(cell.date);
                const day = dailyMap[k];
                const dayNet = day ? day.income - day.expenses : 0;
                const hasData = day && day.count > 0;
                const cellBg = hasData
                  ? (dayNet > 0 ? "rgba(34, 197, 94, 0.18)" : dayNet < 0 ? "rgba(239, 68, 68, 0.18)" : "transparent")
                  : "transparent";
                return (
                  <div key={ci} style={{
                    padding: 12,
                    borderRight: ci < 6 ? "1px solid var(--border)" : "none",
                    background: cellBg,
                    opacity: cell.inMonth ? 1 : 0.3,
                    minHeight: 110,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: isToday(cell.date) ? 800 : 500,
                      color: isToday(cell.date) ? "#000" : "var(--text)",
                      display: "inline-flex",
                      alignSelf: "flex-end",
                      padding: isToday(cell.date) ? "3px 10px" : 0,
                      background: isToday(cell.date) ? "var(--green)" : "transparent",
                      borderRadius: 999,
                    }}>{cell.date.getDate()}</div>
                    {hasData && cell.inMonth ? (
                      <div style={{ textAlign: "center", marginTop: "auto" }}>
                        <div style={{
                          fontSize: 18,
                          fontWeight: 800,
                          color: dayNet > 0 ? "var(--green)" : dayNet < 0 ? "var(--red)" : "var(--text)",
                          letterSpacing: -0.5,
                          lineHeight: 1.1,
                        }}>{sign(dayNet)}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{day.count} {itemLabel.replace(/s$/, "")}{day.count === 1 ? "" : "s"}</div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              <div style={{ padding: 12, borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", background: "var(--bg-input)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Wk {wi + 1}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: weekTotal > 0 ? "var(--green)" : weekTotal < 0 ? "var(--red)" : "var(--text-muted)", marginTop: 6, letterSpacing: -0.3 }}>{weekTotal === 0 ? "$0.00" : sign(weekTotal)}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{weekItems} {itemLabel.replace(/s$/, "")}{weekItems === 1 ? "" : "s"}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="section-h" style={{ marginTop: 32 }}><h2>Daily Breakdown — {monthLabel}</h2><span className="count-pill">{Object.keys(dailyMap).length} active days</span></div>
      {Object.keys(dailyMap).length === 0 ? (
        <div className="card empty-state">No activity in this month</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="tbl-wrap"><table>
            <thead><tr><th>Date</th><th>Wins</th><th>Losses</th><th>Net</th><th>Items</th></tr></thead>
            <tbody>
              {Object.entries(dailyMap).sort(([a], [b]) => b.localeCompare(a)).map(([k, d]) => {
                const date = new Date(k);
                const net = d.income - d.expenses;
                return (
                  <tr key={k}>
                    <td className="text-mono" style={{ fontWeight: 600 }}>{date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</td>
                    <td className="text-green">{d.income > 0 ? fmt(d.income) : "—"}</td>
                    <td className="text-red">{d.expenses > 0 ? "−" + fmt(d.expenses) : "—"}</td>
                    <td className={net >= 0 ? "text-green" : "text-red"} style={{ fontWeight: 700, fontSize: 15 }}>{sign(net)}</td>
                    <td className="text-dim">{d.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}
    </>
  );
}

export default function Admin() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [expenseTypeFilter, setExpenseTypeFilter] = useState("all");
  const [movementTypeFilter, setMovementTypeFilter] = useState("all");
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [hedgeCalMonth, setHedgeCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.replace("/login"); return; }
      if (u.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) { router.replace("/dashboard"); return; }
      try {
        const res = await fetch(`/api/admin-data?adminEmail=${encodeURIComponent(u.email)}`);
        const json = await res.json();
        setData(json);
      } catch (e) { setData({ error: e.message }); }
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const handleSignOut = async () => { await signOut(auth); router.replace("/login"); };

  if (loading) return <div style={{ textAlign: "center", padding: 80, color: "var(--text-muted)" }}>Loading admin dashboard...</div>;
  if (!data || data.error) return <><TopNav userName="Admin" onSignOut={handleSignOut} /><div className="container"><div className="card empty-state">Error: {data?.error || "Unable to load"}</div></div></>;

  const { investors, evaluations, withdrawals, movements, expenses, b2f, accounts, accountPL, investorPL, totals } = data;
  const g = greetingFor("Admin");

  const expenseTypes = ["all", ...Object.keys(totals.expensesByType || {})];
  const movementTypes = ["all", ...Object.keys(totals.movementsByType || {})];
  const filteredExpenses = expenses.filter(e => expenseTypeFilter === "all" || e.type === expenseTypeFilter);
  const filteredMovements = movements.filter(m => movementTypeFilter === "all" || m.type === movementTypeFilter);

  return (
    <>
      <TopNav userName="Admin" onSignOut={handleSignOut} />
      <div className="container">
        <div className="greeting-row">
          <div className="greeting">
            <h1>{g.hello}, <span className="name">Admin.</span></h1>
            <div className="date">{todayLabel()}</div>
          </div>
          <span className="live-pill">Live · Notion Sync</span>
        </div>

        <div className="stat-grid">
          <div className="stat featured">
            <div className="stat-label">Net Company Profit</div>
            <div className="stat-value">{sign(totals.netCompanyProfit)}</div>
            <div className="stat-sub">All sources, all time</div>
          </div>
          <div className="stat">
            <div className="stat-label">Hedge P&L (Total)</div>
            <div className={"stat-value " + ((totals.challengeTradesPL || 0) >= 0 ? "green" : "red")}>{sign(totals.challengeTradesPL)}</div>
            <div className="stat-sub">Broker side, all trades</div>
          </div>
          <div className="stat">
            <div className="stat-label">Withdrawal Income</div>
            <div className="stat-value green">{fmt(totals.withdrawalIncome)}</div>
            <div className="stat-sub">Company 50% completed</div>
          </div>
          <div className="stat">
            <div className="stat-label">Total Expenses</div>
            <div className="stat-value red">{fmt(totals.totalExpenses)}</div>
            <div className="stat-sub down">Paid only</div>
          </div>
        </div>

        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
          <div className="stat">
            <div className="stat-label">Investor Capital</div>
            <div className="stat-value">{fmt(totals.totalCapital)}</div>
            <div className="stat-sub">{totals.investorCount} investor{totals.investorCount === 1 ? "" : "s"}</div>
          </div>
          <div className="stat">
            <div className="stat-label">Paid To Investors</div>
            <div className="stat-value">{fmt(totals.withdrawalToInvestors)}</div>
            <div className="stat-sub">50% splits</div>
          </div>
          <div className="stat">
            <div className="stat-label">B2F Income</div>
            <div className="stat-value green">{fmt(totals.b2fIncome)}</div>
            <div className="stat-sub">Net after fees</div>
          </div>
          <div className="stat">
            <div className="stat-label">Active Evaluations</div>
            <div className="stat-value">{totals.activeEvals}</div>
            <div className="stat-sub">{evaluations.length} total</div>
          </div>
        </div>

        {/* P&L equation explainer */}
        <div className="card" style={{ marginBottom: 24, padding: 18, background: "var(--bg-input)" }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, marginBottom: 10 }}>How Net Company Profit is Calculated</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 13 }}>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>{fmt(totals.withdrawalIncome)}</span>
            <span style={{ color: "var(--text-muted)" }}>(withdrawals)</span>
            <span style={{ color: "var(--text-muted)" }}>+</span>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>{fmt(totals.b2fIncome)}</span>
            <span style={{ color: "var(--text-muted)" }}>(B2F)</span>
            <span style={{ color: "var(--text-muted)" }}>+</span>
            <span style={{ color: "var(--green)", fontWeight: 700 }}>{fmt(totals.realizedHedgeProfit)}</span>
            <span style={{ color: "var(--text-muted)" }}>(realized hedge gains)</span>
            <span style={{ color: "var(--text-muted)" }}>−</span>
            <span style={{ color: "var(--red)", fontWeight: 700 }}>{fmt(totals.companyChargedExpenses)}</span>
            <span style={{ color: "var(--text-muted)" }}>(company-charged expenses)</span>
            <span style={{ color: "var(--text-muted)" }}>=</span>
            <span style={{ color: "var(--green)", fontWeight: 800, fontSize: 15 }}>{fmt(totals.netCompanyProfit)}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.5 }}>
            Company put up no capital — all hedging is funded by investors. Hedge losses don't affect company profit (capital returns to investor on failed evals). Only expenses marked <strong style={{ color: "var(--text)" }}>"Charge to Company"</strong> in Notion reduce company cash. Floored at $0.
          </div>
        </div>

        {(totals.pendingExpenses > 0 || totals.refundedExpenses > 0) && (
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            {totals.pendingExpenses > 0 && (
              <div className="card" style={{ flex: 1, minWidth: 240, padding: 16, borderColor: "rgba(234, 179, 8, 0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--yellow)", fontWeight: 600 }}>⏳ Pending Expenses</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--yellow)" }}>{fmt(totals.pendingExpenses)}</span>
                </div>
              </div>
            )}
            {totals.refundedExpenses > 0 && (
              <div className="card" style={{ flex: 1, minWidth: 240, padding: 16, borderColor: "rgba(59, 130, 246, 0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "var(--blue)", fontWeight: 600 }}>↩ Refunded Expenses</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "var(--blue)" }}>{fmt(totals.refundedExpenses)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="tab-bar">
          {[
            { id: "overview", label: "Overview" },
            { id: "calendar", label: "📅 P&L Calendar" },
            { id: "hedge-calendar", label: "📊 Hedge Calendar" },
            { id: "treasury", label: `💳 Treasury (${data.financialAccounts?.length || 0})` },
            { id: "by-account", label: `💼 By Account (${accountPL.length})` },
            { id: "by-investor", label: `👥 By Investor (${investorPL.length})` },
            { id: "investors", label: `Investors (${investors.length})` },
            { id: "evaluations", label: `Evaluations (${evaluations.length})` },
            { id: "withdrawals", label: `Withdrawals (${withdrawals.length})` },
            { id: "b2f", label: `B2F (${b2f.length})` },
            { id: "movements", label: `Movements (${movements.length})` },
            { id: "expenses", label: `Expenses (${expenses.length})` },
          ].map(t => (
            <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>{t.label}</div>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <div className="section-h"><h2>Expense Breakdown by Type</h2><span className="count-pill">All-time paid only</span></div>
            <div className="card">
              {Object.keys(totals.expensesByType).length === 0 ? (
                <div className="empty-state">No paid expenses yet</div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {Object.entries(totals.expensesByType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, amt]) => {
                      const pct = totals.totalExpenses > 0 ? (amt / totals.totalExpenses) * 100 : 0;
                      return (
                        <div key={type} style={{ background: "var(--bg-input)", padding: 16, borderRadius: 12, border: "1px solid var(--border)" }}>
                          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>{type}</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--red)", marginBottom: 4 }}>{fmt(amt)}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{pct.toFixed(1)}% of total</div>
                          <div className="progress-bar" style={{ marginTop: 8, marginBottom: 0 }}>
                            <div style={{ width: `${pct}%`, background: "var(--red)" }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div className="section-h"><h2>Active Evaluations</h2><span className="count-pill">{totals.activeEvals} active</span></div>
            <div className="card" style={{ padding: 0 }}>
              <div className="tbl-wrap"><table>
                <thead><tr><th>Client</th><th>Prop Firm</th><th>Size</th><th>Stage</th><th>Status</th><th>Net P&L</th></tr></thead>
                <tbody>
                  {evaluations.filter(e => e.status === "In Progress" || e.status === "Active").slice(0, 10).map(e => (
                    <tr key={e.id}>
                      <td>{e.client || "—"}</td>
                      <td>{e.propFirm || "—"}</td>
                      <td className="text-mono">{e.accountSize || "—"}</td>
                      <td><span className={`badge-tag ${badgeClass(e.stage)}`}>{e.stage || "—"}</span></td>
                      <td><span className={`badge-tag ${badgeClass(e.status)}`}>{e.status || "—"}</span></td>
                      <td className={(e.netPL || 0) >= 0 ? "text-green" : "text-red"} style={{ fontWeight: 600 }}>{sign(e.netPL)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </>
        )}

        {tab === "calendar" && (
          <TopstepCalendar
            dailyData={totals.dailyData}
            calMonth={calMonth}
            setCalMonth={setCalMonth}
            title="Net P&L"
            itemLabel="items"
          />
        )}

        {tab === "hedge-calendar" && (
          <>
            <div className="card" style={{ marginBottom: 20, padding: 16, background: "var(--bg-input)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ fontSize: 20 }}>📊</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  <strong style={{ color: "var(--text)" }}>Hedge Calendar — Broker side only.</strong> Shows daily Broker Side P&L from your Trade Log, like Topstep's calendar. No expenses, no withdrawals, no B2F — just hedge performance per day.
                </div>
              </div>
            </div>
            <TopstepCalendar
              dailyData={totals.hedgeDailyData}
              calMonth={hedgeCalMonth}
              setCalMonth={setHedgeCalMonth}
              title="Hedge Net"
              itemLabel="trades"
            />
          </>
        )}

        {tab === "treasury" && (() => {
          const fa = data.financialAccounts || [];
          const totalAcrossAccounts = fa.reduce((s, a) => s + (a.currentBalance || 0), 0);
          const activeAccounts = fa.filter(a => a.status === "Active");

          // Color/icon per account type
          const typeColor = (t) => {
            const m = {
              "Binance": "#f3ba2f",
              "Broker (Exness)": "#3b82f6",
              "Bank Account": "#22c55e",
              "Crypto Wallet": "#a855f7",
              "PayPal": "#0070ba",
              "Credit Card": "#f97316",
              "Cash": "#6b7280",
            };
            return m[t] || "#6b7280";
          };
          const typeIcon = (t) => {
            const m = {
              "Binance": "🟡",
              "Broker (Exness)": "📈",
              "Bank Account": "🏦",
              "Crypto Wallet": "₿",
              "PayPal": "💳",
              "Credit Card": "💳",
              "Cash": "💵",
            };
            return m[t] || "💰";
          };

          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 24 }}>
                <div className="stat featured">
                  <div className="stat-label" style={{ color: "rgba(0,0,0,0.7)" }}>Total Balance</div>
                  <div className="stat-value" style={{ color: "#000" }}>{fmt(totalAcrossAccounts)}</div>
                  <div className="stat-sub" style={{ color: "rgba(0,0,0,0.65)" }}>Across all platforms</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Active Accounts</div>
                  <div className="stat-value">{activeAccounts.length}</div>
                  <div className="stat-sub">{fa.length} total</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Total Inflows</div>
                  <div className="stat-value green">{fmt(fa.reduce((s, a) => s + (a.inflows || 0), 0))}</div>
                  <div className="stat-sub up">Completed only</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Total Outflows</div>
                  <div className="stat-value red">{fmt(fa.reduce((s, a) => s + (a.outflows || 0) + (a.expenseOutflows || 0), 0))}</div>
                  <div className="stat-sub down">Transfers + expenses</div>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 20, padding: 16, background: "var(--bg-input)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ fontSize: 20 }}>💡</div>
                  <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    <strong style={{ color: "var(--text)" }}>How balances update:</strong> When you log an expense in Notion's <em>Expenses & Payments</em> database, set <strong>Paid From</strong> to the platform → balance decreases instantly. When you log a transfer in <em>Money Movement Ledger</em>, set <strong>From Financial Account</strong> and <strong>To Financial Account</strong> → both balances update in real time. To add new platforms, open the <em>💰 Financial Accounts</em> database in Notion.
                  </div>
                </div>
              </div>

              <div className="section-h"><h2>Platform Balances</h2><span className="count-pill">{fa.length} platforms</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 32 }}>
                {fa.map(a => {
                  const color = typeColor(a.accountType);
                  const icon = typeIcon(a.accountType);
                  const netFlow = (a.inflows || 0) - (a.outflows || 0) - (a.expenseOutflows || 0);
                  return (
                    <div key={a.id} className="card" style={{ borderLeft: `4px solid ${color}`, padding: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 20 }}>{icon}</span>
                            <span style={{ fontSize: 16, fontWeight: 700 }}>{a.name || "—"}</span>
                          </div>
                          <div className="text-dim" style={{ fontSize: 12 }}>{a.accountType} · {a.currency || ""}</div>
                        </div>
                        <span className={`badge-tag ${badgeClass(a.status)}`}>{a.status || "—"}</span>
                      </div>
                      <div style={{ marginBottom: 16 }}>
                        <div className="stat-label" style={{ marginBottom: 4 }}>Current Balance</div>
                        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1, color: a.currentBalance >= 0 ? "var(--text)" : "var(--red)" }}>{fmt(a.currentBalance)}</div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                        <div>
                          <div className="ch-stat-l">Start</div>
                          <div className="text-dim" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(a.startingBalance)}</div>
                        </div>
                        <div>
                          <div className="ch-stat-l">In</div>
                          <div className="text-green" style={{ fontSize: 13, fontWeight: 600 }}>+{fmt(a.inflows)}</div>
                        </div>
                        <div>
                          <div className="ch-stat-l">Out</div>
                          <div className="text-red" style={{ fontSize: 13, fontWeight: 600 }}>−{fmt((a.outflows || 0) + (a.expenseOutflows || 0))}</div>
                        </div>
                      </div>
                      {a.isBroker && (
                        <div style={{ marginTop: 12, padding: 12, background: "var(--bg-input)", borderRadius: 8, border: "1px dashed var(--border)" }}>
                          <div className="ch-stat-l" style={{ marginBottom: 8 }}>Trade P&L (auto)</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                            <div>
                              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Wins</div>
                              <div className="text-green" style={{ fontSize: 13, fontWeight: 600 }}>+{fmt(a.tradeWins)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Losses</div>
                              <div className="text-red" style={{ fontSize: 13, fontWeight: 600 }}>−{fmt(a.tradeLosses)}</div>
                            </div>
                            <div>
                              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Net</div>
                              <div className={(a.tradePL || 0) >= 0 ? "text-green" : "text-red"} style={{ fontSize: 13, fontWeight: 700 }}>{sign(a.tradePL)}</div>
                            </div>
                          </div>
                        </div>
                      )}
                      <div style={{ marginTop: 12, fontSize: 11, color: "var(--text-muted)" }}>{a.activityCount} transaction{a.activityCount === 1 ? "" : "s"}</div>
                    </div>
                  );
                })}
              </div>

              <div className="section-h"><h2>Recent Activity</h2><span className="count-pill">Last 20 across all platforms</span></div>
              {(() => {
                const allActivity = [];
                for (const a of fa) {
                  for (const act of (a.recentActivity || [])) {
                    allActivity.push({ ...act, accountName: a.name, accountType: a.accountType });
                  }
                }
                allActivity.sort((x, y) => (y.date || "").localeCompare(x.date || ""));
                const top20 = allActivity.slice(0, 20);
                if (top20.length === 0) return <div className="card empty-state">No activity yet. Log an expense or transfer in Notion to see it here.</div>;
                return (
                  <div className="card" style={{ padding: 0 }}>
                    <div className="tbl-wrap"><table>
                      <thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Direction</th><th>Amount</th><th>Status</th></tr></thead>
                      <tbody>
                        {top20.map((act, idx) => (
                          <tr key={idx}>
                            <td className="text-mono text-dim">{act.date || "—"}</td>
                            <td>{act.description || "—"}<div className="text-dim" style={{ fontSize: 11 }}>{act.type}</div></td>
                            <td>{act.accountName}</td>
                            <td>
                              {act.direction === "in" ? (
                                <span className="badge-tag green">↓ IN</span>
                              ) : (
                                <span className="badge-tag red">↑ OUT</span>
                              )}
                            </td>
                            <td className={act.direction === "in" ? "text-green" : "text-red"} style={{ fontWeight: 700 }}>
                              {act.direction === "in" ? "+" : "−"}{fmt(act.amount)}
                            </td>
                            <td><span className={`badge-tag ${badgeClass(act.status)}`}>{act.status || "—"}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  </div>
                );
              })()}
            </>
          );
        })()}

        {tab === "by-account" && (
          <>
            <div className="section-h"><h2>Profit & Loss by Prop Account</h2><span className="count-pill">{accountPL.length} accounts</span></div>
            <div className="card" style={{ padding: 0 }}>
              <div className="tbl-wrap"><table>
                <thead><tr><th>Account Name</th><th>Prop Firm</th><th>Status</th><th>Trades</th><th>Hedge P&L</th><th>Linked Expenses</th><th>Net For Company</th></tr></thead>
                <tbody>
                  {accountPL.sort((a, b) => (b.netForCompany || 0) - (a.netForCompany || 0)).map(a => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</td>
                      <td>{a.propFirm || "—"}</td>
                      <td><span className={`badge-tag ${badgeClass(a.status)}`}>{a.status || "—"}</span></td>
                      <td className="text-dim">{a.tradeCount}</td>
                      <td className={(a.brokerPL || 0) >= 0 ? "text-green" : "text-red"} style={{ fontWeight: 600 }}>{sign(a.brokerPL)}</td>
                      <td className="text-red">{a.linkedExpenses > 0 ? "−" + fmt(a.linkedExpenses) : "—"}</td>
                      <td className={(a.netForCompany || 0) >= 0 ? "text-green" : "text-red"} style={{ fontWeight: 800, fontSize: 15 }}>{sign(a.netForCompany)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid var(--green)" }}>
                    <td style={{ fontWeight: 700 }} colSpan={3}>TOTAL</td>
                    <td className="text-dim" style={{ fontWeight: 700 }}>{accountPL.reduce((s, a) => s + a.tradeCount, 0)}</td>
                    <td className={accountPL.reduce((s, a) => s + (a.brokerPL || 0), 0) >= 0 ? "text-green" : "text-red"} style={{ fontWeight: 700 }}>{sign(accountPL.reduce((s, a) => s + (a.brokerPL || 0), 0))}</td>
                    <td className="text-red" style={{ fontWeight: 700 }}>−{fmt(accountPL.reduce((s, a) => s + (a.linkedExpenses || 0), 0))}</td>
                    <td className={accountPL.reduce((s, a) => s + (a.netForCompany || 0), 0) >= 0 ? "text-green" : "text-red"} style={{ fontWeight: 800, fontSize: 16 }}>{sign(accountPL.reduce((s, a) => s + (a.netForCompany || 0), 0))}</td>
                  </tr>
                </tbody>
              </table></div>
            </div>
          </>
        )}

        {tab === "by-investor" && (
          <>
            <div className="section-h"><h2>Profit & Loss by Investor</h2><span className="count-pill">{investorPL.length} investors</span></div>
            <div className="card" style={{ padding: 0 }}>
              <div className="tbl-wrap"><table>
                <thead><tr><th>Investor</th><th>Capital</th><th>Evals</th><th>Hedge P&L</th><th>Withdrawals (Co)</th><th>Expenses</th><th>Net For Company</th><th>Investor Earned</th><th>ROI</th></tr></thead>
                <tbody>
                  {investorPL.sort((a, b) => (b.netCompanyProfit || 0) - (a.netCompanyProfit || 0)).map(i => (
                    <tr key={i.id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{i.name || "—"}</div>
                        <div className="text-dim" style={{ fontSize: 11 }}>{i.email}</div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{fmt(i.capital)}</td>
                      <td className="text-dim">{i.activeEvalCount}/{i.evaluationCount}</td>
                      <td className={(i.companyHedgeProfit || 0) >= 0 ? "text-green" : "text-red"} style={{ fontWeight: 600 }}>{sign(i.companyHedgeProfit)}</td>
                      <td className="text-green">{fmt(i.companyEarnedFromWithdrawals)}</td>
                      <td className="text-red">{i.relatedExpenses > 0 ? "−" + fmt(i.relatedExpenses) : "—"}</td>
                      <td className={(i.netCompanyProfit || 0) >= 0 ? "text-green" : "text-red"} style={{ fontWeight: 800, fontSize: 15 }}>{sign(i.netCompanyProfit)}</td>
                      <td className="text-green" style={{ fontWeight: 600 }}>{fmt(i.investorEarned)}</td>
                      <td className={(i.roi || 0) >= 0 ? "text-green" : "text-red"} style={{ fontWeight: 600 }}>{(i.roi || 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </>
        )}

        {tab === "investors" && (
          <div className="card" style={{ padding: 0 }}>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Name</th><th>Email</th><th>Capital</th><th>Start Date</th><th>Status</th></tr></thead>
              <tbody>
                {investors.map(i => (
                  <tr key={i.id}>
                    <td style={{ fontWeight: 600 }}>{i.name || "—"}</td>
                    <td className="text-dim text-mono" style={{ fontSize: 13 }}>{i.email || "—"}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(i.capital)}</td>
                    <td className="text-dim">{i.startDate || "—"}</td>
                    <td><span className={`badge-tag ${badgeClass(i.status)}`}>{i.status || "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}

        {tab === "evaluations" && (
          <div className="card" style={{ padding: 0 }}>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Client</th><th>Prop Firm</th><th>Size</th><th>Stage</th><th>Status</th><th>Budget</th><th>Net P&L</th></tr></thead>
              <tbody>
                {evaluations.map(e => (
                  <tr key={e.id}>
                    <td>{e.client || "—"}</td>
                    <td>{e.propFirm || "—"}</td>
                    <td className="text-mono">{e.accountSize || "—"}</td>
                    <td><span className={`badge-tag ${badgeClass(e.stage)}`}>{e.stage || "—"}</span></td>
                    <td><span className={`badge-tag ${badgeClass(e.status)}`}>{e.status || "—"}</span></td>
                    <td>{fmt(e.hedgingBudget)}</td>
                    <td className={(e.netPL || 0) >= 0 ? "text-green" : "text-red"} style={{ fontWeight: 700 }}>{sign(e.netPL)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}

        {tab === "withdrawals" && (
          <div className="card" style={{ padding: 0 }}>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Date</th><th>Client</th><th>Stage</th><th>Gross</th><th>Net</th><th>Company 50%</th><th>Investor 50%</th><th>Status</th></tr></thead>
              <tbody>
                {withdrawals.map(w => (
                  <tr key={w.id}>
                    <td className="text-mono text-dim">{w.date || "—"}</td>
                    <td>{w.client || "—"}</td>
                    <td><span className={`badge-tag ${badgeClass(w.stage)}`}>{w.stage || "—"}</span></td>
                    <td>{fmt(w.gross)}</td>
                    <td>{fmt(w.netReceived)}</td>
                    <td className="text-green" style={{ fontWeight: 600 }}>{fmt(w.company)}</td>
                    <td>{fmt(w.investor)}</td>
                    <td><span className={`badge-tag ${badgeClass(w.status)}`}>{w.status || "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}

        {tab === "b2f" && (
          <div className="card" style={{ padding: 0 }}>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Client</th><th>Size</th><th>Fee</th><th>Gross Profit</th><th>Net Profit</th><th>Status</th></tr></thead>
              <tbody>
                {b2f.map(b => (
                  <tr key={b.id}>
                    <td>{b.client || "—"}</td>
                    <td className="text-mono">{b.accountSize || "—"}</td>
                    <td>{fmt(b.fee)}</td>
                    <td>{fmt(b.gross)}</td>
                    <td className={(b.netProfit || 0) >= 0 ? "text-green" : "text-red"} style={{ fontWeight: 700 }}>{sign(b.netProfit)}</td>
                    <td><span className={`badge-tag ${badgeClass(b.status)}`}>{b.status || "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        )}

        {tab === "movements" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {movementTypes.map(t => (
                <button key={t} onClick={() => setMovementTypeFilter(t)} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--border)", background: movementTypeFilter === t ? "var(--green)" : "var(--bg-card)", color: movementTypeFilter === t ? "#000" : "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t === "all" ? "All Types" : t}</button>
              ))}
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div className="tbl-wrap"><table>
                <thead><tr><th>Date</th><th>Type</th><th>From</th><th>To</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {filteredMovements.map(m => (
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
            </div>
          </>
        )}

        {tab === "expenses" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {expenseTypes.map(t => (
                <button key={t} onClick={() => setExpenseTypeFilter(t)} style={{ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--border)", background: expenseTypeFilter === t ? "var(--green)" : "var(--bg-card)", color: expenseTypeFilter === t ? "#000" : "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{t === "all" ? "All Types" : t}</button>
              ))}
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div className="tbl-wrap"><table>
                <thead><tr><th>Date</th><th>Name</th><th>Type</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {filteredExpenses.map(e => (
                    <tr key={e.id}>
                      <td className="text-mono text-dim">{e.date || "—"}</td>
                      <td>{e.name || "—"}</td>
                      <td>{e.type || "—"}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(e.amount)}</td>
                      <td><span className={`badge-tag ${badgeClass(e.status)}`}>{e.status || "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
