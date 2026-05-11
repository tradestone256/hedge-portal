import { findInvestorByEmail, queryAll, getProp, notion } from "../../lib/notion";

export default async function handler(req, res) {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const investor = await findInvestorByEmail(email);
    if (!investor) return res.status(404).json({ error: "Investor not found. Your email is not registered." });

    const investorId = investor.id;
    const profile = {
      name: getProp(investor, "Investor Name"),
      email: getProp(investor, "Email"),
      phone: getProp(investor, "Phone"),
      capitalInvested: getProp(investor, "Capital Invested"),
      status: getProp(investor, "Status"),
      startDate: getProp(investor, "Start Date"),
    };

    // Evaluations
    const evaluations = await queryAll(
      process.env.NOTION_EVALUATIONS_DB,
      { property: "Investor", relation: { contains: investorId } }
    );
    const evalsClean = evaluations.map((e) => ({
      id: e.id,
      name: getProp(e, "Evaluation Name"),
      client: getProp(e, "Client Name"),
      stage: getProp(e, "Current Stage"),
      status: getProp(e, "Overall Status"),
      accountSize: getProp(e, "Account Size"),
      propFirm: getProp(e, "Prop Firm"),
      hedgingBudget: getProp(e, "Total Hedging Budget"),
      netPL: getProp(e, "Net Profit / Loss"),
      brokerPL: getProp(e, "Total Broker P&L"),
      startDate: getProp(e, "Start Date"),
    }));

    // Withdrawals
    const withdrawals = await queryAll(
      process.env.NOTION_WITHDRAWALS_DB,
      { property: "Investor", relation: { contains: investorId } }
    );
    const wdClean = withdrawals.map((w) => ({
      id: w.id,
      name: getProp(w, "Withdrawal Name"),
      date: getProp(w, "Withdrawal Date"),
      stage: getProp(w, "Funded Stage"),
      gross: getProp(w, "Gross Withdrawal $"),
      netReceived: getProp(w, "Net Received $"),
      investorShare: getProp(w, "Investor 50% $"),
      recoveryStatus: getProp(w, "Investment Fully Recovered"),
      status: getProp(w, "Withdrawal Status"),
    }));

    // Money movements
    const movements = await queryAll(
      process.env.NOTION_MOVEMENTS_DB,
      { property: "Linked Investor", relation: { contains: investorId } }
    );
    const movClean = movements.map((m) => ({
      id: m.id,
      desc: getProp(m, "Movement Description"),
      date: getProp(m, "Date"),
      type: getProp(m, "Movement Type"),
      from: getProp(m, "From Account"),
      to: getProp(m, "To Account"),
      amount: getProp(m, "Amount"),
      currency: getProp(m, "Currency"),
      status: getProp(m, "Status"),
    }));

    // Prop firm accounts — accounts linked to this investor's evaluations
    const allAccounts = await queryAll(process.env.NOTION_ACCOUNTS_DB);
    const evalIds = new Set(evalsClean.map(e => e.id));

    // Build map of evaluation -> account by checking each account's trades' evaluation links
    // But easier: get all trades, then map account->evaluation. Filter accounts touched by this investor's evals.
    const allTrades = await queryAll(process.env.NOTION_TRADES_DB);
    const accountIdsForInvestor = new Set();
    for (const t of allTrades) {
      const tEvals = getProp(t, "Evaluation");
      const tAccts = getProp(t, "Account");
      if (Array.isArray(tEvals) && Array.isArray(tAccts) && tEvals.some(id => evalIds.has(id))) {
        tAccts.forEach(id => accountIdsForInvestor.add(id));
      }
    }
    const accountsClean = allAccounts
      .filter(a => accountIdsForInvestor.has(a.id))
      .map(a => ({
        id: a.id,
        name: getProp(a, "Account Name"),
        propFirm: getProp(a, "Prop Firm"),
        status: getProp(a, "Status"),
        startingBalance: getProp(a, "Starting Balance"),
        totalPL: getProp(a, "Total P&L"),
        currentBalance: getProp(a, "Current Balance"),
      }));

    const totalPaidOut = wdClean.reduce((s, w) => s + (w.investorShare || 0), 0);
    const totalDeposited = movClean
      .filter((m) => m.type === "Investor Deposit")
      .reduce((s, m) => s + (m.amount || 0), 0);
    // Display balance per account type:
    // - Funded: P&L only (trader profit)
    // - Blown/Closed: 0
    // - In Challenge: starting + P&L
    const totalAccountBalance = accountsClean.reduce((s, a) => {
      const status = a.status || "";
      const pl = a.totalPL || 0;
      const start = a.startingBalance || 0;
      if (status === "Funded") return s + pl;
      if (status === "Blown" || status === "Closed") return s + 0;
      return s + start + pl;
    }, 0);

    // CRITICAL: Investor Net P&L is ONLY their share of funded withdrawals.
    // Challenge phase profits/losses (Phase 1, Phase 2) belong 100% to the company.
    // B2F profits also belong 100% to the company.
    // Investors only earn through the 50/50 split on funded account withdrawals.
    const investorNetPL = totalPaidOut; // What investor has actually received

    const totalBrokerPL = evalsClean.reduce((s, e) => s + (e.brokerPL || 0), 0);
    const activeEvalCount = evalsClean.filter(e => e.status === "In Progress" || e.status === "Active").length;
    const openPositions = 0;

    res.status(200).json({
      profile,
      evaluations: evalsClean,
      withdrawals: wdClean,
      movements: movClean,
      accounts: accountsClean,
      totals: {
        totalPaidOut,
        totalDeposited,
        totalAccountBalance,
        investorNetPL,
        totalBrokerPL,
        evaluationCount: evalsClean.length,
        activeEvalCount,
        openPositions,
        withdrawalCount: wdClean.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
