export interface FdcMetric {
  label: string;
  value: string;
  detail: string;
  trend: string;
}

export interface FdcFinancialYear {
  year: string;
  revenue: number;
  arr: number;
  grossMargin: number;
  operatingIncome: number;
  netRetention: number;
}

export interface FdcAccount {
  name: string;
  segment: string;
  arr: string;
  renewal: string;
  health: "Green" | "Yellow" | "Red";
  note: string;
}

export interface FdcIncident {
  date: string;
  title: string;
  severity: string;
  duration: string;
  impact: string;
  resolution: string;
}

export interface FdcDocumentPage {
  title: string;
  lines: string[];
}

export interface FdcDocument {
  fileName: string;
  title: string;
  category: string;
  owner: string;
  updated: string;
  summary: string;
  pages: FdcDocumentPage[];
}

export const fdcCompany = {
  name: "FDC",
  legalName: "Fake Demo Company, Inc.",
  description:
    "FDC builds operations software for multi-location retail and field-service teams. Its platform connects inventory, dispatch, purchasing, and finance data so operators can spot problems and act from one place.",
  founded: "2018",
  headquarters: "Denver, Colorado",
  employees: 286,
  customers: 428,
  products: ["RelayOS", "LedgerLens", "FieldSync"],
  stage: "Series C",
  fiscalYearEnd: "December 31",
} as const;

export const fdcMetrics: FdcMetric[] = [
  {
    label: "Annual recurring revenue",
    value: "$82.6M",
    detail: "Q1 2026 exit ARR",
    trend: "+28% YoY",
  },
  {
    label: "Q1 revenue",
    value: "$19.8M",
    detail: "Against $19.2M plan",
    trend: "+24% YoY",
  },
  {
    label: "Gross margin",
    value: "76%",
    detail: "Up 2 points YoY",
    trend: "Above plan",
  },
  {
    label: "Net revenue retention",
    value: "123%",
    detail: "Enterprise cohort: 129%",
    trend: "+5 points YoY",
  },
];

export const fdcFinancials: FdcFinancialYear[] = [
  {
    year: "FY2022",
    revenue: 18.4,
    arr: 20.1,
    grossMargin: 61,
    operatingIncome: -8.1,
    netRetention: 108,
  },
  {
    year: "FY2023",
    revenue: 31.7,
    arr: 34.6,
    grossMargin: 66,
    operatingIncome: -5.4,
    netRetention: 113,
  },
  {
    year: "FY2024",
    revenue: 48.9,
    arr: 52.8,
    grossMargin: 71,
    operatingIncome: -1.8,
    netRetention: 118,
  },
  {
    year: "FY2025",
    revenue: 68.4,
    arr: 76.2,
    grossMargin: 74,
    operatingIncome: 4.6,
    netRetention: 121,
  },
];

export const fdcAccounts: FdcAccount[] = [
  {
    name: "Lighthouse Grocers",
    segment: "Enterprise",
    arr: "$3.2M",
    renewal: "Sep 30, 2026",
    health: "Green",
    note: "Expanding LedgerLens to 420 stores.",
  },
  {
    name: "Northstar Logistics",
    segment: "Enterprise",
    arr: "$2.7M",
    renewal: "Jul 31, 2026",
    health: "Yellow",
    note: "Executive sponsor changed; value review booked for June 18.",
  },
  {
    name: "Altitude Home Services",
    segment: "Enterprise",
    arr: "$2.4M",
    renewal: "Nov 15, 2026",
    health: "Yellow",
    note: "FieldSync mobile adoption is 54% versus 70% target.",
  },
  {
    name: "BluePeak Foods",
    segment: "Mid-market",
    arr: "$1.9M",
    renewal: "Jan 31, 2027",
    health: "Green",
    note: "Reference customer for inventory forecasting.",
  },
];

