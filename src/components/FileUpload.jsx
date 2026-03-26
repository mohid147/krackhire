import React, { useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Import the worker locally using Vite's asset syntax so it doesn't need the internet
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import mammoth from 'mammoth';

// Set the worker to the local file we just imported
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export default function FileUpload({ onExtract, label = "Upload PDF/DOCX", accent = "#3D6B4F" }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setError("");

    try {
      let extractedText = "";

      if (file.type === "application/pdf") {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(" ") + "\n";
        }
        extractedText = text;
      } else if (file.name.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        extractedText = result.value;
      } else {
        throw new Error("Unsupported format. Please upload a PDF or DOCX.");
      }

      if (extractedText.trim().length < 50) {
        throw new Error("Could not extract text. Ensure the file is not a scanned image.");
      }

      onExtract(extractedText.trim());
    } catch (err) {
      setError(err.message || "Failed to read file.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <input
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: "none" }}
        ref={fileInputRef}
        onChange={handleFile}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          padding: "6px 12px", borderRadius: "8px", border: `1.5px dashed ${accent}`,
          background: `${accent}10`, color: accent, fontSize: "12.5px", fontWeight: "700",
          cursor: loading ? "wait" : "pointer", transition: "all .2s", fontFamily: "inherit"
        }}
      >
        {loading ? (
          <span style={{ animation: "pulse 1.5s infinite" }}>⏳ Extracting...</span>
        ) : (
          `📎 ${label}`
        )}
      </button>
      {error && <span style={{ fontSize: "12px", color: "#C0392B", fontWeight: "600" }}>{error}</span>}
    </div>
  );
}
