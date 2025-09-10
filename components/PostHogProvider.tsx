'use client';

import { useEffect } from 'react';
import { identifyUser } from '../lib/posthog_analytics';

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize PostHog user identification when the app loads
    identifyUser();
  }, []);

  return <>{children}</>;
}
