'use strict';
/**
 * lib/legal-agent.js — AI Legal Agent for Bridge AI OS
 *
 * Capabilities:
 *   1. Legal Q&A (POPIA, GDPR, SA contract law)
 *   2. Contract generation (NDA, ToS, Privacy, DPA, Service Agreement)
 *   3. Document analysis (summarize, flag risks)
 *   4. Legal proxy actions (data access/deletion requests, complaint letters)
 *
 * Uses the existing LLM inference pipeline with a specialized legal system prompt.
 */

const LEGAL_SYSTEM_PROMPT = `You are Bridge Legal AI — a comprehensive legal intelligence system with expertise across multiple legal domains:

SOUTH AFRICAN LAW:
- Protection of Personal Information Act (POPIA) 2013
- Consumer Protection Act 68 of 2008
- Electronic Communications and Transactions Act (ECTA) 25 of 2002
- Companies Act 71 of 2008
- National Credit Act 34 of 2005
- Financial Advisory and Intermediary Services Act (FAIS) 37 of 2002
- Financial Markets Act 19 of 2012
- Broad-Based Black Economic Empowerment Act (B-BBEE) 53 of 2003
- Labour Relations Act 66 of 1995
- Basic Conditions of Employment Act 75 of 1997
- South African common law of contract (Roman-Dutch + English influence)

EUROPEAN UNION / INTERNATIONAL:
- General Data Protection Regulation (GDPR) EU 2016/679
- ePrivacy Directive 2002/58/EC
- Digital Services Act (DSA) EU 2022/2065
- Digital Markets Act (DMA) EU 2022/1925
- Markets in Crypto-Assets Regulation (MiCA) EU 2023/1114
- UN Convention on Contracts for International Sale of Goods (CISG)
- UNCITRAL Model Law on Electronic Commerce
- New York Convention on Arbitration 1958
- Hague Convention on Choice of Court Agreements

UNITED STATES / CORPORATE:
- Uniform Commercial Code (UCC)
- Securities Act of 1933 / Securities Exchange Act of 1934
- Howey Test (SEC v. W.J. Howey Co., 1946) — security classification
- Sarbanes-Oxley Act (SOX) 2002
- California Consumer Privacy Act (CCPA)
- CAN-SPAM Act
- DMCA (Digital Millennium Copyright Act)
- Delaware General Corporation Law (DGCL)
- Model Business Corporation Act (MBCA)

BLACK'S LAW DICTIONARY DEFINITIONS:
When asked to define legal terms, provide the Black's Law Dictionary (11th Edition) definition.
Use precise legal terminology with plain-language explanation.
Key concepts to reference:
- Juristic person / Natural person
- Fiduciary duty
- Force majeure
- Indemnification
- Jurisdiction (in personam, in rem, quasi in rem)
- Res judicata / Stare decisis
- Ultra vires
- Bona fide / Mala fide
- Locus standi (standing)
- Pacta sunt servanda (agreements must be kept)
- Lex mercatoria (law merchant)

UNIVERSAL / NATURAL LAW PRINCIPLES:
- Jus cogens (peremptory norms of international law)
- Universal Declaration of Human Rights (UDHR) 1948
- Right to privacy (UDHR Article 12)
- Right to property (UDHR Article 17)
- Freedom of expression (UDHR Article 19)
- Right to fair trial (UDHR Article 10)
- Principle of good faith (bona fides)
- Proportionality principle
- Non-retroactivity of law (nullum crimen sine lege)
- Right to self-determination
- Sovereignty of contract (party autonomy)

CORPORATE LAW:
- Director duties and fiduciary obligations (SA Companies Act S76-77)
- Piercing the corporate veil
- Shareholders' agreements and rights
- Mergers and acquisitions (SA Companies Act Chapter 5)
- Corporate governance (King IV Code)
- Joint venture structuring
- Intellectual property assignment and licensing
- Employment equity and B-BBEE compliance
- Cross-border corporate structures

PAYMENT CARD & FINANCIAL:
- Payment Card Industry Data Security Standard (PCI DSS)
- Payment Services Directive (PSD2) EU
- Anti-Money Laundering (AML) / Counter-Terrorist Financing (CTF)
- Financial Intelligence Centre Act (FICA) 38 of 2001 (South Africa)
- Know Your Customer (KYC) requirements

BLOCKCHAIN / TOKEN REGULATION:
- FSCA Declaration on crypto assets (South Africa)
- MiCA (EU crypto regulation)
- Howey Test for security classification (US)
- Smart contract legal enforceability
- Token classification: utility vs security vs payment
- DeFi regulatory considerations

You serve Bridge AI OS and its users as a comprehensive legal advisor.

RULES:
- Always cite the specific Act, section, article, or case law
- Provide Black's Law Dictionary definitions when defining legal terms
- Distinguish between jurisdictions (SA, EU, US, International)
- Reference universal law principles where applicable
- Flag when professional legal counsel is essential (not just recommended)
- Be precise, structured, and actionable
- Use plain language first, then provide legal terminology
- Include jurisdiction-specific disclaimers
- For corporate matters, reference King IV governance principles
- For token/crypto questions, apply the Howey Test and FSCA guidance

CONTEXT: Bridge AI OS is a SaaS platform registered in South Africa (Pty) Ltd.
It processes personal data under POPIA and GDPR, accepts payments via PayFast (ZAR)
and Paystack (NGN), and operates a BRDG utility token on Linea L2 blockchain.
The platform has JV partners and operates across multiple jurisdictions.`;

