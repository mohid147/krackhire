 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/README.md b/README.md
index 748e9b946434197317d3959a0de215c1115e91ce..547e7da483e5679afbec6e2dc442c5954fe07d42 100644
--- a/README.md
+++ b/README.md
@@ -1,58 +1,48 @@
- # KrackHire 🚀
- 
- **AI Job Readiness Platform for Indian Freshers**
- 
- Know why you'll get rejected — before you apply.
- 
- ## What it does
- 
- Paste your resume + job description. Get all 5 outputs in ~60 seconds:
- 
- 1. 🔍 **Gap Analysis** — Hirability score /100 with exact gaps, weak areas, and strengths
- 2. 📄 **ATS Resume** — Your resume rewritten with JD keywords, passes ATS filters
- 3. ✉️ **Cover Letter** — Personalised, professional Indian English, under 250 words
- 4. 📧 **Cold Email to HR** — Under 150 words, subject line included, gets replies
- 5. 🎯 **Interview Coach** — Live AI chatbot, real questions, scores answers /10
- 
- ## Live
- 
- 🌐 [krackhire.vercel.app](https://krackhire.vercel.app)
- 
- ## Tech Stack
- 
- - React + Vite
--- Anthropic Claude API
-+- Groq API (llama3-70b-8192) via serverless function
- - Deployed on Vercel (free)
- 
- ## Run locally
- 
-+1. Create a `.env` file in the project root:
-+
-+```bash
-+# Used by serverless function in production / vercel dev
-+GROQ_API_KEY=your_groq_api_key_here
-+
-+# Optional fallback for plain `npm run dev` (without vercel dev)
-+VITE_GROQ_API_KEY=your_groq_api_key_here
-+```
-+
-+2. Install dependencies and start dev server:
-+
- ```bash
- npm install
- npm run dev
- ```
- 
-+> For production deployment on Vercel, set `GROQ_API_KEY` in Project Settings → Environment Variables.
-+
- ## Built by
- 
- Made with ♥ in Hyderabad, India.
- 
- ---
- 
- *Free in beta. No account. No credit card.*
- 
-EOF
-)
+# KrackHire 🚀
+
+**AI Job Readiness Platform for Indian Freshers**
+
+Know why you'll get rejected — before you apply.
+
+## What it does
+
+Paste your resume + job description. Get all 5 outputs in ~60 seconds:
+
+1. 🔍 **Gap Analysis** — Hirability score /100 with exact gaps, weak areas, and strengths
+2. 📄 **ATS Resume** — Your resume rewritten with JD keywords, passes ATS filters
+3. ✉️ **Cover Letter** — Personalised, professional Indian English, under 250 words
+4. 📧 **Cold Email to HR** — Under 150 words, subject line included, gets replies
+5. 🎯 **Interview Coach** — Live AI chatbot, real questions, scores answers /10
+
+## Live
+
+🌐 [krackhire.vercel.app](https://krackhire.vercel.app)
+
+## Tech Stack
+
+- React + Vite
+- Groq API (llama3-70b-8192)
+- Deployed on Vercel (free)
+
+## Run locally
+
+1. Create a `.env` file in the project root:
+
+```bash
+VITE_GROQ_API_KEY=your_groq_api_key_here
+```
+
+2. Install dependencies and start dev server:
+
+```bash
+npm install
+npm run dev
+```
+
+## Built by
+
+Made with ♥ in Hyderabad, India.
+
+---
+
+*Free in beta. No account. No credit card.*
 
EOF
)
