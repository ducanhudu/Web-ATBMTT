import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bookmark,
  BookmarkCheck,
  BrainCircuit,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  FileCheck2,
  Flag,
  Home,
  ListChecks,
  Menu,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  Trophy,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import rawQuestions from "./data/questions.json";
import { questions555184 } from "./data/questions-555184";
import { buildQuestionSet, formatDuration } from "./lib/quiz";
import { useStoredProgress } from "./lib/storage";
import type {
  ActiveQuizState,
  ProgressState,
  Question,
  QuizConfig,
  QuizMode,
  QuizResult,
} from "./types";

const questions = [...(rawQuestions as Question[]), ...questions555184];
const ALL_TOPICS = "Tất cả chủ đề";
const topics = [
  ALL_TOPICS,
  ...Array.from(new Set(questions.map((question) => question.topic))).sort(),
];

type Screen = "dashboard" | "setup" | "quiz" | "result";

const modeDetails: Record<
  Exclude<QuizMode, "mistakes">,
  {
    eyebrow: string;
    title: string;
    description: string;
    icon: typeof BrainCircuit;
    color: string;
  }
> = {
  review: {
    eyebrow: "Học theo nhịp của bạn",
    title: "Ôn tập tuần tự",
    description: "Nhận phản hồi ngay sau mỗi câu và ghi nhớ đáp án đúng.",
    icon: BrainCircuit,
    color: "cyan",
  },
  random: {
    eyebrow: "Tăng khả năng phản xạ",
    title: "Luyện tập ngẫu nhiên",
    description: "Trộn câu hỏi từ các chủ đề, phù hợp cho một phiên học nhanh.",
    icon: Zap,
    color: "violet",
  },
  exam: {
    eyebrow: "Mô phỏng phòng thi",
    title: "Thi thử có thời gian",
    description: "Làm bài liền mạch, chỉ xem đáp án sau khi đã nộp.",
    icon: Timer,
    color: "orange",
  },
};

function createActiveQuizState(
  mode: QuizMode,
  sessionQuestions: Question[],
  durationMinutes: number,
): ActiveQuizState {
  return {
    id: crypto.randomUUID(),
    mode,
    questions: sessionQuestions,
    durationMinutes,
    currentIndex: 0,
    answers: {},
    revealedQuestionIds: [],
    elapsedSeconds: 0,
    updatedAt: new Date().toISOString(),
  };
}

function questionIdsMatch(left: Question[], right: Question[]) {
  if (left.length !== right.length) return false;
  return left.every((question, index) => question.id === right[index]?.id);
}

function getModeLabel(mode: QuizMode) {
  if (mode === "exam") return "Thi thử";
  if (mode === "mistakes") return "Ôn câu sai";
  if (mode === "random") return "Luyện ngẫu nhiên";
  return "Ôn tập";
}