// ── Contract templates ───────────────────────────────────────────────────────

const CONTRACT_TEMPLATES = {
  nda: {
    name: 'Non-Disclosure Agreement',
    prompt: `Generate a legally binding Non-Disclosure Agreement (NDA) under South African law.
Include: parties, definition of confidential information, obligations, duration (2 years),
remedies for breach, governing law (Republic of South Africa), jurisdiction (Johannesburg).
Format as a formal legal document with numbered clauses. Include signature blocks.`,
  },
  terms: {
    name: 'Terms of Service',
    prompt: `Generate comprehensive Terms of Service for a SaaS platform under South African law.
Cover: acceptance, service description, accounts, payments (ZAR via PayFast), data protection (POPIA+GDPR),
acceptable use, intellectual property, liability limitations, termination, governing law (SA).
Include BRDG token utility disclaimer. Formal numbered clause structure.`,
  },
  privacy: {
    name: 'Privacy Policy',
    prompt: `Generate a Privacy Policy compliant with both POPIA (South Africa) and GDPR (EU).
Cover: data controller identity, data collected, purpose of processing, legal basis (GDPR Art 6),
retention periods, data subject rights (POPIA S11 + GDPR Art 15-22), international transfers,
security measures, cookie policy, changes notification, contact details.
Structured with clear headings.`,
  },
  dpa: {
    name: 'Data Processing Agreement',
    prompt: `Generate a Data Processing Agreement per GDPR Article 28.
Cover: scope, controller instructions, confidentiality, security measures (Art 32),
sub-processors, data subject rights assistance, breach notification (72h),
audit rights, data deletion on termination, governing law.
Formal structure suitable for enterprise clients.`,
  },
  service: {
    name: 'Service Agreement',
    prompt: `Generate a Service Agreement for a B2B SaaS subscription under South African law.
Cover: service scope, subscription tiers, payment terms (monthly/annual),
SLA (99.9% uptime), data handling, IP ownership, confidentiality,
liability cap (12 months fees), termination (30 days notice),
force majeure, governing law (SA), dispute resolution (arbitration).`,
  },
};

// ── Proxy action templates ───────────────────────────────────────────────────

const PROXY_TEMPLATES = {
  'data-access': {
    name: 'Data Access Request',
    prompt: `Generate a formal data access request letter under POPIA Section 23 and GDPR Article 15.
The letter should request a copy of all personal data held about the data subject.
Include: legal basis, specific data categories requested, format (electronic, machine-readable),
response deadline (30 days POPIA / 1 month GDPR), consequences of non-compliance.
Formal letter format with date, addressee, reference number.`,
  },
  'data-deletion': {
    name: 'Data Deletion Request',
    prompt: `Generate a formal right to erasure / deletion request under POPIA Section 24 and GDPR Article 17.
Request complete deletion of all personal data. Include: legal basis, specific grounds
(consent withdrawal / no longer necessary / unlawful processing),
response deadline, confirmation of deletion required.
Formal letter format.`,
  },
  'complaint': {
    name: 'Regulatory Complaint',
    prompt: `Generate a formal complaint letter to the Information Regulator (South Africa) or
relevant EU supervisory authority for non-compliance with data protection obligations.
Include: complainant details, respondent details, description of violation,
applicable legislation (POPIA/GDPR), evidence summary, requested action.
Formal complaint format with reference to relevant sections.`,
  },
  'breach-notice': {
    name: 'Data Breach Notification',
    prompt: `Generate a data breach notification letter per POPIA Section 22 and GDPR Article 33.
Include: nature of breach, categories of data affected, approximate number of data subjects,
measures taken, measures to mitigate, contact point for further information.
Must be sent within 72 hours. Formal notification format.`,
  },
};

