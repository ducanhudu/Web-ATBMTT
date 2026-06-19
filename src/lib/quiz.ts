import type { Question } from "../types";

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [
      result[randomIndex],
      result[index],
    ];
  }
  return result;
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds,
  ).padStart(2, "0")}`;
}

export function buildQuestionSet(
  questions: Question[],
  topic: string,
  count: number,
  shouldShuffle: boolean,
  offset = 0,
): Question[] {
  const filtered =
    topic === "Tất cả chủ đề"
      ? questions
      : questions.filter((question) => question.topic === topic);
  const ordered = shouldShuffle
    ? shuffle(filtered).map((question) => {
        const indexedOptions = question.options.map((option, index) => ({
          option,
          index,
        }));
        const shuffledOptions = shuffle(indexedOptions);

        return {
          ...question,
          options: shuffledOptions.map((item) => item.option),
          correctAnswer: shuffledOptions.findIndex(
            (item) => item.index === question.correctAnswer,
          ),
        };
      })
    : filtered;
  const safeOffset = Math.max(0, Math.min(offset, ordered.length));
  return ordered.slice(safeOffset, Math.min(safeOffset + count, ordered.length));
}