function formatQuestionForCopy(question: Question) {
  const correctLetter = String.fromCharCode(65 + question.correctAnswer);
  return [
    `Chủ đề: ${question.topic}`,
    `Câu hỏi: ${question.question}`,
    "",
    ...question.options.map(
      (option, index) => `${String.fromCharCode(65 + index)}. ${option}`,
    ),
    "",
    `Đáp án đúng: ${correctLetter}. ${question.options[question.correctAnswer]}`,
  ].join("\n");
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

function updateProgressWithAnswers(
  current: ProgressState,
  sessionQuestions: Question[],
  selectedAnswers: Record<string, number>,
  mode: QuizMode,
): ProgressState {
  const answers = { ...current.answers };
  const wrongIds = new Set(current.wrongQuestionIds);
  let correct = 0;

  sessionQuestions.forEach((question) => {
    const selected = selectedAnswers[question.id];
    if (selected === undefined) return;
    const isCorrect = selected === question.correctAnswer;
    if (isCorrect) {
      correct++;
      wrongIds.delete(question.id);
    } else {
      wrongIds.add(question.id);
    }
    answers[question.id] = {
      selected,
      correct: isCorrect,
      answeredAt: new Date().toISOString(),
    };
  });

  return {
    ...current,
    answers,
    wrongQuestionIds: Array.from(wrongIds),
    sessions: [
      {
        id: crypto.randomUUID(),
        mode,
        score: correct,
        total: sessionQuestions.length,
        completedAt: new Date().toISOString(),
      },
      ...current.sessions,
    ].slice(0, 20),
  };
}

function updateProgressWithAnswer(
  current: ProgressState,
  question: Question,
  selected: number,
): ProgressState {
  const isCorrect = selected === question.correctAnswer;
  const wrongIds = new Set(current.wrongQuestionIds);

  if (isCorrect) {
    wrongIds.delete(question.id);
  } else {
    wrongIds.add(question.id);
  }

  return {
    ...current,
    answers: {
      ...current.answers,
      [question.id]: {
        selected,
        correct: isCorrect,
        answeredAt: new Date().toISOString(),
      },
    },
    wrongQuestionIds: Array.from(wrongIds),
  };
}

function App() {
  const { progress, setProgress, resetProgress } = useStoredProgress();
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [activeMode, setActiveMode] = useState<QuizMode>("review");
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(30);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const completedCount = Object.keys(progress.answers).length;
  const correctCount = Object.values(progress.answers).filter(
    (answer) => answer.correct,
  ).length;
  const accuracy =
    completedCount > 0 ? Math.round((correctCount / completedCount) * 100) : 0;

  const saveActiveQuiz = useCallback(
    (draft: ActiveQuizState | null) => {
      setProgress((current) => ({ ...current, activeQuiz: draft }));
    },
    [setProgress],
  );

  const launchQuiz = (
    mode: QuizMode,
    nextQuestions: Question[],
    durationMinutes: number,
  ) => {
    setActiveMode(mode);
    setSessionQuestions(nextQuestions);
    setSessionDurationMinutes(durationMinutes);
    setResult(null);
    saveActiveQuiz(
      createActiveQuizState(mode, nextQuestions, durationMinutes),
    );
    setScreen("quiz");
  };

  const openSetup = (mode: QuizMode) => {
    if (mode === "mistakes") {
      const mistakeQuestions = questions.filter((question) =>
        progress.wrongQuestionIds.includes(question.id),
      );
      if (mistakeQuestions.length === 0) return;
      launchQuiz(mode, mistakeQuestions, Math.max(15, mistakeQuestions.length));
      return;
    }

    setActiveMode(mode);
    setScreen("setup");
  };

  const startQuiz = (config: QuizConfig) => {
    const set = buildQuestionSet(
      questions,
      config.topic,
      config.questionCount,
      config.mode !== "review",
    );
    launchQuiz(config.mode, set, config.durationMinutes);
  };

  const resumeActiveQuiz = () => {
    const draft = progress.activeQuiz;
    if (!draft) return;

    setActiveMode(draft.mode);
    setSessionQuestions(draft.questions);
    setSessionDurationMinutes(draft.durationMinutes);
    setResult(null);
    setScreen("quiz");
  };

  const finishQuiz = (
    selectedAnswers: Record<string, number>,
    durationSeconds: number,
  ) => {
    const correct = sessionQuestions.filter(
      (question) =>
        selectedAnswers[question.id] === question.correctAnswer,
    ).length;

    const nextResult: QuizResult = {
      answers: selectedAnswers,
      correct,
      total: sessionQuestions.length,
      durationSeconds,
      questionIds: sessionQuestions.map((question) => question.id),
    };
    setProgress((current) => ({
      ...updateProgressWithAnswers(
        current,
        sessionQuestions,
        selectedAnswers,
        activeMode,
      ),
      activeQuiz: null,
    }));
    setResult(nextResult);
    setScreen("result");
  };

  const toggleBookmark = (questionId: string) => {
    setProgress((current) => {
      const bookmarks = new Set(current.bookmarkedQuestionIds);
      if (bookmarks.has(questionId)) bookmarks.delete(questionId);
      else bookmarks.add(questionId);
      return { ...current, bookmarkedQuestionIds: Array.from(bookmarks) };
    });
  };

  const recordAnswer = (question: Question, selected: number) => {
    setProgress((current) =>
      updateProgressWithAnswer(current, question, selected),
    );
  };

  const goHome = () => {
    setScreen("dashboard");
    setMobileMenuOpen(false);
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeScreen={screen}
        progress={progress}
        onHome={goHome}
        onOpenMistakes={() => openSetup("mistakes")}
        onOpenBookmarks={() => {
          const bookmarked = questions.filter((question) =>
            progress.bookmarkedQuestionIds.includes(question.id),
          );
          if (!bookmarked.length) return;
          launchQuiz("review", bookmarked, Math.max(15, bookmarked.length));
        }}
        mobileOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <main className="main-content">
        <MobileHeader
          onMenu={() => setMobileMenuOpen(true)}
          onHome={goHome}
        />

        {screen === "dashboard" && (
          <Dashboard
            completedCount={completedCount}
            correctCount={correctCount}
            accuracy={accuracy}
            progress={progress}
            onStart={openSetup}
            onResume={resumeActiveQuiz}
            onReset={resetProgress}
          />
        )}

        {screen === "setup" && (
          <QuizSetup
            mode={activeMode}
            onBack={goHome}
            onStart={startQuiz}
          />
        )}

        {screen === "quiz" && (
          <QuizPlayer
            key={`${activeMode}:${sessionQuestions
              .map((question) => question.id)
              .join(",")}`}
            mode={activeMode}
            questions={sessionQuestions}
            progress={progress}
            onBack={goHome}
            onFinish={finishQuiz}
            onAnswer={recordAnswer}
            activeQuiz={progress.activeQuiz}
            onDraftChange={saveActiveQuiz}
            onToggleBookmark={toggleBookmark}
            durationMinutes={sessionDurationMinutes}
          />
        )}

        {screen === "result" && result && (
          <ResultScreen
            result={result}
            questions={sessionQuestions}
            onHome={goHome}
            onRetry={() => {
              setResult(null);
              setScreen("quiz");
            }}
          />
        )}
      </main>
    </div>
  );
}

interface SidebarProps {
  activeScreen: Screen;
  progress: ProgressState;
  onHome: () => void;
  onOpenMistakes: () => void;
  onOpenBookmarks: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}

function Sidebar({
  activeScreen,
  progress,
  onHome,
  onOpenMistakes,
  onOpenBookmarks,
  mobileOpen,
  onClose,
}: SidebarProps) {
  return (
    <>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Đóng menu"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={24} strokeWidth={2.2} />
          </div>
          <div>
            <strong>ATTT Focus</strong>
            <span>Study smarter</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          <p className="nav-label">Không gian học tập</p>
          <button
            className={activeScreen === "dashboard" ? "active" : ""}
            onClick={onHome}
          >
            <Home size={19} />
            Tổng quan
          </button>
          <button onClick={onOpenMistakes}>
            <RotateCcw size={19} />
            Câu trả lời sai
            <span className="nav-count">{progress.wrongQuestionIds.length}</span>
          </button>
          <button onClick={onOpenBookmarks}>
            <Bookmark size={19} />
            Đã đánh dấu
            <span className="nav-count">
              {progress.bookmarkedQuestionIds.length}
            </span>
          </button>
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-tip">
          <Sparkles size={20} />
          <div>
            <strong>Mẹo học nhanh</strong>
            <p>Ôn lại câu sai sau mỗi phiên để tăng khả năng ghi nhớ.</p>
          </div>
        </div>
        <div className="sidebar-footer">
          <span className="status-dot" />
          Dữ liệu được lưu trên thiết bị
        </div>
      </aside>
    </>
  );
}

function MobileHeader({
  onMenu,
  onHome,
}: {
  onMenu: () => void;
  onHome: () => void;
}) {
  return (
    <header className="mobile-header">
      <button className="icon-button" onClick={onMenu} aria-label="Mở menu">
        <Menu size={22} />
      </button>
      <button className="mobile-brand" onClick={onHome}>
        <ShieldCheck size={22} />
        ATTT Focus
      </button>
      <span className="header-status">
        <span className="status-dot" />
        Online
      </span>
    </header>
  );
}

interface DashboardProps {
  completedCount: number;
  correctCount: number;
  accuracy: number;
  progress: ProgressState;
  onStart: (mode: QuizMode) => void;
  onResume: () => void;
  onReset: () => void;
}

function Dashboard({
  completedCount,
  correctCount,
  accuracy,
  progress,
  onStart,
  onResume,
  onReset,
}: DashboardProps) {
  const completionPercent = Math.round((completedCount / questions.length) * 100);
  const recentSessions = progress.sessions.slice(0, 4);
  const activeQuiz = progress.activeQuiz;
  const activeAnsweredCount = activeQuiz
    ? Object.keys(activeQuiz.answers).length
    : 0;

  return (
    <div className="page dashboard-page">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="pulse-dot" />
            Bộ câu hỏi đã sẵn sàng
          </span>
          <h1>
            Hôm nay bạn muốn
            <span> chinh phục phần nào?</span>
          </h1>
          <p>
            Luyện tập từ ngân hàng {questions.length} câu hỏi An toàn và Bảo mật
            thông tin, được chuẩn hóa từ tài liệu của bạn.
          </p>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit-ring ring-one" />
          <div className="orbit-ring ring-two" />
          <div className="orbit-core">
            <ShieldCheck size={46} />
          </div>
          <span className="orbit-chip chip-one">AES</span>
          <span className="orbit-chip chip-two">IDS</span>
          <span className="orbit-chip chip-three">RBAC</span>
        </div>
      </section>

      <section className="stats-grid" aria-label="Thống kê học tập">
        <StatCard
          icon={ListChecks}
          label="Đã làm"
          value={`${completedCount}/${questions.length}`}
          detail={`${completionPercent}% ngân hàng câu hỏi`}
          progress={completionPercent}
          color="cyan"
        />
        <StatCard
          icon={Target}
          label="Độ chính xác"
          value={`${accuracy}%`}
          detail={`${correctCount} câu trả lời đúng`}
          progress={accuracy}
          color="violet"
        />
        <StatCard
          icon={RefreshCw}
          label="Cần ôn lại"
          value={String(progress.wrongQuestionIds.length)}
          detail="Câu đang trong danh sách sai"
          color="orange"
        />
        <StatCard
          icon={Trophy}
          label="Phiên hoàn thành"
          value={String(progress.sessions.length)}
          detail="Được lưu gần đây"
          color="green"
        />
      </section>

      {activeQuiz && (
        <section className="resume-panel">
          <div className="resume-copy">
            <span className="section-kicker">Phiên đang làm dở</span>
            <h2>{getModeLabel(activeQuiz.mode)}</h2>
            <p>
              Đã trả lời {activeAnsweredCount}/{activeQuiz.questions.length} câu,
              đang ở câu {activeQuiz.currentIndex + 1}. Cập nhật lúc{" "}
              {new Date(activeQuiz.updatedAt).toLocaleTimeString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </p>
          </div>
          <div className="resume-meta">
            <span>
              <Clock3 size={17} />
              {formatDuration(activeQuiz.elapsedSeconds)}
            </span>
            <button className="primary-button" onClick={onResume}>
              Làm tiếp
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      )}

      <section className="section-block">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Chọn cách học</span>
            <h2>Bắt đầu một phiên mới</h2>
          </div>
          <span className="question-count">
            <FileCheck2 size={17} />
            {questions.length} câu khả dụng
          </span>
        </div>

        <div className="mode-grid">
          {(Object.keys(modeDetails) as Array<keyof typeof modeDetails>).map(
            (mode) => {
              const detail = modeDetails[mode];
              const Icon = detail.icon;
              return (
                <button
                  key={mode}
                  className={`mode-card mode-${detail.color}`}
                  onClick={() => onStart(mode)}
                >
                  <div className="mode-icon">
                    <Icon size={25} />
                  </div>
                  <span>{detail.eyebrow}</span>
                  <h3>{detail.title}</h3>
                  <p>{detail.description}</p>
                  <div className="mode-action">
                    Bắt đầu
                    <ArrowRight size={18} />
                  </div>
                </button>
              );
            },
          )}
        </div>
      </section>

      <section className="dashboard-lower">
        <div className="topic-panel">
          <div className="section-heading compact">
            <div>
              <span className="section-kicker">Nội dung</span>
              <h2>Phân bố chủ đề</h2>
            </div>
            <BarChart3 size={21} />
          </div>
          <div className="topic-list">
            {topics.slice(1).map((topic) => {
              const count = questions.filter(
                (question) => question.topic === topic,
              ).length;
              return (
                <div className="topic-row" key={topic}>
                  <div>
                    <span>{topic}</span>
                    <strong>{count} câu</strong>
                  </div>
                  <div className="topic-track">
                    <span
                      style={{ width: `${Math.max(8, (count / 70) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="activity-panel">
          <div className="section-heading compact">
            <div>
              <span className="section-kicker">Lịch sử</span>
              <h2>Phiên gần đây</h2>
            </div>
            {completedCount > 0 && (
              <button className="text-button danger" onClick={onReset}>
                Đặt lại
              </button>
            )}
          </div>
          {recentSessions.length ? (
            <div className="activity-list">
              {recentSessions.map((session) => (
                <div className="activity-row" key={session.id}>
                  <span
                    className={`activity-icon ${
                      session.score / session.total >= 0.7 ? "good" : ""
                    }`}
                  >
                    {session.score / session.total >= 0.7 ? (
                      <Check size={17} />
                    ) : (
                      <RefreshCw size={17} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {session.mode === "exam" ? "Thi thử" : "Luyện tập"}
                    </strong>
                    <span>
                      {new Date(session.completedAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                  <b>
                    {session.score}/{session.total}
                  </b>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state compact-empty">
              <BrainCircuit size={30} />
              <p>Phiên học đầu tiên của bạn sẽ xuất hiện ở đây.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

interface StatCardProps {
  icon: typeof ListChecks;
  label: string;
  value: string;
  detail: string;
  progress?: number;
  color: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  progress,
  color,
}: StatCardProps) {
  return (
    <article className={`stat-card stat-${color}`}>
      <div className="stat-top">
        <span className="stat-icon">
          <Icon size={20} />
        </span>
        <span className="stat-label">{label}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
      {progress !== undefined && (
        <div className="stat-progress">
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
    </article>
  );
}

function QuizSetup({
  mode,
  onBack,
  onStart,
}: {
  mode: QuizMode;
  onBack: () => void;
  onStart: (config: QuizConfig) => void;
}) {
  const safeMode = mode === "mistakes" ? "review" : mode;
  const detail = modeDetails[safeMode];
  const [topic, setTopic] = useState(ALL_TOPICS);
  const [questionCount, setQuestionCount] = useState(
    safeMode === "review" ? 20 : 30,
  );
  const [durationMinutes, setDurationMinutes] = useState(30);
  const available = questions.filter(
    (question) => topic === ALL_TOPICS || question.topic === topic,
  ).length;

  const safeQuestionCount = Math.min(questionCount, available);

  return (
    <div className="page setup-page">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft size={18} />
        Quay lại tổng quan
      </button>

      <div className="setup-layout">
        <section className="setup-intro">
          <span className={`setup-icon mode-${detail.color}`}>
            <detail.icon size={32} />
          </span>
          <span className="section-kicker">{detail.eyebrow}</span>
          <h1>{detail.title}</h1>
          <p>{detail.description}</p>

          <div className="setup-note">
            <ShieldCheck size={21} />
            <div>
              <strong>Dữ liệu đã được sàng lọc</strong>
              <span>
                Chỉ các câu có đủ 4 lựa chọn và một đáp án rõ ràng được sử dụng.
              </span>
            </div>
          </div>
        </section>

        <section className="setup-card">
          <div className="setup-card-header">
            <div>
              <span>Bước chuẩn bị</span>
              <h2>Cấu hình phiên học</h2>
            </div>
            <span className="step-badge">01</span>
          </div>

          <label className="field">
            <span>Chủ đề</span>
            <select value={topic} onChange={(event) => setTopic(event.target.value)}>
              {topics.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <small>{available} câu phù hợp</small>
          </label>

          <fieldset className="field">
            <legend>Số lượng câu hỏi</legend>
            <div className="segmented-options">
              {[10, 20, 30, 50].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={safeQuestionCount === count ? "selected" : ""}
                  disabled={count > available}
                  onClick={() => setQuestionCount(count)}
                >
                  {count}
                </button>
              ))}
              <button
                type="button"
                className={safeQuestionCount === available ? "selected" : ""}
                onClick={() => setQuestionCount(available)}
              >
                Tất cả
              </button>
            </div>
          </fieldset>

          {safeMode === "exam" && (
            <fieldset className="field">
              <legend>Thời gian làm bài</legend>
              <div className="segmented-options time-options">
                {[15, 30, 45, 60].map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className={durationMinutes === minutes ? "selected" : ""}
                    onClick={() => setDurationMinutes(minutes)}
                  >
                    {minutes} phút
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div className="setup-summary">
            <div>
              <ListChecks size={18} />
              <span>
                <b>{safeQuestionCount}</b> câu hỏi
              </span>
            </div>
            <div>
              <Clock3 size={18} />
              <span>
                {safeMode === "exam" ? `${durationMinutes} phút` : "Không giới hạn"}
              </span>
            </div>
          </div>

          <button
            className="primary-button large"
            onClick={() =>
              onStart({
                mode: safeMode,
                topic,
                questionCount: safeQuestionCount,
                durationMinutes,
              })
            }
          >
            Bắt đầu ngay
            <ArrowRight size={19} />
          </button>
        </section>
      </div>
    </div>
  );
}

interface QuizPlayerProps {
  mode: QuizMode;
  questions: Question[];
  progress: ProgressState;
  activeQuiz: ActiveQuizState | null;
  onBack: () => void;
  onFinish: (
    selectedAnswers: Record<string, number>,
    durationSeconds: number,
  ) => void;
  onAnswer: (question: Question, selected: number) => void;
  onDraftChange: (draft: ActiveQuizState | null) => void;
  onToggleBookmark: (questionId: string) => void;
  durationMinutes: number;
}

function QuizPlayer({
  mode,
  questions: sessionQuestions,
  progress,
  activeQuiz,
  onBack,
  onFinish,
  onAnswer,
  onDraftChange,
  onToggleBookmark,
  durationMinutes,
}: QuizPlayerProps) {
  const isExam = mode === "exam";
  const savedDraft =
    activeQuiz &&
    activeQuiz.mode === mode &&
    questionIdsMatch(activeQuiz.questions, sessionQuestions)
      ? activeQuiz
      : null;
  const [draftId] = useState(() => savedDraft?.id ?? crypto.randomUUID());
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.min(savedDraft?.currentIndex ?? 0, Math.max(sessionQuestions.length - 1, 0)),
  );
  const [answers, setAnswers] = useState<Record<string, number>>(
    () => savedDraft?.answers ?? {},
  );
  const [revealedIds, setRevealedIds] = useState<string[]>(
    () => savedDraft?.revealedQuestionIds ?? [],
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(
    () => savedDraft?.elapsedSeconds ?? 0,
  );
  const [remainingSeconds, setRemainingSeconds] = useState(
    Math.max(0, durationMinutes * 60 - (savedDraft?.elapsedSeconds ?? 0)),
  );
  const [copiedQuestionId, setCopiedQuestionId] = useState<string | null>(null);
  const submittedRef = useRef(false);
  const copyResetTimerRef = useRef<number | null>(null);
  const current = sessionQuestions[currentIndex];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
      if (isExam) {
        setRemainingSeconds((value) => Math.max(0, value - 1));
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isExam]);

  useEffect(() => {
    if (!sessionQuestions.length || submittedRef.current) return;

    onDraftChange({
      id: draftId,
      mode,
      questions: sessionQuestions,
      durationMinutes,
      currentIndex,
      answers,
      revealedQuestionIds: revealedIds,
      elapsedSeconds,
      updatedAt: new Date().toISOString(),
    });
  }, [
    answers,
    currentIndex,
    draftId,
    durationMinutes,
    elapsedSeconds,
    mode,
    onDraftChange,
    revealedIds,
    sessionQuestions,
  ]);

  useEffect(() => {
    if (isExam && remainingSeconds === 0) {
      if (submittedRef.current) return;
      submittedRef.current = true;
      onFinish(answers, elapsedSeconds);
    }
  }, [answers, elapsedSeconds, isExam, onFinish, remainingSeconds]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!current) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;

      if (isEditing || event.ctrlKey || event.metaKey || event.altKey) return;

      if (/^[1-4]$/.test(event.key)) {
        const optionIndex = Number(event.key) - 1;
        if (current.options[optionIndex] !== undefined) {
          event.preventDefault();
          if (!isExam && revealedIds.includes(current.id)) return;
          setAnswers((currentAnswers) => ({
            ...currentAnswers,
            [current.id]: optionIndex,
          }));
          if (!isExam) {
            setRevealedIds((ids) => [...new Set([...ids, current.id])]);
            onAnswer(current, optionIndex);
          }
        }
        return;
      }

      if (event.key === " " || event.key === "ArrowRight") {
        const canGoForward = isExam || answers[current.id] !== undefined;
        event.preventDefault();
        if (!canGoForward) return;

        if (currentIndex < sessionQuestions.length - 1) {
          setCurrentIndex((value) => value + 1);
        } else {
          submittedRef.current = true;
          onFinish(answers, elapsedSeconds);
        }
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (currentIndex > 0) {
          setCurrentIndex((value) => value - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    answers,
    current,
    currentIndex,
    elapsedSeconds,
    isExam,
    onAnswer,
    onFinish,
    revealedIds,
    sessionQuestions.length,
  ]);

  if (!current) {
    return (
      <div className="page">
        <div className="empty-state">
          <XCircle size={36} />
          <h2>Chưa có câu hỏi phù hợp</h2>
          <button className="primary-button" onClick={onBack}>
            Về tổng quan
          </button>
        </div>
      </div>
    );
  }

  const selected = answers[current.id];
  const isRevealed = revealedIds.includes(current.id);
  const isBookmarked = progress.bookmarkedQuestionIds.includes(current.id);
  const answeredCount = Object.keys(answers).length;
  const progressPercent = ((currentIndex + 1) / sessionQuestions.length) * 100;
  const canAdvance = isExam || selected !== undefined;

  const chooseAnswer = (optionIndex: number) => {
    if (!isExam && isRevealed) return;
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [current.id]: optionIndex,
    }));
    if (!isExam) {
      setRevealedIds((ids) => [...new Set([...ids, current.id])]);
      onAnswer(current, optionIndex);
    }
  };

  const nextQuestion = () => {
    if (!canAdvance) return;
    if (currentIndex < sessionQuestions.length - 1) {
      setCurrentIndex((value) => value + 1);
    } else {
      submittedRef.current = true;
      onFinish(answers, elapsedSeconds);
    }
  };

  const copyCurrentQuestion = async () => {
    await copyTextToClipboard(formatQuestionForCopy(current));
    setCopiedQuestionId(current.id);
    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = window.setTimeout(() => {
      setCopiedQuestionId(null);
      copyResetTimerRef.current = null;
    }, 1600);
  };

  return (
    <div className="quiz-page">
      <header className="quiz-header">
        <button className="back-button" onClick={onBack}>
          <X size={18} />
          Thoát
        </button>
        <div className="quiz-title">
          <span>{isExam ? "Thi thử" : "Luyện tập"}</span>
          <strong>{current.topic}</strong>
        </div>
        <div className={`timer-pill ${isExam ? "exam" : ""}`}>
          <Clock3 size={17} />
          {formatDuration(isExam ? remainingSeconds : elapsedSeconds)}
        </div>
      </header>

      <div className="quiz-progress">
        <span style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="quiz-layout">
        <section className="question-panel">
          <div className="question-meta">
            <span>
              Câu {currentIndex + 1}
              <small>/ {sessionQuestions.length}</small>
            </span>
            <div className="question-meta-actions">
              <button
                className={`question-tool-button ${
                  copiedQuestionId === current.id ? "copied" : ""
                }`}
                onClick={copyCurrentQuestion}
                aria-label="Sao chép câu hỏi và đáp án"
              >
                {copiedQuestionId === current.id ? (
                  <Check size={20} />
                ) : (
                  <Copy size={20} />
                )}
                {copiedQuestionId === current.id ? "Đã copy" : "Sao chép"}
              </button>
              <button
                className={`question-tool-button bookmark-button ${
                  isBookmarked ? "active" : ""
                }`}
                onClick={() => onToggleBookmark(current.id)}
                aria-label={isBookmarked ? "Bỏ đánh dấu" : "Đánh dấu câu hỏi"}
              >
                {isBookmarked ? (
                  <BookmarkCheck size={20} />
                ) : (
                  <Bookmark size={20} />
                )}
                {isBookmarked ? "Đã lưu" : "Đánh dấu"}
              </button>
            </div>
          </div>

          <h1>{current.question}</h1>

          <div className="answer-list">
            {current.options.map((option, optionIndex) => {
              const isSelected = selected === optionIndex;
              const isCorrectOption = optionIndex === current.correctAnswer;
              const showCorrect = !isExam && isRevealed && isCorrectOption;
              const showWrong =
                !isExam && isRevealed && isSelected && !isCorrectOption;
              const optionLetter = String.fromCharCode(65 + optionIndex);

              return (
                <button
                  key={`${current.id}-${optionIndex}`}
                  className={[
                    "answer-option",
                    isSelected ? "selected" : "",
                    showCorrect ? "correct" : "",
                    showWrong ? "wrong" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => chooseAnswer(optionIndex)}
                >
                  <span className="option-letter">{optionLetter}</span>
                  <span className="option-text">{option}</span>
                  <span className="option-status">
                    {showCorrect && <CheckCircle2 size={21} />}
                    {showWrong && <XCircle size={21} />}
                    {isSelected && !isRevealed && <span className="radio-dot" />}
                  </span>
                </button>
              );
            })}
          </div>

          {!isExam && isRevealed && (
            <div
              className={`feedback-box ${
                selected === current.correctAnswer ? "success" : "error"
              }`}
            >
              {selected === current.correctAnswer ? (
                <CheckCircle2 size={22} />
              ) : (
                <XCircle size={22} />
              )}
              <div>
                <strong>
                  {selected === current.correctAnswer
                    ? "Chính xác!"
                    : "Chưa chính xác"}
                </strong>
                <p>
                  Đáp án đúng là{" "}
                  <b>{String.fromCharCode(65 + current.correctAnswer)}</b>:{" "}
                  {current.options[current.correctAnswer]}
                </p>
              </div>
            </div>
          )}

          <div className="quiz-actions">
            <button
              className="secondary-button"
              disabled={currentIndex === 0}
              onClick={() => {
                if (currentIndex > 0) {
                  setCurrentIndex((value) => value - 1);
                }
              }}
            >
              <ArrowLeft size={18} />
              Câu trước
            </button>
            <button
              className="primary-button"
              disabled={!isExam && selected === undefined}
              onClick={nextQuestion}
            >
              {currentIndex === sessionQuestions.length - 1
                ? "Hoàn thành"
                : "Câu tiếp theo"}
              <ArrowRight size={18} />
            </button>
          </div>
        </section>

        <aside className="question-navigator">
          <div className="navigator-heading">
            <div>
              <span>Tiến độ</span>
              <strong>
                {answeredCount}/{sessionQuestions.length}
              </strong>
            </div>
            <Flag size={20} />
          </div>
          <div className="question-grid">
            {sessionQuestions.map((question, index) => {
              const isAnswered = answers[question.id] !== undefined;
              return (
                <button
                  key={question.id}
                  className={[
                    index === currentIndex ? "current" : "",
                    isAnswered ? "answered" : "",
                    progress.bookmarkedQuestionIds.includes(question.id)
                      ? "bookmarked"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setCurrentIndex(index)}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
          <div className="navigator-legend">
            <span>
              <i className="legend-current" /> Hiện tại
            </span>
            <span>
              <i className="legend-answered" /> Đã trả lời
            </span>
            <span>
              <i className="legend-empty" /> Chưa làm
            </span>
          </div>
          {isExam && (
            <button
              className="submit-exam-button"
              onClick={() => {
                submittedRef.current = true;
                onFinish(answers, elapsedSeconds);
              }}
            >
              Nộp bài
              <FileCheck2 size={18} />
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function ResultScreen({
  result,
  questions: resultQuestions,
  onHome,
  onRetry,
}: {
  result: QuizResult;
  questions: Question[];
  onHome: () => void;
  onRetry: () => void;
}) {
  const percentage = Math.round((result.correct / result.total) * 100);
  const unanswered = result.total - Object.keys(result.answers).length;
  const wrongQuestions = resultQuestions.filter(
    (question) =>
      result.answers[question.id] !== undefined &&
      result.answers[question.id] !== question.correctAnswer,
  );

  return (
    <div className="page result-page">
      <section className="result-hero">
        <div
          className="score-ring"
          style={{ "--score": percentage } as CSSProperties}
        >
          <div>
            <strong>{percentage}%</strong>
            <span>Hoàn thành</span>
          </div>
        </div>
        <div className="result-copy">
          <span className="eyebrow">
            <Trophy size={16} />
            Kết quả phiên học
          </span>
          <h1>
            {percentage >= 80
              ? "Bạn đang làm rất tốt."
              : percentage >= 60
                ? "Nền tảng đã khá vững."
                : "Mỗi câu sai là một điểm cần nhớ."}
          </h1>
          <p>
            Bạn trả lời đúng {result.correct} trên {result.total} câu trong{" "}
            {formatDuration(result.durationSeconds)}.
          </p>
        </div>
      </section>

      <section className="result-stats">
        <div>
          <CheckCircle2 size={23} />
          <span>Đúng</span>
          <strong>{result.correct}</strong>
        </div>
        <div>
          <XCircle size={23} />
          <span>Sai</span>
          <strong>{wrongQuestions.length}</strong>
        </div>
        <div>
          <Clock3 size={23} />
          <span>Bỏ trống</span>
          <strong>{unanswered}</strong>
        </div>
        <div>
          <Target size={23} />
          <span>Độ chính xác</span>
          <strong>{percentage}%</strong>
        </div>
      </section>

      {wrongQuestions.length > 0 && (
        <section className="review-panel">
          <div className="section-heading">
            <div>
              <span className="section-kicker">Cần xem lại</span>
              <h2>Các câu trả lời chưa đúng</h2>
            </div>
            <span className="question-count">
              {wrongQuestions.length} câu
            </span>
          </div>
          <div className="wrong-answer-list">
            {wrongQuestions.slice(0, 8).map((question, index) => {
              const selected = result.answers[question.id];
              return (
                <article key={question.id}>
                  <span>{index + 1}</span>
                  <div>
                    <h3>{question.question}</h3>
                    <p className="your-answer">
                      Bạn chọn: {question.options[selected]}
                    </p>
                    <p className="correct-answer">
                      Đáp án đúng: {question.options[question.correctAnswer]}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="result-actions">
        <button className="secondary-button" onClick={onHome}>
          <Home size={18} />
          Về tổng quan
        </button>
        <button className="primary-button" onClick={onRetry}>
          <RefreshCw size={18} />
          Làm lại phiên này
        </button>
      </div>
    </div>
  );
}

export default App;