// ── Core functions ───────────────────────────────────────────────────────────

/**
 * Answer a legal question using the LLM.
 */
async function askLegal(query, userContext) {
  const contextBlock = userContext
    ? `\n\nUSER CONTEXT:\n${JSON.stringify(userContext, null, 2)}`
    : '';

  const fullPrompt = query + contextBlock;

  // Use the existing LLM inference
  try {
    const ai = require('./ai');
    const result = await ai.infer(fullPrompt, {
      system: LEGAL_SYSTEM_PROMPT,
      maxTokens: 2000,
    });
    return {
      ok: true,
      response: result.text || result.response || result,
      provider: result.provider || 'default',
      disclaimer: 'This is AI-generated legal guidance, not professional legal advice. Consult a qualified attorney for binding legal matters.',
    };
  } catch (e) {
    // Fallback: rule-based response for common questions
    return {
      ok: true,
      response: getRuleBasedResponse(query),
      provider: 'rule-based',
      disclaimer: 'LLM unavailable — providing rule-based guidance. Consult a qualified attorney for specific advice.',
    };
  }
}

/**
 * Generate a contract from a template.
 */
async function generateContract(type, variables) {
  const template = CONTRACT_TEMPLATES[type];
  if (!template) return { ok: false, error: 'Unknown contract type. Available: ' + Object.keys(CONTRACT_TEMPLATES).join(', ') };

  const varBlock = variables && Object.keys(variables).length
    ? '\n\nVARIABLES TO INSERT:\n' + Object.entries(variables).map(([k, v]) => `${k}: ${v}`).join('\n')
    : '\n\nUse Bridge AI (Pty) Ltd as the service provider. Leave party B as [CLIENT NAME] placeholder.';

  try {
    const ai = require('./ai');
    const result = await ai.infer(template.prompt + varBlock, {
      system: LEGAL_SYSTEM_PROMPT,
      maxTokens: 4000,
    });
    return {
      ok: true,
      type: type,
      name: template.name,
      content: result.text || result.response || result,
      generatedAt: new Date().toISOString(),
      disclaimer: 'AI-generated legal document. Review by qualified legal counsel recommended before execution.',
    };
  } catch (e) {
    // Return a basic template when LLM is unavailable
    return {
      ok: true,
      type: type,
      name: template.name,
      content: getStaticTemplate(type, variables),
      generatedAt: new Date().toISOString(),
      provider: 'template',
      disclaimer: 'Generated from static template (LLM unavailable). Professional review required.',
    };
  }
}

/**
 * Generate a legal proxy action (letter/request on behalf of user).
 */
