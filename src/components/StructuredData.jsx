// StructuredData.jsx - Add this to: src/components/StructuredData.jsx

export function ProductSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "KrackHire",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "49",
      "priceCurrency": "INR",
      "priceValidUntil": "2026-12-31"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "127",
      "bestRating": "5",
      "worstRating": "1"
    },
    "description": "AI-powered resume analysis and job readiness platform for Indian freshers",
    "url": "https://www.krackhire.in",
    "screenshot": "https://www.krackhire.in/screenshot.png",
    "softwareVersion": "1.0",
    "author": {
      "@type": "Person",
      "name": "Mohammad Mohid"
    }
  };

  return (
    <script 
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "KrackHire",
    "url": "https://www.krackhire.in",
    "logo": "https://www.krackhire.in/logo.png",
    "description": "AI job readiness platform for Indian freshers",
    "email": "hellokrackhire@gmail.com",
    "foundingDate": "2025",
    "founder": {
      "@type": "Person",
      "name": "Mohammad Mohid"
    },
    "sameAs": [
      "https://www.linkedin.com/company/krackhire",
      "https://twitter.com/krackhire",
      "https://www.instagram.com/krackhire"
    ]
  };

  return (
    <script 
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function FAQSchema({ faqs }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };

  return (
    <script 
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
