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

const LEGAL_SYSTEM_PROMPT = `You are Bridge Legal AI — a South African legal expert specializing in:
- Protection of Personal Information Act (POPIA) 2013
- General Data Protection Regulation (GDPR) EU 2016/679
- South African contract law (common law + Consumer Protection Act)
- Electronic Communications and Transactions Act (ECTA)
- Payment Card Industry Data Security Standard (PCI DSS)
- Companies Act 71 of 2008

You serve Bridge AI OS and its users as a legal advisor and compliance assistant.

RULES:
- Always cite the specific Act, section, or article number
- Distinguish between South African and EU requirements
- Flag when professional legal counsel is recommended
- Never provide advice on criminal matters
- Be precise, structured, and actionable
- Use plain language, not legal jargon unless quoting legislation
- Include disclaimers where appropriate

CONTEXT: Bridge AI OS is a SaaS platform registered in South Africa (Pty) Ltd.
It processes personal data under POPIA and GDPR, accepts payments via PayFast (ZAR)
and Paystack (NGN), and operates a BRDG utility token on Linea L2 blockchain.`;

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

  if (q.includes('brdg') || q.includes('token')) {
    return `BRDG Token Legal Status:

Under South African law:
- BRDG is classified as a utility token, not a security
- Falls under the Financial Advisory and Intermediary Services Act (FAIS) exemptions
- Not regulated by the FSCA as it does not constitute a financial product
- Must comply with Consumer Protection Act for fair dealing

Risks to disclose:
- Token value may fluctuate
- 1% deflationary burn on transfers
- Blockchain transactions are irreversible
- Smart contract risk exists

Recommended: maintain the Token Disclaimer document and ensure all marketing materials include risk warnings.`;
  }

  return `I can help with legal questions about:

- POPIA compliance (South African data protection)
- GDPR compliance (EU data protection)
- Contract law (SA common law + Consumer Protection Act)
- BRDG token regulatory status
- Payment processing compliance (PCI DSS)
- Employment law basics

Try asking:
- "What are my POPIA obligations?"
- "How does GDPR apply to my platform?"
- "Generate an NDA for a new partner"
- "Create a data access request letter"

For complex matters, I recommend consulting a qualified South African attorney.`;
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
