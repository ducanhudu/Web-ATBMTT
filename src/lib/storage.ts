import { useEffect, useState } from "react";
import type { ProgressState } from "../types";

const STORAGE_KEY = "attt-focus-progress-v1";

const initialProgress: ProgressState = {
  answers: {},
  wrongQuestionIds: [],
  bookmarkedQuestionIds: [],
  sessions: [],
  activeQuiz: null,
};

function readProgress(): ProgressState {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return initialProgress;

    const parsed = JSON.parse(value) as Partial<ProgressState>;
    return {
      answers: parsed.answers ?? {},
      wrongQuestionIds: parsed.wrongQuestionIds ?? [],
      bookmarkedQuestionIds: parsed.bookmarkedQuestionIds ?? [],
      sessions: parsed.sessions ?? [],
      activeQuiz: parsed.activeQuiz
        ? { ...parsed.activeQuiz, config: parsed.activeQuiz.config ?? null }
        : null,
    };
  } catch {
    return initialProgress;
  }
}

export function useStoredProgress() {
  const [progress, setProgress] = useState<ProgressState>(readProgress);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  const resetProgress = () => setProgress(initialProgress);

  return { progress, setProgress, resetProgress };
}
