import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Code2,
  Eye,
  FileCode2,
  History,
  Lightbulb,
  LogOut,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Trophy,
  AlertTriangle,
  ArrowDownUp,
} from "lucide-react";

interface ReviewIssue {
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  line: number | null;
  suggestion: string | null;
}

interface ReviewHistoryItem {
  id: string;
  createdAt: string;
  code: string;
  language: string;
  review: {
    overallScore: number;
    bugs: ReviewIssue[];
    security: ReviewIssue[];
    performance: ReviewIssue[];
    codeQuality: ReviewIssue[];
    complexity?: {
      time: string;
      space: string;
      explanation: string;
    };
  };
}

const REVIEW_HISTORY_KEY = "ai-code-reviewer-history";

function HistoryPage() {
  const navigate = useNavigate();
const { user, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [history, setHistory] = useState<ReviewHistoryItem[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem(REVIEW_HISTORY_KEY) || "[]"
      ) as ReviewHistoryItem[];
    } catch {
      return [];
    }
  });

  const getTotalIssues = (item: ReviewHistoryItem) => {
    return (
      item.review.bugs.length +
      item.review.security.length +
      item.review.performance.length +
      item.review.codeQuality.length
    );
  };

  const getScoreTextClass = (score: number) => {
    if (score >= 80) {
      return "text-emerald-600";
    }

    if (score >= 60) {
      return "text-amber-600";
    }

    return "text-rose-600";
  };

  const getScoreRingClass = (score: number) => {
    if (score >= 80) {
      return "text-emerald-500";
    }

    if (score >= 60) {
      return "text-amber-500";
    }

    return "text-rose-500";
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatLatestDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getCodePreview = (code: string) => {
    const lines = code.split("\n").slice(0, 5);

    return lines;
  };

  const availableLanguages = useMemo(() => {
    return Array.from(
      new Set(history.map((item) => item.language))
    ).sort();
  }, [history]);

  const filteredHistory = useMemo(() => {
    let result = [...history];

    if (search.trim()) {
      const searchText = search.toLowerCase();

      result = result.filter((item) => {
        const codeMatch = item.code
          .toLowerCase()
          .includes(searchText);

        const languageMatch = item.language
          .toLowerCase()
          .includes(searchText);

        const issueMatch = [
          ...item.review.bugs,
          ...item.review.security,
          ...item.review.performance,
          ...item.review.codeQuality,
        ].some(
          (issue) =>
            issue.title
              .toLowerCase()
              .includes(searchText) ||
            issue.description
              .toLowerCase()
              .includes(searchText)
        );

        return codeMatch || languageMatch || issueMatch;
      });
    }

    if (languageFilter !== "all") {
      result = result.filter(
        (item) =>
          item.language.toLowerCase() ===
          languageFilter.toLowerCase()
      );
    }

    if (timeFilter !== "all") {
      const now = Date.now();

      const days =
        timeFilter === "today"
          ? 1
          : timeFilter === "7days"
            ? 7
            : 30;

      const minimumTime =
        now - days * 24 * 60 * 60 * 1000;

      result = result.filter(
        (item) =>
          new Date(item.createdAt).getTime() >=
          minimumTime
      );
    }

    result.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();

      return sortOrder === "newest"
        ? dateB - dateA
        : dateA - dateB;
    });

    return result;
  }, [
    history,
    search,
    languageFilter,
    timeFilter,
    sortOrder,
  ]);

  const totalReviews = history.length;

  const averageScore =
    totalReviews > 0
      ? Math.round(
          history.reduce(
            (sum, item) =>
              sum + item.review.overallScore,
            0
          ) / totalReviews
        )
      : 0;

  const totalIssues = history.reduce(
    (sum, item) => sum + getTotalIssues(item),
    0
  );

  const latestReview =
    history.length > 0
      ? [...history].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
        )[0]
      : null;

  const handleClearAll = () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete all review history?"
    );

    if (!confirmed) {
      return;
    }

    localStorage.removeItem(REVIEW_HISTORY_KEY);
    setHistory([]);
    setExpandedId(null);
  };

  const toggleDetails = (id: string) => {
    setExpandedId((current) =>
      current === id ? null : id
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50/40">
      {/* Top Navigation */}
    {/* Top Navigation */}
<header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950 text-white shadow-lg">
  <div className="mx-auto max-w-[1500px] px-3 sm:px-6">
    <div className="flex min-h-[72px] items-center justify-between gap-2">

      {/* Logo */}
      <button
        type="button"
        onClick={() => navigate("/workspace")}
        className="flex min-w-0 items-center gap-2 sm:gap-3"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 shadow-lg shadow-violet-500/20 sm:h-12 sm:w-12">
          <Code2 size={22} className="sm:hidden" />
          <Code2 size={27} className="hidden sm:block" />
        </div>

        <div className="min-w-0 text-left">
          <h1 className="truncate text-sm font-bold tracking-tight sm:text-lg">
            AI Code Reviewer
          </h1>

          <p className="hidden text-xs text-slate-400 sm:block">
            Write Better Code with AI
          </p>
        </div>
      </button>

      {/* Navigation */}
      <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={() => navigate("/workspace")}
          className="flex h-10 items-center gap-2 rounded-xl px-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white sm:px-4"
        >
          <Code2 size={18} />

          <span className="hidden sm:inline">
            Workspace
          </span>
        </button>

        <button
          type="button"
          className="flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 sm:px-4"
        >
          <History size={18} />

          <span className="hidden sm:inline">
            History
          </span>
        </button>
      </nav>

      {/* User */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        <div className="hidden items-center gap-3 border-r border-slate-700 pr-4 md:flex">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-sm font-bold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>

          <div>
            <p className="text-xs text-slate-400">
              Welcome back,
            </p>

            <p className="max-w-[120px] truncate text-sm font-semibold text-white">
              {user?.name}
            </p>
          </div>
        </div>

        {/* Mobile avatar */}
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-blue-500 text-xs font-bold md:hidden"
          title={user?.name}
        >
          {user?.name?.charAt(0).toUpperCase()}
        </div>

        <button
          type="button"
          onClick={async () => {
            try {
              await logout();
              navigate("/login");
            } catch (error) {
              console.error("Logout failed:", error);
            }
          }}
          className="flex h-10 items-center justify-center rounded-xl px-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white sm:gap-2 sm:px-3"
          title="Logout"
        >
          <LogOut size={18} />

          <span className="hidden lg:inline">
            Exit
          </span>
        </button>
      </div>
    </div>
  </div>
</header>

      <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-6 lg:px-8">
        {/* Page Header */}
        <section className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-600 shadow-sm">
              <History size={32} />
            </div>

            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                Review History
              </h2>

              <p className="mt-1 text-sm text-slate-500 sm:text-base">
                View and manage your previous AI code reviews
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/workspace")}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-500/20 transition hover:-translate-y-0.5 hover:shadow-xl"
          >
            <ArrowLeft size={18} />
            Back to Workspace
          </button>
        </section>

        {/* Statistics */}
        <section className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Total Reviews */}
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/60 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                <FileCode2 size={28} />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-500">
                  Total Reviews
                </p>

                <p className="mt-1 text-3xl font-extrabold text-slate-900">
                  {totalReviews}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Code reviews completed
                </p>
              </div>
            </div>
          </div>

          {/* Average Score */}
          <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-white to-emerald-50/60 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <Trophy size={28} />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-500">
                  Average Score
                </p>

                <p className="mt-1 text-3xl font-extrabold text-emerald-600">
                  {averageScore}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Overall code quality
                </p>
              </div>
            </div>
          </div>

          {/* Total Issues */}
          <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-white to-amber-50/60 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
                <AlertTriangle size={28} />
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-500">
                  Total Issues
                </p>

                <p className="mt-1 text-3xl font-extrabold text-amber-600">
                  {totalIssues}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  Across all reviews
                </p>
              </div>
            </div>
          </div>

          {/* Latest Review */}
          <div className="rounded-2xl border border-rose-100 bg-gradient-to-br from-white to-rose-50/60 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                <CalendarDays size={28} />
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-500">
                  Latest Review
                </p>

                <p className="mt-1 truncate text-xl font-extrabold text-slate-900">
                  {latestReview
                    ? formatLatestDate(
                        latestReview.createdAt
                      )
                    : "No reviews"}
                </p>

                <p className="mt-1 text-xs text-slate-400">
                  {latestReview
                    ? new Date(
                        latestReview.createdAt
                      ).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : "Start your first review"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Filters */}
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm backdrop-blur">
          <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_180px_160px_190px_auto]">
            {/* Search */}
            <div className="relative">
              <Search
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="text"
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search your reviews..."
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
              />
            </div>

            {/* Language */}
            <select
              value={languageFilter}
              onChange={(event) =>
                setLanguageFilter(event.target.value)
              }
              className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
            >
              <option value="all">
                All Languages
              </option>

              {availableLanguages.map((language) => (
                <option
                  key={language}
                  value={language}
                >
                  {language}
                </option>
              ))}
            </select>

            {/* Time */}
            <select
              value={timeFilter}
              onChange={(event) =>
                setTimeFilter(event.target.value)
              }
              className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
            </select>

            {/* Sort */}
            <select
              value={sortOrder}
              onChange={(event) =>
                setSortOrder(event.target.value)
              }
              className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
            >
              <option value="newest">
                Newest First
              </option>

              <option value="oldest">
                Oldest First
              </option>
            </select>

            {/* Clear */}
            <button
              type="button"
              onClick={handleClearAll}
              disabled={history.length === 0}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-5 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={18} />
              Clear All
            </button>
          </div>
        </section>

        {/* Results Count */}
        {history.length > 0 && (
          <div className="mb-4 flex items-center justify-between px-1">
            <p className="text-sm font-medium text-slate-500">
              Showing{" "}
              <span className="font-bold text-slate-800">
                {filteredHistory.length}
              </span>{" "}
              {filteredHistory.length === 1
                ? "review"
                : "reviews"}
            </p>

            {(search ||
              languageFilter !== "all" ||
              timeFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setLanguageFilter("all");
                  setTimeFilter("all");
                }}
                className="text-sm font-semibold text-violet-600 hover:text-violet-700"
              >
                Reset filters
              </button>
            )}
          </div>
        )}

        {/* Empty State */}
        {history.length === 0 && (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-violet-100 text-violet-600">
              <History size={38} />
            </div>

            <h3 className="mt-6 text-2xl font-extrabold text-slate-900">
              No review history yet
            </h3>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Complete a code review in the workspace and
              your review will automatically appear here.
            </p>

            <button
              type="button"
              onClick={() => navigate("/workspace")}
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-violet-500/20 transition hover:-translate-y-0.5"
            >
              Start a Review
              <ArrowRight size={17} />
            </button>
          </div>
        )}

        {/* No Filter Results */}
        {history.length > 0 &&
          filteredHistory.length === 0 && (
            <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Search size={30} />
              </div>

              <h3 className="mt-5 text-xl font-bold text-slate-900">
                No matching reviews
              </h3>

              <p className="mt-2 text-sm text-slate-500">
                Try changing your search or filters.
              </p>
            </div>
          )}

        {/* Review Cards */}
        <section className="space-y-4">
          {filteredHistory.map((item, index) => {
            const totalItemIssues =
              getTotalIssues(item);

            const isExpanded =
              expandedId === item.id;

            const previewLines = getCodePreview(
              item.code
            );

            const score =
              Math.max(
                0,
                Math.min(100, item.review.overallScore)
              );

            return (
              <article
                key={item.id}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-lg"
              >
                {/* Colored left border */}
                <div className="border-l-4 border-violet-500">
                  <div className="p-5 sm:p-6">
                    {/* Card Header */}
                    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-center gap-4">
                        {/* Language */}
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-xs font-extrabold text-amber-700">
                          {item.language
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-lg font-extrabold capitalize text-slate-900">
                              {item.language}
                            </h3>

                            <span className="flex items-center gap-1.5 text-sm text-slate-500">
                              <CalendarDays
                                size={16}
                              />
                              {formatDate(
                                item.createdAt
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      <span className="self-start rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-600">
                        #{history.length - index}
                      </span>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_1px_auto] lg:items-center">
                      {/* Code Preview */}
                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100/70 px-4 py-2.5">
                          <FileCode2
                            size={15}
                            className="text-slate-500"
                          />

                          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                            Code Preview
                          </span>
                        </div>

                        <div className="overflow-hidden px-4 py-3 font-mono text-sm">
                          {previewLines.map(
                            (line, lineIndex) => (
                              <div
                                key={`${item.id}-${lineIndex}`}
                                className="flex min-w-0"
                              >
                                <span className="mr-4 w-5 shrink-0 select-none text-right text-xs text-slate-400">
                                  {lineIndex + 1}
                                </span>

                                <code className="truncate whitespace-pre text-slate-700">
                                  {line || " "}
                                </code>
                              </div>
                            )
                          )}

                          {item.code.split("\n").length >
                            5 && (
                            <p className="mt-2 pl-9 text-xs font-sans font-medium text-slate-400">
                              More code available...
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="hidden h-24 w-px bg-slate-200 lg:block" />

                      {/* Score / Issues / Details */}
                      <div className="flex flex-wrap items-center gap-5 lg:min-w-[430px] lg:justify-end">
                        {/* Score Ring */}
                        <div className="flex flex-col items-center">
                          <div
                            className="relative flex h-20 w-20 items-center justify-center rounded-full"
                            style={{
                              background: `conic-gradient(currentColor ${score * 3.6}deg, #e2e8f0 0deg)`,
                            }}
                          >
                            <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-white">
                              <span
                                className={`text-xl font-extrabold ${getScoreTextClass(score)}`}
                              >
                                {score}
                              </span>
                            </div>
                          </div>

                          <span className="mt-2 text-xs font-bold text-slate-500">
                            Score
                          </span>
                        </div>

                        {/* Issue Ring */}
                        <div className="flex flex-col items-center">
                          <div
                            className={`relative flex h-20 w-20 items-center justify-center rounded-full ${
                              totalItemIssues > 0
                                ? "text-amber-500"
                                : "text-emerald-500"
                            }`}
                            style={{
                              background: `conic-gradient(currentColor ${
                                totalItemIssues > 0
                                  ? 270
                                  : 360
                              }deg, #e2e8f0 0deg)`,
                            }}
                          >
                            <div className="absolute inset-1.5 flex items-center justify-center rounded-full bg-white">
                              <span className="text-xl font-extrabold text-slate-800">
                                {totalItemIssues}
                              </span>
                            </div>
                          </div>

                          <span className="mt-2 text-xs font-bold text-slate-500">
                            Issues
                          </span>
                        </div>

                        {/* View Details */}
                        <button
                          type="button"
                          onClick={() =>
  navigate("/workspace", {
    state: {
      historyItem: item,
    },
  })
}
                          className="flex min-w-[175px] items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-bold text-violet-600 transition hover:border-violet-300 hover:bg-violet-100"
                        >
                          <Eye size={18} />

                          {isExpanded
                            ? "Hide Details"
                            : "View Details"}

                          {isExpanded ? (
                            <ChevronUp size={17} />
                          ) : (
                            <ChevronDown size={17} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="mt-6 border-t border-slate-200 pt-6">
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                          <HistoryDetail
                            icon={
                              <AlertTriangle
                                size={18}
                              />
                            }
                            title="Bugs"
                            count={
                              item.review.bugs.length
                            }
                            description="Potential bugs found"
                            className="text-rose-600 bg-rose-50"
                          />

                          <HistoryDetail
                            icon={
                              <ShieldAlert size={18} />
                            }
                            title="Security"
                            count={
                              item.review.security.length
                            }
                            description="Security concerns"
                            className="text-red-600 bg-red-50"
                          />

                          <HistoryDetail
                            icon={
                              <ArrowDownUp size={18} />
                            }
                            title="Performance"
                            count={
                              item.review.performance
                                .length
                            }
                            description="Performance issues"
                            className="text-amber-600 bg-amber-50"
                          />

                          <HistoryDetail
                            icon={
                              <Sparkles size={18} />
                            }
                            title="Code Quality"
                            count={
                              item.review.codeQuality
                                .length
                            }
                            description="Quality improvements"
                            className="text-violet-600 bg-violet-50"
                          />
                        </div>

                        {/* Complexity */}
                        {item.review.complexity && (
                          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
                            <div className="flex items-center gap-2">
                              <Lightbulb
                                size={18}
                                className="text-violet-600"
                              />

                              <h4 className="font-bold text-slate-900">
                                Complexity Analysis
                              </h4>
                            </div>

                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                              <div className="rounded-xl bg-white p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                  Time Complexity
                                </p>

                                <p className="mt-1 font-mono text-sm font-bold text-slate-800">
                                  {
                                    item.review
                                      .complexity.time
                                  }
                                </p>
                              </div>

                              <div className="rounded-xl bg-white p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                  Space Complexity
                                </p>

                                <p className="mt-1 font-mono text-sm font-bold text-slate-800">
                                  {
                                    item.review
                                      .complexity.space
                                  }
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Issue Summary */}
                        {totalItemIssues > 0 && (
                          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
                            <h4 className="font-bold text-slate-900">
                              Issues Found
                            </h4>

                            <div className="mt-4 space-y-3">
                              {[
                                ...item.review.bugs,
                                ...item.review.security,
                                ...item.review.performance,
                                ...item.review.codeQuality,
                              ]
                                .slice(0, 5)
                                .map(
                                  (issue, issueIndex) => (
                                    <div
                                      key={`${item.id}-issue-${issueIndex}`}
                                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="font-semibold text-slate-800">
                                          {issue.title}
                                        </p>

                                        <span
                                          className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${
                                            issue.severity ===
                                            "critical"
                                              ? "bg-red-100 text-red-700"
                                              : issue.severity ===
                                                  "high"
                                                ? "bg-orange-100 text-orange-700"
                                                : issue.severity ===
                                                    "medium"
                                                  ? "bg-amber-100 text-amber-700"
                                                  : "bg-emerald-100 text-emerald-700"
                                          }`}
                                        >
                                          {issue.severity}
                                        </span>
                                      </div>

                                      <p className="mt-2 text-sm leading-6 text-slate-500">
                                        {
                                          issue.description
                                        }
                                      </p>

                                      {issue.line !==
                                        null && (
                                        <p className="mt-2 text-xs font-semibold text-violet-600">
                                          Line{" "}
                                          {issue.line}
                                        </p>
                                      )}
                                    </div>
                                  )
                                )}

                              {totalItemIssues > 5 && (
                                <p className="pt-1 text-center text-xs font-semibold text-slate-400">
                                  +
                                  {totalItemIssues - 5}{" "}
                                  more issues
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {/* Bottom Tip */}
        {history.length > 0 && (
          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 to-indigo-50 px-6 py-5 text-center">
            <div className="flex items-center justify-center gap-2">
              <Lightbulb
                size={21}
                className="text-violet-600"
              />

              <h3 className="font-extrabold text-violet-700">
                Keep improving!
              </h3>
            </div>

            <p className="mt-1 text-sm text-slate-500">
              Review your code regularly to write cleaner,
              safer and more efficient code.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

interface HistoryDetailProps {
  icon: React.ReactNode;
  title: string;
  count: number;
  description: string;
  className: string;
}

function HistoryDetail({
  icon,
  title,
  count,
  description,
  className,
}: HistoryDetailProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${className}`}
        >
          {icon}
        </div>

        <div>
          <p className="text-sm font-bold text-slate-800">
            {title}
          </p>

          <p className="text-xs text-slate-400">
            {description}
          </p>
        </div>
      </div>

      <p className="mt-3 text-2xl font-extrabold text-slate-900">
        {count}
      </p>
    </div>
  );
}

export default HistoryPage;