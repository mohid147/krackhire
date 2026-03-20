// SEO.jsx - Add this to: src/components/SEO.jsx

import { Helmet } from 'react-helmet-async';

export function SEOTags({ 
  title = "KrackHire - AI Resume Analysis for Indian Freshers | Know Why You'll Get Rejected",
  description = "Get instant AI-powered resume analysis against job descriptions. Know exactly why ATS will reject you before applying. Built for Indian freshers. Try free analysis now.",
  keywords = "resume analysis India, ATS resume checker, job rejection reasons, fresher resume help, AI resume analyzer, cover letter generator India, interview prep AI",
  image = "https://www.krackhire.in/og-image.png",
  url = "https://www.krackhire.in/"
}) {
  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      
      {/* Canonical URL */}
      <link rel="canonical" href={url} />
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      
      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={url} />
      <meta property="twitter:title" content={title} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={image} />
      
      {/* Mobile */}
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="theme-color" content="#2563eb" />
    </Helmet>
  );
}

// Usage in different pages:

export function HomePageSEO() {
  return (
    <SEOTags 
      title="KrackHire - Know Why You'll Get Rejected Before You Apply"
      description="AI-powered resume analysis for Indian freshers. Get your ATS score, skills gap analysis, and interview prep in 30 seconds. First analysis free!"
      url="https://www.krackhire.in/"
    />
  );
}

export function PricingSEO() {
  return (
    <SEOTags 
      title="Pricing - KrackHire | ₹49/month for Unlimited Resume Analysis"
      description="Affordable AI resume analysis for Indian freshers. Unlimited analyses, ATS scoring, cover letters, and interview prep for just ₹49/month. Start free trial today."
      url="https://www.krackhire.in/pricing"
    />
  );
}

export function BlogSEO({ title, description, slug }) {
  return (
    <SEOTags 
      title={`${title} | KrackHire Blog`}
      description={description}
      url={`https://www.krackhire.in/blog/${slug}`}
    />
  );
}