export const fdcIncidents: FdcIncident[] = [
  {
    date: "Apr 17, 2026",
    title: "Inventory sync latency",
    severity: "SEV-2",
    duration: "47 min",
    impact: "83 customers saw updates delayed by up to 21 minutes; no data was lost.",
    resolution:
      "Rebalanced the queue partitions and added automatic hot-partition detection.",
  },
  {
    date: "Feb 3, 2026",
    title: "Authentication degradation",
    severity: "SEV-2",
    duration: "19 min",
    impact: "11% of login attempts failed in the US-West region.",
    resolution:
      "Replaced an expired signing certificate and added a 30-day rotation alert.",
  },
  {
    date: "Nov 21, 2025",
    title: "Analytics data freshness",
    severity: "SEV-3",
    duration: "2 hr 14 min",
    impact: "126 customers saw dashboards lag by one reporting cycle.",
    resolution:
      "Restarted the warehouse job and moved freshness checks ahead of publication.",
  },
];

export const fdcQuestions = [
  "How did FDC's revenue and operating income change from 2024 to 2025?",
  "Which incident affected the most customers, and what did engineering change?",
  "Why is the Northstar Logistics renewal at risk?",
  "What are FDC's largest Q2 sales opportunities?",
  "Which product commitments are scheduled for the second half of 2026?",
  "What are the biggest security and compliance gaps?",
];

