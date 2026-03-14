export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: "API not configured. Contact support." });

  const { type, resume, jd, company, role, messages } = req.body || {};
  if (!type) return res.status(400).json({ error: "Missing type" });

  const ctx = `Resume:\n${resume}\n\nJob Description:\n${jd}\nCompany: ${company || "Not specified"}\nRole: ${role || "Not specified"}`;

  const systemPrompts = {
    gap: `You are a blunt Indian tech recruiter. Return ONLY valid JSON, no markdown:
{"score":<0-100>,"summary":"<2 sentences>","missing":[{"title":"<gap>","detail":"<fix advice>"}],"weak":[{"title":"<area>","detail":"<advice>"}],"strong":[{"title":"<strength>","detail":"<how to use>"}]}
Max 3 items each array.`,
    resume: `Expert resume writer for Indian tech market. ATS-optimised plain text only. Sections: SUMMARY | SKILLS | EXPERIENCE | PROJECTS | EDUCATION`,
    cover: `Expert cover letter writer. Indian professional English. Under 250 words. 3 paragraphs. Human tone.`,
    email: `You write cold emails that get replies. Output format:
Subject: <subject line>

---

Dear [HR Name],

<body - max 4 sentences>

[Your Name]
[Your Phone]`,
    interview: `You are a tough interview coach. Ask ONE question at a time. Score answers /10. Show ideal answer. Keep replies under 200 words.
Company: ${company || "not specified"}
Role: ${role || "not specified"}
JD: ${(jd || "").slice(0, 500)}
Resume: ${(resume || "").slice(0, 500)}`
  };

  const userPrompts = {
    gap: `Analyse this resume against the job description:\n\n${ctx}`,
    resume: `Rewrite this resume to match the job description:\n\n${ctx}`,
    cover: `Write a cover letter for this application:\n\n${ctx}`,
    email: `Write a cold email to HR for this application:\n\n${ctx}`,
  };

  const maxTokens = { gap: 800, resume: 1400, cover: 600, email: 350, interview: 500 };

  let chatMessages;
  if (type === "interview" && Array.isArray(messages)) {
    chatMessages = messages;
  } else {
    chatMessages = [{ role: "user", content: userPrompts[type] || ctx }];
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: maxTokens[type] || 800,
        temperature: type === "gap" ? 0.3 : 0.7,
        messages: [
          { role: "system", content: systemPrompts[type] || systemPrompts.gap },
          ...chatMessages
        ]
      })
    });

    if (response.status === 429) {
      return res.status(429).json({ error: "Too many requests. Wait a moment and try again." });
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
    console.error("Error:", err);
    return res.status(500).json({ error: "Something went wrong. Try again." });
  }
}
