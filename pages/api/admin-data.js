import { queryAll, getProp } from "../../lib/notion";

export default async function handler(req, res) {
  const { adminEmail } = req.query;
  if (adminEmail !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    // Financial Accounts is optional — if env var is missing or integration not connected, skip gracefully
    let financialAccounts = [];
    if (process.env.NOTION_FINANCIAL_ACCOUNTS_DB) {
      try {
        financialAccounts = await queryAll(process.env.NOTION_FINANCIAL_ACCOUNTS_DB);
      } catch (e) {
        console.warn("Could not load financial accounts:", e.message);
        financialAccounts = [];
      }
    }

    const [investors, evaluations, withdrawals, movements, expenses, b2f, accounts, trades] = await Promise.all([
      queryAll(process.env.NOTION_INVESTORS_DB),
      queryAll(process.env.NOTION_EVALUATIONS_DB),
      queryAll(process.env.NOTION_WITHDRAWALS_DB),
      queryAll(process.env.NOTION_MOVEMENTS_DB),
      queryAll(process.env.NOTION_EXPENSES_DB),
      queryAll(process.env.NOTION_B2F_DB),
      queryAll(process.env.NOTION_ACCOUNTS_DB),
      queryAll(process.env.NOTION_TRADES_DB),
    ]);

    const investorList = investors.map((i) => ({
      id: i.id,
      name: getProp(i, "Investor Name"),
      email: getProp(i, "Email"),
      capital: getProp(i, "Capital Invested"),
      status: getProp(i, "Status"),
      startDate: getProp(i, "Start Date"),
    }));

    const evalList = evaluations.map((e) => ({
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
      investorIds: getProp(e, "Investor") || [],
    }));

    const wdList = withdrawals.map((w) => ({
      id: w.id,
      name: getProp(w, "Withdrawal Name"),
      date: getProp(w, "Withdrawal Date"),
      client: getProp(w, "Client Name"),
      stage: getProp(w, "Funded Stage"),
      gross: getProp(w, "Gross Withdrawal $"),
      netReceived: getProp(w, "Net Received $"),
      company: getProp(w, "Company 50% $"),
      investor: getProp(w, "Investor 50% $"),
      status: getProp(w, "Withdrawal Status"),
      investorIds: getProp(w, "Investor") || [],
    }));

    const movList = movements.map((m) => ({
      id: m.id,
      desc: getProp(m, "Movement Description"),
      date: getProp(m, "Date"),
      type: getProp(m, "Movement Type"),
      from: getProp(m, "From Account"),
      to: getProp(m, "To Account"),
      amount: getProp(m, "Amount"),
      currency: getProp(m, "Currency"),
      status: getProp(m, "Status"),
      fromFinancialIds: getProp(m, "From Financial Account") || [],
      toFinancialIds: getProp(m, "To Financial Account") || [],
    }));

    const expList = expenses.map((e) => ({
      id: e.id,
      name: getProp(e, "Expense Name"),
      type: getProp(e, "Expense Type"),
      amount: getProp(e, "Amount"),
      date: getProp(e, "Date Paid"),
      paymentMethod: getProp(e, "Payment Method"),
      status: getProp(e, "Status"),
      evaluationIds: getProp(e, "Linked Evaluation") || [],
      paidFromIds: getProp(e, "Paid From") || [],
      chargeToCompany: getProp(e, "Charge to Company") === true,
    }));

    const b2fList = b2f.map((b) => ({
      id: b.id,
      name: getProp(b, "B2F Name"),
      client: getProp(b, "Client Name"),
      accountSize: getProp(b, "Account Size"),
      fee: getProp(b, "B2F Fee Paid"),
      gross: getProp(b, "Gross Profit from B2F Account"),
      netProfit: getProp(b, "Net Profit After Fees"),
      date: getProp(b, "Date Purchased"),
      status: getProp(b, "B2F Status"),
    }));

    const accList = accounts.map((a) => ({
      id: a.id,
      name: getProp(a, "Account Name"),
      propFirm: getProp(a, "Prop Firm"),
      status: getProp(a, "Status"),
      startingBalance: getProp(a, "Starting Balance"),
      totalPL: getProp(a, "Total P&L"),
      currentBalance: getProp(a, "Current Balance"),
    }));

    const tradeList = trades.map((t) => ({
      id: t.id,
      name: getProp(t, "Trade Name"),
      date: getProp(t, "Trade Date"),
      phase: getProp(t, "Phase"),
      propPL: getProp(t, "Prop Side P&L $"),
      brokerPL: getProp(t, "Broker Side P&L $"),
      outcome: getProp(t, "Outcome"),
      evaluationIds: getProp(t, "Evaluation") || [],
      accountIds: getProp(t, "Account") || [],
    }));

    // ========== COMPANY P&L (new model) ==========
    // RULES:
    // - Company put up no cash of its own. All hedging comes from investor capital.
    // - Company INCOME sources (real cash that goes to company):
    //     * Withdrawal income (company 50%)
    //     * B2F net profit (100%)
    //     * Hedge net P&L per evaluation: ONLY counted when an evaluation is fully resolved
    //       and the net result is positive (capital is returned to investor on a failed eval).
    //       For simplicity, we count realized broker P&L from completed evaluations only.
    // - Company EXPENSES (reduce company cash):
    //     * ONLY expenses marked "Charge to Company"
    //     * Other expenses come out of investor capital, not company
    // - Net Company Profit is floored at $0
    const totalCapital = investorList.reduce((s, i) => s + (i.capital || 0), 0);

    // All-time broker P&L (informational — for the hedge calendar & accounting)
    const challengeTradesPL = tradeList.reduce((s, t) => s + (t.brokerPL || 0), 0);

    // Realized hedge profit for the COMPANY:
    // Use "Net For Company" per account = Broker P&L − Linked Expenses (challenge fees, etc.)
    // Only count CLOSED accounts where Net For Company is POSITIVE.
    // Losing closed accounts contribute $0 (investor capital absorbs the loss).
    // Active/Evaluation accounts don't count yet (still floating).
    const accountIdToTrades = {};
    for (const t of tradeList) {
      for (const aId of t.accountIds) {
        if (!accountIdToTrades[aId]) accountIdToTrades[aId] = [];
        accountIdToTrades[aId].push(t);
      }
    }
    // Build evalIdToAccountIds early so we can compute linked expenses per account
    const _evalIdToAccountIds = {};
    for (const t of tradeList) {
      for (const eId of t.evaluationIds) {
        if (!_evalIdToAccountIds[eId]) _evalIdToAccountIds[eId] = new Set();
        t.accountIds.forEach(aId => _evalIdToAccountIds[eId].add(aId));
      }
    }
    const _paidExpensesForCalc = expList.filter(e => e.status === "Paid");
    const closedAccountStatuses = new Set(["Closed", "Blown", "Funded"]);
    let realizedHedgeProfit = 0;
    for (const a of accList) {
      if (!closedAccountStatuses.has(a.status)) continue;
      const trades = accountIdToTrades[a.id] || [];
      const brokerPL = trades.reduce((s, t) => s + (t.brokerPL || 0), 0);
      // Compute linked expenses for this account (same logic as "By Account" tab)
      let linkedExpenses = 0;
      for (const exp of _paidExpensesForCalc) {
        for (const eId of exp.evaluationIds) {
          if (_evalIdToAccountIds[eId] && _evalIdToAccountIds[eId].has(a.id)) {
            linkedExpenses += (exp.amount || 0);
            break;
          }
        }
      }
      const netForCompany = brokerPL - linkedExpenses;
      if (netForCompany > 0) realizedHedgeProfit += netForCompany;
    }

    const completedWithdrawals = wdList.filter(w => w.status === "Completed" || w.status === "Paid");
    const withdrawalIncome = completedWithdrawals.reduce((s, w) => s + (w.company || 0), 0);
    const withdrawalToInvestors = completedWithdrawals.reduce((s, w) => s + (w.investor || 0), 0);

    const completedB2f = b2fList.filter(b => b.status === "Completed" || b.status === "Paid");
    const b2fIncome = completedB2f.reduce((s, b) => s + (b.netProfit || 0), 0);

    const paidExpenses = expList.filter(e => e.status === "Paid");
    const totalExpenses = paidExpenses.reduce((s, e) => s + (e.amount || 0), 0);

    // Only expenses marked "Charge to Company" reduce company profit
    const companyChargedExpenses = paidExpenses
      .filter(e => e.chargeToCompany)
      .reduce((s, e) => s + (e.amount || 0), 0);
    const investorChargedExpenses = paidExpenses
      .filter(e => !e.chargeToCompany)
      .reduce((s, e) => s + (e.amount || 0), 0);

    const pendingExpenses = expList.filter(e => e.status === "Pending").reduce((s, e) => s + (e.amount || 0), 0);
    const refundedExpenses = expList.filter(e => e.status === "Refunded").reduce((s, e) => s + (e.amount || 0), 0);

    // Company income = withdrawal share + b2f profit + realized hedge profit (closed positive evals)
    const grossCompanyIncome = withdrawalIncome + b2fIncome + realizedHedgeProfit;
    // Company expenses (cash out) = only those ticked "Charge to Company"
    const grossCompanyExpenses = companyChargedExpenses;
    // Net profit = income − company-charged expenses, floored at $0 (company put in nothing)
    const rawProfit = grossCompanyIncome - grossCompanyExpenses;
    const netCompanyProfit = Math.max(0, rawProfit);

    const expensesByType = {};
    for (const e of paidExpenses) {
      const t = e.type || "Other";
      expensesByType[t] = (expensesByType[t] || 0) + (e.amount || 0);
    }

    const movementsByType = {};
    for (const m of movList.filter(m => m.status === "Completed")) {
      const t = m.type || "Other";
      movementsByType[t] = (movementsByType[t] || 0) + (m.amount || 0);
    }

    // ========== PER-ACCOUNT P&L ==========
    // accountIdToTrades is already built above (used for realized hedge profit)
    const evalIdToAccountIds = {};
    for (const t of tradeList) {
      for (const eId of t.evaluationIds) {
        if (!evalIdToAccountIds[eId]) evalIdToAccountIds[eId] = new Set();
        t.accountIds.forEach(aId => evalIdToAccountIds[eId].add(aId));
      }
    }
    const accountPL = accList.map(a => {
      const accTrades = accountIdToTrades[a.id] || [];
      const propSide = accTrades.reduce((s, t) => s + (t.propPL || 0), 0);
      const brokerSide = accTrades.reduce((s, t) => s + (t.brokerPL || 0), 0);
      let linkedExpenses = 0;
      for (const exp of paidExpenses) {
        for (const eId of exp.evaluationIds) {
          if (evalIdToAccountIds[eId] && evalIdToAccountIds[eId].has(a.id)) {
            linkedExpenses += (exp.amount || 0);
            break;
          }
        }
      }
      const netForCompany = brokerSide - linkedExpenses;
      return {
        id: a.id,
        name: a.name,
        propFirm: a.propFirm,
        status: a.status,
        startingBalance: a.startingBalance,
        propPL: propSide,
        brokerPL: brokerSide,
        linkedExpenses,
        netForCompany,
        tradeCount: accTrades.length,
      };
    });

    // ========== PER-INVESTOR P&L ==========
    const investorPL = investorList.map(inv => {
      const myEvals = evalList.filter(e => (e.investorIds || []).includes(inv.id));
      const myEvalIds = new Set(myEvals.map(e => e.id));

      const myWithdrawals = completedWithdrawals.filter(w => (w.investorIds || []).includes(inv.id));
      const investorEarned = myWithdrawals.reduce((s, w) => s + (w.investor || 0), 0);
      const companyEarnedFromInvestor = myWithdrawals.reduce((s, w) => s + (w.company || 0), 0);

      const myTrades = tradeList.filter(t => t.evaluationIds.some(eId => myEvalIds.has(eId)));
      const myBrokerPL = myTrades.reduce((s, t) => s + (t.brokerPL || 0), 0);

      const myExpenses = paidExpenses
        .filter(exp => exp.evaluationIds.some(eId => myEvalIds.has(eId)))
        .reduce((s, e) => s + (e.amount || 0), 0);

      const totalCompanyProfitFromInvestor = myBrokerPL + companyEarnedFromInvestor - myExpenses;
      const roi = (inv.capital || 0) > 0 ? (totalCompanyProfitFromInvestor / inv.capital) * 100 : 0;

      return {
        id: inv.id,
        name: inv.name,
        email: inv.email,
        capital: inv.capital,
        status: inv.status,
        evaluationCount: myEvals.length,
        activeEvalCount: myEvals.filter(e => e.status === "In Progress" || e.status === "Active").length,
        investorEarned,
        companyEarnedFromWithdrawals: companyEarnedFromInvestor,
        companyHedgeProfit: myBrokerPL,
        relatedExpenses: myExpenses,
        netCompanyProfit: totalCompanyProfitFromInvestor,
        roi,
      };
    });

    // ========== DAILY P&L ==========
    // dailyData = full P&L (income + expenses, all sources) — for the main P&L Calendar
    // hedgeDailyData = ONLY broker P&L from trades — for the new Hedge Calendar
    const dailyData = {};
    const hedgeDailyData = {};
    const ensureDay = (map, key) => {
      if (!map[key]) map[key] = { income: 0, expenses: 0, byCategory: {}, count: 0 };
      return map[key];
    };
    const addToDay = (map, dateStr, amount, category) => {
      if (!dateStr || !amount) return;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const day = ensureDay(map, key);
      day.count++;
      if (amount > 0) day.income += amount;
      else day.expenses += Math.abs(amount);
      day.byCategory[category] = (day.byCategory[category] || 0) + amount;
    };
    for (const t of tradeList) {
      if (t.brokerPL) {
        addToDay(dailyData, t.date, t.brokerPL, "Hedge P&L");
        addToDay(hedgeDailyData, t.date, t.brokerPL, "Hedge P&L");
      }
    }
    for (const w of completedWithdrawals) {
      if (w.company) addToDay(dailyData, w.date, w.company, "Withdrawal Profit");
    }
    for (const b of completedB2f) {
      if (b.netProfit) addToDay(dailyData, b.date, b.netProfit, "B2F Profit");
    }
    for (const e of paidExpenses) {
      if (e.amount) addToDay(dailyData, e.date, -(e.amount), e.type || "Other Expense");
    }

    const activeEvals = evalList.filter((e) => e.status === "In Progress" || e.status === "Active").length;

    // ========== FINANCIAL ACCOUNTS — Real-time balances ==========
    // Balance = Starting Balance
    //          + Sum of completed movements coming INTO this account
    //          − Sum of completed movements going OUT of this account
    //          − Sum of paid expenses paid FROM this account
    //          + Sum of all trade Broker Side P&L (only for accounts of type "Broker (Exness)")
    //
    // Why: every trade you log already happened on the broker, so the broker balance
    // should reflect those wins/losses automatically without a separate ledger entry.
    const financialAccountList = financialAccounts.map(fa => {
      const id = fa.id;
      const name = getProp(fa, "Account Name");
      const accountType = getProp(fa, "Account Type");
      const startingBalance = getProp(fa, "Starting Balance") || 0;
      const currency = getProp(fa, "Currency");
      const status = getProp(fa, "Status");
      const dateOpened = getProp(fa, "Date Opened");
      const isBroker = accountType === "Broker (Exness)";

      // Inflows from movements
      const inflows = movList
        .filter(m => (m.status === "Completed") && (m.toFinancialIds || []).includes(id))
        .reduce((s, m) => s + (m.amount || 0), 0);
      // Outflows from movements
      const outflows = movList
        .filter(m => (m.status === "Completed") && (m.fromFinancialIds || []).includes(id))
        .reduce((s, m) => s + (m.amount || 0), 0);
      // Expenses paid from this account
      const expenseOutflows = expList
        .filter(e => e.status === "Paid" && (e.paidFromIds || []).includes(id))
        .reduce((s, e) => s + (e.amount || 0), 0);

      // Trade P&L (broker accounts only)
      // Each trade's brokerPL adds to broker balance — wins increase it, losses decrease it
      const tradePL = isBroker ? tradeList.reduce((s, t) => s + (t.brokerPL || 0), 0) : 0;
      const tradeWins = isBroker ? tradeList.filter(t => (t.brokerPL || 0) > 0).reduce((s, t) => s + t.brokerPL, 0) : 0;
      const tradeLosses = isBroker ? Math.abs(tradeList.filter(t => (t.brokerPL || 0) < 0).reduce((s, t) => s + t.brokerPL, 0)) : 0;

      const currentBalance = startingBalance + inflows - outflows - expenseOutflows + tradePL;

      // Recent activity for this account
      const recentActivity = [];
      for (const m of movList.filter(m => (m.toFinancialIds || []).includes(id) || (m.fromFinancialIds || []).includes(id))) {
        const isIncoming = (m.toFinancialIds || []).includes(id);
        recentActivity.push({
          date: m.date,
          description: m.desc || m.type,
          type: m.type,
          direction: isIncoming ? "in" : "out",
          amount: m.amount,
          status: m.status,
          source: "movement",
        });
      }
      for (const e of expList.filter(e => (e.paidFromIds || []).includes(id))) {
        recentActivity.push({
          date: e.date,
          description: e.name,
          type: e.type,
          direction: "out",
          amount: e.amount,
          status: e.status,
          source: "expense",
        });
      }
      // Add trades to broker activity (one row per trade)
      if (isBroker) {
        for (const t of tradeList) {
          if (!t.brokerPL) continue;
          recentActivity.push({
            date: t.date,
            description: t.name || `Trade · ${t.phase || ""}`,
            type: "Trade P&L",
            direction: t.brokerPL > 0 ? "in" : "out",
            amount: Math.abs(t.brokerPL),
            status: "Completed",
            source: "trade",
          });
        }
      }
      recentActivity.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      return {
        id,
        name,
        accountType,
        startingBalance,
        currency,
        status,
        dateOpened,
        inflows,
        outflows,
        expenseOutflows,
        tradePL,
        tradeWins,
        tradeLosses,
        isBroker,
        currentBalance,
        activityCount: recentActivity.length,
        recentActivity: recentActivity.slice(0, 50),
      };
    });

    res.status(200).json({
      investors: investorList,
      evaluations: evalList,
      withdrawals: wdList,
      movements: movList,
      expenses: expList,
      b2f: b2fList,
      accounts: accList,
      accountPL,
      investorPL,
      financialAccounts: financialAccountList,
      totals: {
        totalCapital,
        challengeTradesPL,
        realizedHedgeProfit,
        withdrawalIncome,
        b2fIncome,
        grossCompanyIncome,
        grossCompanyExpenses,
        companyChargedExpenses,
        investorChargedExpenses,
        netCompanyProfit,
        totalExpenses,
        pendingExpenses,
        refundedExpenses,
        withdrawalToInvestors,
        activeEvals,
        investorCount: investorList.length,
        expensesByType,
        movementsByType,
        dailyData,
        hedgeDailyData,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