async function generateProxyAction(actionType, details) {
  const template = PROXY_TEMPLATES[actionType];
  if (!template) return { ok: false, error: 'Unknown action. Available: ' + Object.keys(PROXY_TEMPLATES).join(', ') };

  const detailBlock = details
    ? '\n\nDETAILS:\n' + Object.entries(details).map(([k, v]) => `${k}: ${v}`).join('\n')
    : '';

  try {
    const ai = require('./ai');
    const result = await ai.infer(template.prompt + detailBlock, {
      system: LEGAL_SYSTEM_PROMPT,
      maxTokens: 2000,
    });
    return {
      ok: true,
      action: actionType,
      name: template.name,
      content: result.text || result.response || result,
      generatedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      ok: true,
      action: actionType,
      name: template.name,
      content: getStaticProxyTemplate(actionType, details),
      provider: 'template',
      generatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Analyze a document for legal risks.
 */
async function analyzeDocument(text, docType) {
  const prompt = `Analyze the following ${docType || 'legal document'} for:
1. Compliance risks (POPIA, GDPR)
2. Missing clauses
3. Unfavorable terms
4. Ambiguous language
5. Recommended improvements

DOCUMENT:
${text.slice(0, 3000)}`;

  return askLegal(prompt);
}

// ── Rule-based fallbacks ─────────────────────────────────────────────────────

function getRuleBasedResponse(query) {
  const q = query.toLowerCase();

  if (q.includes('popia') && q.includes('gdpr')) {
    return `POPIA vs GDPR Comparison:

Both protect personal information but differ in scope:

POPIA (South Africa):
- Applies to processing of personal information in SA
- Information Regulator enforces compliance
- Consent or legitimate interest required (Section 11)
- Data subjects have access rights (Section 23)
- Breach notification required (Section 22)

GDPR (EU):
- Applies to processing of EU residents' data
- Supervisory authorities enforce per member state
- Six legal bases for processing (Article 6)
- Broader data subject rights (Articles 15-22)
- 72-hour breach notification (Article 33)

Key differences:
- GDPR has extraterritorial reach; POPIA applies to SA processing
- GDPR fines up to 4% of global turnover; POPIA up to R10 million
- GDPR requires Data Protection Officer; POPIA requires Information Officer`;
  }

  if (q.includes('popia')) {
    return `POPIA (Protection of Personal Information Act 4 of 2013):

Key requirements for Bridge AI OS:
1. Appoint an Information Officer (Section 55)
2. Register with the Information Regulator
3. Obtain consent or establish lawful basis for processing (Section 11)
4. Implement security safeguards (Section 19)
5. Notify data subjects of breaches (Section 22)
6. Respond to access requests within 30 days (Section 23)
7. Ensure cross-border transfers have adequate protection (Section 72)

Your obligations as a SaaS provider processing personal data in South Africa.
Contact the Information Regulator: https://inforegulator.org.za`;
  }

  if (q.includes('gdpr')) {
    return `GDPR (General Data Protection Regulation EU 2016/679):

Key requirements:
1. Lawful basis for processing (Article 6) — consent, contract, legitimate interest
2. Data subject rights (Articles 15-22) — access, rectification, erasure, portability
3. Data Protection Impact Assessment for high-risk processing (Article 35)
4. Appoint DPO if large-scale processing (Article 37)
5. Breach notification within 72 hours (Article 33)
6. Standard Contractual Clauses for international transfers (Article 46)

Fines: up to EUR 20 million or 4% of global annual turnover.`;
  }

  if (q.includes('contract') || q.includes('nda')) {
    return `South African Contract Law:

Essential elements of a valid contract:
1. Consensus (meeting of minds)
2. Capacity to contract
3. Lawful purpose
4. Possibility of performance
5. Formalities (if required by statute)

For digital contracts (ECTA Section 22):
- Electronic signatures are legally valid
- Data messages satisfy "in writing" requirements
- Automated transactions are binding

Use the Contract Generator below to create legally compliant documents.`;
  }

  if (q.includes('brdg') || q.includes('token') || q.includes('crypto')) {
    return `BRDG Token Legal Status — Multi-Jurisdiction Analysis:

SOUTH AFRICA (FSCA):
- BRDG is classified as a utility token, not a financial product
- FSCA Declaration on Crypto Assets (2022): crypto assets are not legal tender
- Falls outside FAIS regulation as it does not constitute investment advice
- Must comply with Consumer Protection Act 68 of 2008 for fair dealing
- FICA (Financial Intelligence Centre Act): KYC/AML may apply if exchange-traded

EUROPEAN UNION (MiCA):
- Under Markets in Crypto-Assets Regulation (MiCA) 2023/1114:
  - Utility tokens with specific use cases have lighter regulation
  - Must publish a "crypto-asset white paper" if offered to EU public
  - No authorization required if token is purely utility

UNITED STATES (Howey Test):
- SEC v. W.J. Howey Co. (1946) — a token is a security if:
  1. Investment of money
  2. In a common enterprise
  3. With expectation of profits
  4. Derived from efforts of others
- BRDG assessment: utility function (agent fuel) + deflationary burn = likely NOT a security
- However: if marketed as investment → SEC scrutiny applies

BLACK'S LAW: "Security" — An instrument that evidences the holder's ownership rights, creditorship, or right to participate in earnings.

Recommended: maintain Token Disclaimer, avoid investment language in all marketing.`;
  }

  if (q.includes('howey') || q.includes('security test')) {
    return `The Howey Test (SEC v. W.J. Howey Co., 328 U.S. 293 (1946)):

A transaction is an "investment contract" (security) if it involves:

1. INVESTMENT OF MONEY — Any form of value exchanged
2. COMMON ENTERPRISE — Pooling of funds with horizontal commonality
3. EXPECTATION OF PROFITS — Reasonable anticipation of returns
4. FROM EFFORTS OF OTHERS — Profits depend on promoter/third party

Application to BRDG Token:
- Investment: Users purchase BRDG, but primarily for platform utility
- Common enterprise: BRDG operates in a shared economy, but each agent is independent
- Profits: 1% burn creates scarcity, but primary use is agent fuel, not speculation
- Efforts of others: Platform provides utility, but value depends on ecosystem usage

CONCLUSION: Likely classified as UTILITY TOKEN, not security.
However, marketing language matters — never promise returns or appreciation.

BLACK'S LAW: "Investment Contract" — A contract, transaction, or scheme whereby a person invests money in a common enterprise and is led to expect profits solely from the efforts of the promoter or a third party.`;
  }

  if (q.includes('fiduciary') || q.includes('director') || q.includes('corporate governance')) {
    return `Director Duties & Fiduciary Obligations:

SOUTH AFRICAN LAW (Companies Act 71 of 2008):
- Section 76: Directors must act in good faith and in the best interests of the company
- Section 77: Liability for breach of fiduciary duty
- King IV Code: "Apply and explain" corporate governance principles

BLACK'S LAW DEFINITIONS:
- Fiduciary: "A person who is required to act for the benefit of another person on all matters within the scope of their relationship."
- Fiduciary duty: "A duty of utmost good faith, trust, confidence, and candor owed by a fiduciary to the beneficiary."
- Ultra vires: "Beyond the powers — an act performed without authority."
- Business judgment rule: Directors not liable for honest errors in business judgment.

KEY DUTIES:
1. Duty of care, skill, and diligence (S76(3)(c))
2. Duty to act in good faith (S76(3)(a))
3. Duty to avoid conflicts of interest (S75)
4. Duty not to use company property for personal benefit (S76(2))
5. Duty to disclose personal financial interests (S75(5))

PIERCING THE CORPORATE VEIL (S20(9)):
Courts may disregard separate legal personality if:
- Company used to perpetrate fraud
- Unconscionable abuse of corporate form
- Justice requires it`;
  }

  if (q.includes('black') && q.includes('law')) {
    return `Black's Law Dictionary (11th Edition) — Key Legal Terms:

PERSONS:
- Natural Person: "A human being, as distinguished from an artificial person created by law."
- Juristic Person: "An entity, such as a corporation, created by law and given certain legal rights and duties."

OBLIGATIONS:
- Pacta sunt servanda: "Agreements must be kept." — fundamental principle of contract law.
- Bona fide: "In good faith; without fraud or deceit."
- Mala fide: "In bad faith; with intent to deceive."

JURISDICTION:
- In personam: "Jurisdiction over a person, as opposed to property."
- In rem: "Jurisdiction over a thing or property."
- Forum non conveniens: "An inconvenient forum — court may decline jurisdiction."

PRECEDENT:
- Stare decisis: "To stand by things decided — courts follow established precedent."
- Res judicata: "A matter judged — cannot be relitigated."
- Obiter dictum: "A remark in passing — not binding precedent."

REMEDIES:
- Injunction: "A court order prohibiting or compelling action."
- Indemnification: "Security against loss or damage; compensation."
- Specific performance: "Court-ordered fulfillment of a contractual obligation."
- Damages: "Monetary compensation for loss or injury."

Ask about any specific legal term for its Black's Law definition.`;
  }

  if (q.includes('universal law') || q.includes('natural law') || q.includes('human rights') || q.includes('jus cogens')) {
    return `Universal & Natural Law Principles:

JUS COGENS (Peremptory Norms — Vienna Convention Art 53):
Non-derogable principles that bind all nations:
- Prohibition of genocide
- Prohibition of slavery and slave trade
- Prohibition of torture
- Right to self-determination
- Prohibition of aggression

UNIVERSAL DECLARATION OF HUMAN RIGHTS (1948):
- Article 12: Right to privacy (foundation of POPIA/GDPR)
- Article 17: Right to property (token ownership)
- Article 19: Freedom of expression
- Article 20: Freedom of association

NATURAL LAW PRINCIPLES IN COMMERCIAL USE:
- Pacta sunt servanda — agreements must be honored
- Nemo dat quod non habet — you cannot give what you do not have
- Ex turpi causa non oritur actio — no action arises from a wrongful cause
- Audi alteram partem — hear the other side (due process)
- Nulla poena sine lege — no punishment without law

APPLICATION TO BRIDGE AI OS:
- Right to privacy → POPIA/GDPR compliance
- Right to property → BRDG token ownership rights
- Pacta sunt servanda → smart contract enforceability
- Due process → dispute resolution procedures

These principles underpin all statutory law and are recognized by courts globally.`;
  }

  if (q.includes('international') || q.includes('cross-border') || q.includes('jurisdiction')) {
    return `International & Cross-Border Legal Framework:

APPLICABLE TO BRIDGE AI OS:

1. CHOICE OF LAW
- Platform ToS specifies South African law as governing law
- GDPR applies extraterritorially to EU data subjects regardless
- US law may apply if serving US customers (CCPA, SEC)

2. KEY INTERNATIONAL INSTRUMENTS:
- UN Convention on Contracts for International Sale of Goods (CISG)
- UNCITRAL Model Law on Electronic Commerce
- New York Convention on Arbitration (1958) — enforcement of arbitral awards
- Hague Convention on Choice of Court Agreements

3. DISPUTE RESOLUTION OPTIONS:
- Litigation in SA courts (Johannesburg High Court)
- International arbitration (UNCITRAL rules)
- Online dispute resolution (EU ODR platform for EU consumers)

4. DATA TRANSFERS:
- POPIA Section 72: adequate protection required
- GDPR Chapter V: Standard Contractual Clauses (SCCs)
- No SA adequacy decision from EU yet — use SCCs

5. ENFORCEMENT:
- SA judgments enforceable in most Commonwealth countries
- Arbitral awards enforceable in 170+ countries (New York Convention)

BLACK'S LAW: "Comity" — The recognition one jurisdiction gives to the legislative, executive, or judicial acts of another.`;
  }

  if (q.includes('employ') || q.includes('labour') || q.includes('labor') || q.includes('worker')) {
    return `South African Employment Law:

KEY LEGISLATION:
- Labour Relations Act 66 of 1995 (LRA)
- Basic Conditions of Employment Act 75 of 1997 (BCEA)
- Employment Equity Act 55 of 1998 (EEA)
- Skills Development Act 97 of 1998

CONTRACTOR vs EMPLOYEE (critical for platform workers):
- BCEA S200A: Presumption of employment if person:
  - Works for one person/company primarily
  - Subject to control on how work is done
  - Works set hours
  - Uses tools provided by company

FOR AI AGENT WORKERS:
- AI agents are not employees — they are software
- Human operators of AI systems may have employment rights
- Gig economy workers using the platform may claim employee status

MINIMUM REQUIREMENTS (BCEA):
- Maximum 45 hours per week
- 21 consecutive days annual leave
- 4 months maternity leave
- CCMA for unfair dismissal disputes`;
  }

  return `Bridge AI Legal Centre — Comprehensive Legal Intelligence

I cover multiple legal domains:

SOUTH AFRICAN LAW:
- POPIA, Consumer Protection, Companies Act, ECTA, FAIS, B-BBEE, Labour

INTERNATIONAL LAW:
- GDPR, MiCA, CISG, UNCITRAL, UN Human Rights, Hague Convention

US / CORPORATE LAW:
- Howey Test, SEC regulation, UCC, SOX, CCPA, Delaware corporate law

BLACK'S LAW DICTIONARY:
- Ask for any legal term definition

UNIVERSAL / NATURAL LAW:
- Jus cogens, UDHR, fundamental legal principles

Try asking:
- "What are my POPIA obligations?"
- "Apply the Howey Test to BRDG token"
- "Define fiduciary duty (Black's Law)"
- "What are jus cogens norms?"
- "Compare POPIA and GDPR"
- "Director duties under SA Companies Act"
- "Cross-border data transfer rules"
- "Employment law for platform workers"
- "Generate an NDA for a new partner"

For complex matters, professional legal counsel is essential.`;
}

function getStaticTemplate(type, vars) {
  const company = (vars && vars.companyName) || 'Bridge AI (Pty) Ltd';
  const date = new Date().toISOString().slice(0, 10);

  const templates = {
    nda: `NON-DISCLOSURE AGREEMENT

DATE: ${date}
BETWEEN: ${company} ("Disclosing Party")
AND: [RECIPIENT NAME] ("Receiving Party")

1. CONFIDENTIAL INFORMATION
All information disclosed by the Disclosing Party that is marked as confidential or that a reasonable person would understand to be confidential.

2. OBLIGATIONS
The Receiving Party shall:
(a) Keep all Confidential Information strictly confidential
(b) Not disclose to any third party without prior written consent
(c) Use only for the agreed purpose
(d) Return or destroy all copies upon request

3. DURATION
This agreement remains in effect for 2 (two) years from the date of signing.

4. REMEDIES
Breach entitles the Disclosing Party to injunctive relief and damages.

5. GOVERNING LAW
Republic of South Africa. Jurisdiction: High Court, Johannesburg.

SIGNED:
_________________________    _________________________
${company}                    [Recipient Name]
Date: ___________            Date: ___________`,

    terms: `TERMS OF SERVICE — ${company}
Effective: ${date}
[Full terms available at /api/legal/download/tos-v1]`,

    privacy: `PRIVACY POLICY — ${company}
Effective: ${date}
POPIA + GDPR Compliant
[Full policy available at /api/legal/download/privacy-v1]`,

    dpa: `DATA PROCESSING AGREEMENT — ${company}
Per GDPR Article 28
[Full DPA available at /api/legal/download/dpa-v1]`,

    service: `SERVICE AGREEMENT — ${company}
Effective: ${date}

1. SERVICES: [Description of services]
2. TERM: 12 months from effective date
3. FEES: As per selected subscription plan
4. SLA: 99.9% monthly uptime
5. DATA: Processed per Privacy Policy and DPA
6. LIABILITY: Limited to 12 months of fees paid
7. TERMINATION: 30 days written notice
8. GOVERNING LAW: Republic of South Africa`,
  };

  return templates[type] || 'Template not available. Use the AI generator when LLM is configured.';
}

function getStaticProxyTemplate(actionType, details) {
  const name = (details && details.name) || '[Your Name]';
  const email = (details && details.email) || '[your@email.com]';
  const company = (details && details.targetCompany) || '[Company Name]';
  const date = new Date().toISOString().slice(0, 10);

  const templates = {
    'data-access': `DATA ACCESS REQUEST
Per POPIA Section 23 / GDPR Article 15

Date: ${date}
From: ${name} (${email})
To: The Information Officer, ${company}

Dear Sir/Madam,

I hereby request access to all personal information you hold about me, as provided for under the Protection of Personal Information Act (Section 23) and the General Data Protection Regulation (Article 15).

Please provide:
1. All personal data held about me
2. The purposes of processing
3. Categories of data processed
4. Recipients of my data
5. Retention periods

Please respond within 30 days as required by law.

Yours faithfully,
${name}`,

    'data-deletion': `DATA DELETION REQUEST
Per POPIA Section 24 / GDPR Article 17

Date: ${date}
From: ${name} (${email})
To: The Information Officer, ${company}

I request the complete erasure of all personal data you hold about me.

Legal basis: [withdrawal of consent / data no longer necessary / unlawful processing]

Please confirm deletion within 30 days.

${name}`,

    'complaint': `COMPLAINT TO INFORMATION REGULATOR
Date: ${date}
Complainant: ${name}
Respondent: ${company}

I wish to lodge a complaint regarding non-compliance with POPIA.

[Description of violation]

I request the Regulator investigate and take appropriate enforcement action.

${name}`,

    'breach-notice': `DATA BREACH NOTIFICATION
Per POPIA Section 22 / GDPR Article 33

Date: ${date}
From: ${company}
To: [Information Regulator / Supervisory Authority]

We are notifying you of a personal data breach:
Nature: [Description]
Data affected: [Categories]
Subjects affected: [Approximate number]
Measures taken: [Containment steps]

Contact: ${email}`,
  };

  return templates[actionType] || 'Template not available.';
}

module.exports = {
  askLegal,
  generateContract,
  generateProxyAction,
  analyzeDocument,
  CONTRACT_TEMPLATES,
  PROXY_TEMPLATES,
};
