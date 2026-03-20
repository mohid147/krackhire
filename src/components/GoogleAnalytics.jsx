// GoogleAnalytics.jsx - Add this to: src/components/GoogleAnalytics.jsx

import { useEffect } from 'react';

// Track page views
export function usePageTracking() {
  useEffect(() => {
    if (typeof window.gtag !== 'undefined') {
      window.gtag('config', 'G-KMTZTVC6W7', {
        page_path: window.location.pathname + window.location.search,
      });
    }
  }, []);
}

// Track custom events
export const trackEvent = (eventName, eventParams = {}) => {
  if (typeof window.gtag !== 'undefined') {
    window.gtag('event', eventName, eventParams);
  }
};

// Common events to track
export const EVENTS = {
  // User actions
  SIGNUP: 'sign_up',
  LOGIN: 'login',
  LOGOUT: 'logout',
  
  // Resume actions
  ANALYZE_START: 'analyze_start',
  ANALYZE_COMPLETE: 'analyze_complete',
  RESUME_DOWNLOAD: 'resume_download',
  COVER_LETTER_GENERATE: 'cover_letter_generate',
  
  // Payments
  PAYMENT_START: 'begin_checkout',
  PAYMENT_SUCCESS: 'purchase',
  PAYMENT_FAILED: 'payment_failed',
  
  // Engagement
  SHARE_SCORE: 'share',
  INVITE_SENT: 'invite_sent',
  REVIEW_SUBMITTED: 'review_submitted',
  
  // Outbound
  CLICK_EXTERNAL_LINK: 'click',
  DOWNLOAD_APP: 'file_download'
};

/* 
USAGE EXAMPLES:

// Track button clicks:
import { trackEvent, EVENTS } from './components/GoogleAnalytics';

function AnalyzeButton() {
  const handleAnalyze = () => {
    trackEvent(EVENTS.ANALYZE_START, {
      button_location: 'homepage_hero'
    });
    // Your analysis logic
  };

  return <button onClick={handleAnalyze}>Analyze Now</button>;
}

// Track conversions:
function PaymentSuccess() {
  useEffect(() => {
    trackEvent(EVENTS.PAYMENT_SUCCESS, {
      transaction_id: orderId,
      value: 49,
      currency: 'INR'
    });
  }, []);
}
*/