export const fdcDocuments: FdcDocument[] = [
  {
    fileName: "FDC Company Overview and Strategy.pdf",
    title: "Company overview & strategy",
    category: "Strategy",
    owner: "Office of the CEO",
    updated: "May 28, 2026",
    summary: "Business model, products, market, operating priorities, and board targets.",
    pages: [
      {
        title: "Company profile",
        lines: [
          "Fake Demo Company, Inc. (FDC) is a Denver-based B2B software company founded in 2018.",
          "FDC helps multi-location retail and field-service businesses connect inventory, dispatch, purchasing, and finance operations.",
          "The company has 286 employees and 428 active customers as of March 31, 2026.",
          "FDC is a Series C company. The fiscal year ends on December 31.",
          "",
          "PRODUCTS",
          "RelayOS: workflow and inventory orchestration for distributed operations.",
          "LedgerLens: purchasing, spend controls, and financial variance analytics.",
          "FieldSync: technician dispatch, mobile work orders, and route coordination.",
          "",
          "CUSTOMER PROFILE",
          "Core customers operate 25 to 1,500 locations and have complex frontline workflows.",
          "Revenue mix is 75% North America, 18% EMEA, and 7% APAC.",
          "No single customer represents more than 4.2% of ARR. The top ten represent 24%.",
        ],
      },
      {
        title: "2026 strategy and board targets",
        lines: [
          "FDC's 2026 strategy is to become the operating system for distributed service businesses.",
          "",
          "BOARD TARGETS",
          "1. Reach $100 million in ARR by the end of Q4 2026.",
          "2. Keep gross margin at or above 75% while scaling AI-assisted workflows.",
          "3. Grow EMEA from 18% to 23% of revenue without lowering company-wide NRR below 120%.",
          "4. Deliver positive operating cash flow for the full fiscal year.",
          "",
          "TOP COMPANY PRIORITIES",
          "Improve enterprise implementation time from 74 days to below 55 days.",
          "Launch EU data residency by September 2026.",
          "Increase FieldSync weekly active usage from 62% to 72%.",
          "Reduce preventable SEV-2 incidents to fewer than one per quarter.",
          "",
          "PRIMARY RISKS",
          "Enterprise implementation capacity, EMEA hiring speed, and cloud inference cost.",
        ],
      },
    ],
  },
  {
    fileName: "FDC FY2025 Annual Report.pdf",
    title: "FY2025 annual report",
    category: "Finance",
    owner: "Finance",
    updated: "Feb 12, 2026",
    summary: "Four-year financial history, 2025 performance, cash position, and revenue mix.",
    pages: [
      {
        title: "Four-year financial summary",
        lines: [
          "All currency values are in USD millions unless otherwise stated.",
          "",
          "YEAR | REVENUE | EXIT ARR | GROSS MARGIN | OPERATING INCOME | NRR",
          "FY2022 | 18.4 | 20.1 | 61% | -8.1 | 108%",
          "FY2023 | 31.7 | 34.6 | 66% | -5.4 | 113%",
          "FY2024 | 48.9 | 52.8 | 71% | -1.8 | 118%",
          "FY2025 | 68.4 | 76.2 | 74% | 4.6 | 121%",
          "",
          "FY2025 revenue grew 39.9% from FY2024.",
          "FY2024 revenue was $48.9 million.",
          "FY2025 revenue was $68.4 million.",
          "Revenue increased by $19.5 million.",
          "FY2024 operating income was a loss of $1.8 million.",
          "FY2025 operating income was a profit of $4.6 million.",
          "Operating income improved by $6.4 million.",
          "FDC reached positive annual operating income for the first time in FY2025.",
          "Gross margin improved three percentage points due to hosting optimization and pricing.",
          "Year-end cash and short-term investments were $41.8 million.",
        ],
      },
      {
        title: "FY2025 revenue composition",
        lines: [
          "Subscription revenue was $61.7 million, or 90.2% of total revenue.",
          "Professional services revenue was $6.7 million, or 9.8% of total revenue.",
          "",
          "PRODUCT ARR MIX",
          "RelayOS: $41.1 million, 54% of exit ARR.",
          "LedgerLens: $20.6 million, 27% of exit ARR.",
          "FieldSync: $14.5 million, 19% of exit ARR.",
          "",
          "REGIONAL REVENUE MIX",
          "North America: 75%. EMEA: 18%. APAC: 7%.",
          "",
          "OPERATING EXPENSE",
          "Research and development: $20.8 million.",
          "Sales and marketing: $24.1 million.",
          "General and administrative: $12.6 million.",
          "Cloud infrastructure and AI inference were the largest cost-of-revenue items.",
        ],
      },
    ],
  },
  {
    fileName: "FDC Q1 2026 Board Metrics.pdf",
    title: "Q1 2026 board metrics",
    category: "Finance",
    owner: "Finance & Strategy",
    updated: "Apr 24, 2026",
    summary: "Quarterly performance versus plan, forecast, unit economics, and board actions.",
    pages: [
      {
        title: "Q1 2026 scorecard",
        lines: [
          "Q1 2026 revenue was $19.8 million versus $19.2 million plan and $16.0 million in Q1 2025.",
          "Exit ARR was $82.6 million, up 28% year over year.",
          "Gross margin was 76%, two points above Q1 2025 and one point above plan.",
          "Net revenue retention was 123%; enterprise NRR was 129%.",
          "Operating income was $1.9 million versus $0.8 million plan.",
          "Operating cash flow was $2.6 million.",
          "FDC ended the quarter with 428 customers and 286 employees.",
          "",
          "CUSTOMER METRICS",
          "Gross logo retention was 94.7%.",
          "Average enterprise ARR was $612,000.",
          "Median enterprise implementation time improved from 74 to 63 days.",
        ],
      },
      {
        title: "Outlook and board actions",
        lines: [
          "FY2026 revenue forecast is $88.0 million to $91.0 million.",
          "Management expects Q2 exit ARR between $88.0 million and $89.5 million.",
          "The internal target remains $100 million ARR by Q4 2026.",
          "",
          "FORECAST ASSUMPTIONS",
          "Enterprise pipeline conversion of 24% and gross logo retention above 94%.",
          "EMEA contributes at least $4.8 million of new ARR during 2026.",
          "Gross margin remains between 75% and 77%.",
          "",
          "BOARD ACTIONS",
          "Approved 36 net new hires, weighted toward implementation and EMEA sales.",
          "Approved up to $3.5 million for EU data residency and security certification.",
          "Requested a monthly review of Northstar Logistics and other yellow renewals.",
        ],
      },
    ],
  },
  {
    fileName: "FDC Sales Pipeline and Customer Health.pdf",
    title: "Sales pipeline & customer health",
    category: "Revenue",
    owner: "Revenue Operations",
    updated: "May 31, 2026",
    summary: "Late-stage opportunities, renewal health, customer concentration, and expansion.",
    pages: [
      {
        title: "Largest Q2 2026 sales opportunities",
        lines: [
          "Total qualified pipeline is $27.3 million in ARR. Weighted pipeline is $12.8 million.",
          "",
          "ACCOUNT | STAGE | ARR | PROBABILITY | WEIGHTED VALUE | TARGET CLOSE",
          "Northstar Fleet Expansion | Procurement | $2.4M | 75% | $1.80M | Jun 28",
          "BluePeak Foods Europe | Security review | $1.6M | 70% | $1.12M | Jun 30",
          "Helio Health Services | Solution validation | $1.1M | 60% | $0.66M | Jul 18",
          "Redwood Auto Group | Business case | $0.9M | 50% | $0.45M | Jul 31",
          "Solstice Markets | Discovery | $0.8M | 30% | $0.24M | Aug 15",
          "",
          "The Northstar Fleet Expansion has the highest weighted value at $1.80 million.",
          "The main Q2 pipeline risk is delayed security review for BluePeak Foods Europe.",
        ],
      },
      {
        title: "Customer health and renewals",
        lines: [
          "Lighthouse Grocers: $3.2M ARR, green, renews Sep 30. Expanding LedgerLens to 420 stores.",
          "Northstar Logistics: $2.7M ARR, yellow, renews Jul 31.",
          "Northstar risk: its executive sponsor left in May and weekly active use fell from 78% to 64%.",
          "A value review with Northstar's new COO is scheduled for June 18.",
          "Altitude Home Services: $2.4M ARR, yellow, renews Nov 15.",
          "Altitude risk: FieldSync mobile adoption is 54% versus a 70% target.",
          "BluePeak Foods: $1.9M ARR, green, renews Jan 31, 2027.",
          "",
          "There are $8.6 million of renewals due in Q3 2026.",
          "Yellow-account ARR totals $7.1 million. Red-account ARR totals $0.6 million.",
          "No customer exceeds 4.2% of company ARR.",
        ],
      },
    ],
  },
  {
    fileName: "FDC Product and Engineering Roadmap.pdf",
    title: "Product & engineering roadmap",
    category: "Product",
    owner: "Product & Engineering",
    updated: "May 22, 2026",
    summary: "Roadmap commitments, adoption goals, platform investment, and delivery risks.",
    pages: [
      {
        title: "2026 product roadmap",
        lines: [
          "Q2 2026 commitments:",
          "RelayOS route optimization general availability on June 24.",
          "LedgerLens anomaly explanations beta on June 17.",
          "Implementation template library with ten industry playbooks on June 28.",
          "",
          "Q3 2026 commitments:",
          "FieldSync offline mobile mode in August.",
          "EU data residency in September.",
          "Customer-configurable approval policies in September.",
          "",
          "Q4 2026 commitments:",
          "Supplier follow-up agent in October.",
          "Cross-product command center in November.",
          "Predictive staffing recommendations in December.",
          "",
          "The second half of 2026 includes all Q3 and Q4 commitments listed above.",
          "The company will not launch autonomous purchasing approval in 2026.",
        ],
      },
      {
        title: "Engineering capacity and risk",
        lines: [
          "Engineering has 92 employees across product engineering, infrastructure, data, and security.",
          "Planned 2026 engineering hires: 14, including five platform and four mobile roles.",
          "Current roadmap confidence is 82%.",
          "",
          "TOP DELIVERY RISKS",
          "EU data residency depends on completing tenant migration tooling by July 31.",
          "Offline mobile mode has unresolved conflict-handling edge cases.",
          "Inference spend is 11% above plan due to LedgerLens explanation usage.",
          "",
          "RELIABILITY TARGETS",
          "99.95% monthly availability for RelayOS and LedgerLens.",
          "Fewer than one preventable SEV-2 incident per quarter.",
          "Reduce p95 inventory sync delay from 4.8 seconds to below 3 seconds.",
        ],
      },
    ],
  },
  {
    fileName: "FDC Operations and Incident Log.pdf",
    title: "Operations & incident log",
    category: "Operations",
    owner: "Site Reliability",
    updated: "May 20, 2026",
    summary: "Recent incidents, customer impact, root causes, corrective actions, and SLOs.",
    pages: [
      {
        title: "2026 incident log",
        lines: [
          "April 17, 2026 - SEV-2 Inventory sync latency - 47 minutes.",
          "Impact: 83 customers saw inventory updates delayed by up to 21 minutes. No data was lost.",
          "Root cause: uneven queue partition load after a high-volume customer import.",
          "Resolution: rebalanced partitions and added automatic hot-partition detection.",
          "Follow-up owner: Priya Raman. Completed May 15.",
          "",
          "February 3, 2026 - SEV-2 Authentication degradation - 19 minutes.",
          "Impact: 11% of login attempts failed in the US-West region.",
          "Root cause: an expired signing certificate was not replaced after rotation automation failed.",
          "Resolution: replaced the certificate and added a 30-day rotation alert.",
          "Follow-up owner: Theo Grant. Completed February 10.",
        ],
      },
      {
        title: "Prior incident and service levels",
        lines: [
          "November 21, 2025 - SEV-3 Analytics data freshness - 2 hours 14 minutes.",
          "Impact: 126 customers saw dashboards lag by one reporting cycle.",
          "Root cause: a warehouse job retried indefinitely after a schema change.",
          "Resolution: restarted the job and moved freshness checks ahead of dashboard publication.",
          "Follow-up owner: Mara Chen. Completed December 5.",
          "",
          "The analytics freshness incident affected the most customers: 126.",
          "The inventory latency incident was the most severe 2026 customer-facing data incident.",
          "",
          "Q1 2026 SERVICE LEVELS",
          "RelayOS availability: 99.96%. LedgerLens availability: 99.98%.",
          "Inventory sync p95 latency: 4.8 seconds. API p95 latency: 310 milliseconds.",
          "Mean time to recovery for SEV-2 incidents: 33 minutes.",
        ],
      },
    ],
  },
  {
    fileName: "FDC People and Hiring Plan.pdf",
    title: "People & hiring plan",
    category: "People",
    owner: "People Operations",
    updated: "May 15, 2026",
    summary: "Headcount, hiring plan, attrition, engagement, location mix, and leadership gaps.",
    pages: [
      {
        title: "Workforce snapshot",
        lines: [
          "FDC has 286 employees as of March 31, 2026.",
          "",
          "FUNCTION | HEADCOUNT",
          "Engineering and Product | 112",
          "Sales and Marketing | 68",
          "Customer Success and Implementation | 54",
          "General and Administrative | 36",
          "Security and IT | 16",
          "",
          "Location mix: 46% remote US, 31% Denver, 14% other US offices, 9% international.",
          "Trailing twelve-month voluntary attrition is 9.2%.",
          "The April engagement score was 81 out of 100.",
          "Manager effectiveness scored 84; career growth scored 68, the lowest dimension.",
        ],
      },
      {
        title: "2026 hiring plan",
        lines: [
          "The board approved 36 net new hires for the remainder of 2026.",
          "Planned hires: 14 Engineering, 8 Customer Success and Implementation, 8 EMEA Sales, 4 Security, and 2 Finance.",
          "Priority roles are VP EMEA, Director of Implementation, Staff Mobile Engineer, and Security Compliance Lead.",
          "The VP EMEA role has been open for 74 days and is the largest leadership hiring risk.",
          "",
          "PEOPLE ACTIONS",
          "Launch a technical career framework by July 15.",
          "Increase implementation onboarding capacity before the September demand peak.",
          "Run manager training for all new managers in Q3.",
          "Keep regrettable attrition below 6% for the full year.",
        ],
      },
    ],
  },
  {
    fileName: "FDC Security and Compliance Register.pdf",
    title: "Security & compliance register",
    category: "Security",
    owner: "Security",
    updated: "May 27, 2026",
    summary: "Certifications, vulnerabilities, audit actions, training, and third-party risks.",
    pages: [
      {
        title: "Security posture",
        lines: [
          "SOC 2 Type II was renewed on March 14, 2026 with no material exceptions.",
          "ISO 27001 certification is targeted for October 2026.",
          "HIPAA controls are available for enterprise customers under a signed BAA.",
          "Security awareness training completion is 98%.",
          "Phishing simulation failure rate is 2.7%, down from 4.1% in Q4 2025.",
          "",
          "VULNERABILITY STATUS",
          "Critical: 0 open.",
          "High: 2 open. One is due June 12 and one is due June 21.",
          "Medium: 11 open. Low: 27 open.",
          "Median remediation time for high-severity findings is 12 days.",
          "",
          "There were no confirmed customer-data breaches in 2025 or Q1 2026.",
        ],
      },
      {
        title: "Compliance gaps and third-party risk",
        lines: [
          "OPEN ISO 27001 ACTIONS",
          "Complete formal asset-owner attestations by June 30.",
          "Add evidence automation for quarterly access reviews by July 15.",
          "Finish the EU data residency control mapping by August 1.",
          "",
          "THIRD-PARTY RISKS",
          "Primary cloud provider concentration is rated medium-high.",
          "The SMS delivery provider has not completed its 2026 penetration test.",
          "Two AI subprocessors require updated data-retention addenda before July 31.",
          "",
          "The 2026 security budget is $5.8 million, including $1.2 million for compliance and audit work.",
          "The largest compliance schedule risk is delayed EU control evidence for ISO 27001.",
        ],
      },
    ],
  },
  {
    fileName: "FDC Customer Support Weekly Report.pdf",
    title: "Customer support weekly report",
    category: "Support",
    owner: "Customer Support",
    updated: "May 29, 2026",
    summary: "Service KPIs, ticket themes, escalation log, staffing, and corrective actions.",
    pages: [
      {
        title: "Q1 and May support performance",
        lines: [
          "Q1 2026 customer satisfaction was 94%.",
          "Median first response time was 18 minutes for priority tickets.",
          "SLA attainment was 98.6%.",
          "Support handled 932 tickets in Q1, up 14% from Q4 2025.",
          "The week ending May 29 closed 91% of tickets within target.",
          "",
          "TOP TICKET THEMES",
          "Inventory connector configuration: 24% of May tickets.",
          "FieldSync mobile permissions: 18%.",
          "LedgerLens report exports: 13%.",
          "User provisioning and SSO: 11%.",
          "",
          "The documentation deflection rate is 31%, against a 38% Q2 target.",
        ],
      },
      {
        title: "Escalations and support actions",
        lines: [
          "Three enterprise escalations were open on May 29.",
          "Northstar Logistics: intermittent ERP connector timeouts; engineering fix due June 11.",
          "Altitude Home Services: mobile permissions rollout; enablement session due June 6.",
          "Harbor Medical Supply: report export formatting; patch due June 14.",
          "",
          "ACTIONS",
          "Publish a connector troubleshooting guide by June 7.",
          "Add in-product mobile permission checks by June 21.",
          "Hire four additional technical support engineers by August.",
          "Create a dedicated enterprise escalation rotation before Q3 renewals.",
        ],
      },
    ],
  },
];
