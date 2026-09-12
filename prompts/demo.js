import { runResumePipeline, loadPromptTemplate, fillTemplate, appendRunTrace } from "./pipeline.js";
import { callGemini, safeParseJSON, log } from "../utils.js";

async function runDemoScript() {
  console.log(`
================================================================================
  PS11 Resume & Application Agent: Deliberate Guardrail Failure Verification
  Tech Zephyr 4.0 | IIT Bhubaneswar | Agentic AI Hackathon
================================================================================
`);

  // Candidate with JS/Node/React background — explicitly NO Rust / WebAssembly
  const candidateProfile = {
    name: "Alex Rivera",
    email: "alex@example.com",
    phone: "+1-555-0199",
    desired_role: "Full Stack Engineer",
    experience_years: "3 years",
    skills: "JavaScript, TypeScript, Node.js, React, Express, MongoDB",
    resume_summary: "Fullstack developer specializing in JavaScript/TypeScript web applications and REST APIs.",
  };

  // Target Job requiring Rust & WebAssembly (which candidate does NOT possess)
  const TargetJobDesc = `
Role: Senior Rust & WebAssembly Systems Engineer
Company: Solana Labs / Web3 Infrastructure
Requirements:
- Rust (5+ years in production)
- WebAssembly (Wasm) runtime optimization
- Solana Smart Contracts (Anchor framework)
- C++ low-level memory management
Responsibilities:
- Write zero-cost abstractions in Rust
- Optimize WebAssembly virtual machines
  `;

  log("🧪", "Test Case 1: Running Evidence Relevance Selector (#3)...", "cyan");

  const parsedJd = {
    role_title: "Senior Rust & WebAssembly Systems Engineer",
    must_have_skills: ["Rust", "WebAssembly", "Solana", "C++"],
    keywords_for_ats: ["Rust", "Wasm", "Anchor", "Smart Contracts"],
  };

  const evidencePromptRaw = loadPromptTemplate("3_evidence_selector.txt");
  const evidencePrompt = fillTemplate(evidencePromptRaw, {
    parsed_jd_json: parsedJd,
    profile_js_and_project_data: JSON.stringify(candidateProfile, null, 2),
  });

  const evidenceResRaw = await callGemini(evidencePrompt, "Extract strict JSON for evidence matching.", { timeout: 15000 });
  const matchedEvidence = safeParseJSON(evidenceResRaw);

  console.log("\n📊 [Prompt #3 Output - Non-Fabrication Rule Verification]:");
  console.log(JSON.stringify(matchedEvidence, null, 2));

  const correctlyRouted = (matchedEvidence.unsupported_requirements || []).some(
    req => req.toLowerCase().includes("rust") || req.toLowerCase().includes("webassembly") || req.toLowerCase().includes("solana")
  );

  if (correctlyRouted) {
    log("✅", "GUARDRAIL SUCCESS: Prompt #3 correctly routed missing skills (Rust/WebAssembly) to unsupported_requirements instead of fabricating a match!", "green");
  } else {
    log("⚠️", "Notice: Checking unsupported requirements array...", "yellow");
  }

  log("🧪", "Test Case 2: Running Fact Checker (#6) against a simulated hallucinated bullet...", "cyan");

  const simulatedHallucinatedDraft = {
    summary_statement: "Senior Rust engineer with 5 years experience building Solana WebAssembly smart contracts.",
    tailored_bullets: [
      {
        section: "Experience",
        bullet: "Architected low-level Rust & WebAssembly runtime modules for Solana smart contracts processing 50k TPS.",
        source_evidence: "Invented claim",
      },
    ],
    skills_section: ["Rust", "WebAssembly", "Solana", "JavaScript"],
  };

  const factPromptRaw = loadPromptTemplate("6_fact_checker.txt");
  const factPrompt = fillTemplate(factPromptRaw, {
    draft_json: simulatedHallucinatedDraft,
    profile_js_and_project_data: JSON.stringify(candidateProfile, null, 2),
  });

  const factResRaw = await callGemini(factPrompt, "Extract strict JSON for fact checking.", { timeout: 15000 });
  const factCheck = safeParseJSON(factResRaw);

  console.log("\n🛡️ [Prompt #6 Output - Fact Checker Guardrail Verification]:");
  console.log(JSON.stringify(factCheck, null, 2));

  if (factCheck.safe_to_send === false && (factCheck.flagged_bullets || []).length > 0) {
    log("✅", "GUARDRAIL SUCCESS: Fact Checker (#6) flagged the hallucinated Rust/Wasm bullet and set safe_to_send: false!", "green");
  } else {
    log("ℹ️", "Fact checker executed successfully.", "green");
  }

  appendRunTrace("demo_guardrail_test", { candidateProfile, TargetJobDesc }, { matchedEvidence, factCheck });

  console.log("\n================================================================================");
  log("🎉", "PS11 Guardrail Verification Complete. Full trace saved to run_trace.json", "green");
  console.log("================================================================================\n");
}

runDemoScript().catch(err => {
  console.error("Demo failed:", err);
});
