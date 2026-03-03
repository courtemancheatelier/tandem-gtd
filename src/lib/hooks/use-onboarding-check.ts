"use client";

import { useState, useEffect } from "react";

export function useOnboardingCheck() {
  const [shouldOnboard, setShouldOnboard] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/onboarding/status")
      .then((res) => res.json())
      .then((data) => {
        setShouldOnboard(!data.onboardingCompleted);
        setChecking(false);
      })
      .catch(() => {
        setChecking(false);
      });
  }, []);

  return { shouldOnboard, checking };
}
