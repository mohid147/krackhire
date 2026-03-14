// api/analyse.js
// Vercel serverless function - API key never exposed to frontend

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { type, resume, jd, company, role, messages } = req.body || {};

  if (!type) return res.status(400).json({ error: "Missing type" });
  if (type !== "interview" && (!resume?.trim() || !jd?.trim())) {
    return res.status(400).json({ error: "Resume and job description are required" });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: "API not configured. Contact support." });

  const ctx = `Candidate Resume:\n${resume}\n\nJob Description:\n${jd}\nCompany: ${company || "Not specified"}\nRole: ${role || "Not specified"}`;

  const configs = {
    gap: {
      system: `You are a blunt, experienced Indian tech recruiter with 10 years experience. 
You give honest, specific, actionable feedback. 
IMPORTANT: Return ONLY valid JSON. No markdown. No explanation. No preamble.
JSON format: {"score":<integer 0-100>,"summary":"<2 honest sentences about overall fit>","missing":[{"title":"<gap>","detail":"<specific how-to-fix advice>"}],"weak":[{"title":"<area>","detail":"<practical improvement>"}],"strong":[{"title":"<strength>","detail":"<how to leverage>"}]}
Max 3 items in each array.`,
      user: `Analyse this resume against this job description. Be honest.\n\n${ctx}`,
      max_tokens: 1000,
    },
    resume: {
      system: `You are an expert resume writer for the Indian tech job market. 
Write ATS-optimised resumes that pass filters and impress humans.
Use strong action verbs, quantify results, insert JD keywords naturally.
Output plain text only — no markdown, no tables, no special characters.
Sections: SUMMARY | SKILLS | EXPERIENCE | PROJECTS | EDUCATION`,
      user: `Rewrite this resume to perfectly match the job description.\n\n${ctx}`,
      max_tokens: 1400,
    },
    cover: {
      system: `You are an expert cover letter writer for the Indian job market.
Write warm, specific, professional letters that make HR want to read the resume next.
Indian professional English. Human tone. No generic phrases.
Structure: Para 1 (why this company/role) | Para 2 (what you bring) | Para 3 (CTA)
Under 250 words total.`,
      user: `Write a cover letter for this application.\n\n${ctx}`,
      max_tokens: 700,
    },
    email: {
      system: `You write cold emails that get replies from HR managers in India.
Short, specific, confident. No desperation. No cringe openers.
EXACT output format:
Subject: <subject line>

---

Dear [HR Name],

<body - 3-4 sentences max>

[Your Name]
[Your Phone]

Under 130 words total (excluding subject line).`,
      user: `Write a cold email to the HR/hiring manager for this application.\n\n${ctx}`,
      max_tokens: 400,
    },
    interview: {
      system: `You are a tough but fair interview coach conducting a mock interview.
Company: ${company || "not specified"}
Role: ${role || "not specified"}
JD: ${jd?.slice(0, 600) || ""}
Resume: ${resume?.slice(0, 600) || ""}

Rules:
1. Ask ONE question at a time (mix: technical, behavioural, situational, HR)
2. When candidate answers: score /10, state what was good, state what was missing, show ideal answer in 3 bullet points
3. After feedback, ask next question automatically
4. After 5 questions: give overall readiness verdict with summary score
5. If asked about company/role/process: answer from JD context
6. Keep replies under 220 words
7. Be honest and demanding but constructive
8. Never repeat a question`,
      user: null, // uses messages array for chat
      max_tokens: 600,
    },
  };

  const config = configs[type];
  if (!config) return res.status(400).json({ error: "Invalid type" });

  // Build messages array
  let chatMessages;
  if (type === "interview" && Array.isArray(messages)) {
    chatMessages = messages; // full history passed from frontend
  } else {
    chatMessages = [{ role: "user", content: config.user }];
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: config.max_tokens,
        temperature: type === "gap" ? 0.3 : 0.7,
        messages: [
          { role: "system", content: config.system },
          ...chatMessages,
        ],
      }),
    });

    if (response.status === 429) {
      return res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
    }

    if (!response.ok) {
      const err = await response.text();
      console.error("Groq error:", err);
      return res.status(500).json({ error: "AI service error. Please try again." });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || "";

    return res.status(200).json({ result });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
