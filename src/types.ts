export interface Question {
  id: string;
  topic: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  source: {
    document: string;
    line: number;
    marker: "bold" | "underline";
  };
}

export type QuizMode = "review" | "random" | "exam" | "mistakes";

export interface AnswerRecord {
  selected: number;
  correct: boolean;
  answeredAt: string;
}

export interface SessionRecord {
  id: string;
  mode: QuizMode;
  score: number;
  total: number;
  completedAt: string;
}

export interface ActiveQuizState {
  id: string;
  mode: QuizMode;
  questions: Question[];
  durationMinutes: number;
  currentIndex: number;
  answers: Record<string, number>;
  revealedQuestionIds: string[];
  elapsedSeconds: number;
  updatedAt: string;
}

export interface ProgressState {
  answers: Record<string, AnswerRecord>;
  wrongQuestionIds: string[];
  bookmarkedQuestionIds: string[];
  sessions: SessionRecord[];
  activeQuiz: ActiveQuizState | null;
}

export interface QuizConfig {
  mode: QuizMode;
  topic: string;
  questionCount: number;
  durationMinutes: number;
}

export interface QuizResult {
  answers: Record<string, number>;
  correct: number;
  total: number;
  durationSeconds: number;
  questionIds: string[];
}
