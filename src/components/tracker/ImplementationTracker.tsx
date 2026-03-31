import { useState, useEffect, useMemo } from "react";
import { Search, ChevronDown, Blocks, Sword, Filter } from "lucide-react";

interface ClassGroup {
  implemented: boolean;
  entries: string[];
}

interface ImplementationData {
  blocks: Record<string, ClassGroup>;
  items: Record<string, ClassGroup>;
}

type Tab = "blocks" | "items";
type StatusFilter = "all" | "implemented" | "not-implemented";

export default function ImplementationTracker() {
  const [data, setData] = useState<ImplementationData | null>(null);
  const [tab, setTab] = useState<Tab>("blocks");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "data/implementation-status.json")
      .then((r) => r.json())
      .then(setData);
  }, []);

  const currentData = data?.[tab];

  const stats = useMemo(() => {
    if (!currentData) return { total: 0, implemented: 0, totalClasses: 0, implementedClasses: 0 };
    const classes = Object.entries(currentData);
    const implementedClasses = classes.filter(([, g]) => g.implemented);
    return {
      total: classes.reduce((sum, [, g]) => sum + g.entries.length, 0),
      implemented: implementedClasses.reduce((sum, [, g]) => sum + g.entries.length, 0),
      totalClasses: classes.length,
      implementedClasses: implementedClasses.length,
    };
  }, [currentData]);

  const filtered = useMemo(() => {
    if (!currentData) return [];
    const lowerSearch = search.toLowerCase();
    return Object.entries(currentData)
      .filter(([className, group]) => {
        if (statusFilter === "implemented" && !group.implemented) return false;
        if (statusFilter === "not-implemented" && group.implemented) return false;
        if (!search) return true;
        if (className.toLowerCase().includes(lowerSearch)) return true;
        return group.entries.some((e) => e.toLowerCase().includes(lowerSearch));
      })
      .sort((a, b) => {
        // Implemented first, then alphabetical
        if (a[1].implemented !== b[1].implemented) return a[1].implemented ? -1 : 1;
        return a[0].localeCompare(b[0]);
      });
  }, [currentData, search, statusFilter]);

  const toggleExpand = (className: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(className)) next.delete(className);
      else next.add(className);
      return next;
    });
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pct = stats.total > 0 ? Math.round((stats.implemented / stats.total) * 100) : 0;

  return (
    <div className="w-full">
      {/* Stats overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total entries" value={stats.total} />
        <StatCard label="Implemented" value={stats.implemented} accent />
        <StatCard label="Classes" value={stats.totalClasses} />
        <StatCard label="Impl. classes" value={stats.implementedClasses} accent />
      </div>

      {/* Progress bar */}
      <div className="mb-6 p-4 rounded-2xl bg-white/5 dark:bg-white/5 border border-teal-200/30 dark:border-white/10">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-teal-700 dark:text-white/70">
            Implementation progress
          </span>
          <span className="text-sm font-minecraft text-teal-950 dark:text-white">
            {pct}%
          </span>
        </div>
        <div className="h-3 rounded-full bg-teal-100 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        {/* Tabs */}
        <div className="flex rounded-xl bg-teal-100 dark:bg-white/5 border border-teal-200/40 dark:border-white/10 p-1">
          <TabButton active={tab === "blocks"} onClick={() => setTab("blocks")}>
            <Blocks className="size-3.5" />
            Blocks
          </TabButton>
          <TabButton active={tab === "items"} onClick={() => setTab("items")}>
            <Sword className="size-3.5" />
            Items
          </TabButton>
        </div>

        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-teal-500 dark:text-white/40 pointer-events-none" />
          <input
            type="text"
            placeholder="Search blocks, items, or classes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-white/5 border border-teal-200/40 dark:border-white/10 rounded-xl text-teal-950 dark:text-white placeholder:text-teal-400 dark:placeholder:text-white/35 focus:outline-none focus:border-emerald-500/60 dark:focus:border-emerald-400/50 transition-all"
          />
        </div>

        {/* Status filter */}
        <div className="flex rounded-xl bg-teal-100 dark:bg-white/5 border border-teal-200/40 dark:border-white/10 p-1">
          <TabButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            <Filter className="size-3.5" />
            All
          </TabButton>
          <TabButton active={statusFilter === "implemented"} onClick={() => setStatusFilter("implemented")}>
            Done
          </TabButton>
          <TabButton active={statusFilter === "not-implemented"} onClick={() => setStatusFilter("not-implemented")}>
            Todo
          </TabButton>
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-teal-600 dark:text-white/40 mb-3">
        Showing {filtered.length} class{filtered.length !== 1 ? "es" : ""} ({filtered.reduce((s, [, g]) => s + g.entries.length, 0)} entries)
      </p>

      {/* Class list */}
      <div className="flex flex-col gap-2">
        {filtered.map(([className, group]) => {
          const isOpen = expanded.has(className);
          const matchingEntries = search
            ? group.entries.filter((e) => e.toLowerCase().includes(search.toLowerCase()))
            : group.entries;

          return (
            <div
              key={className}
              className="rounded-xl border border-teal-200/30 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] overflow-hidden transition-all"
            >
              <button
                onClick={() => toggleExpand(className)}
                className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-teal-50 dark:hover:bg-white/5 transition-colors"
              >
                {/* Status indicator */}
                <div
                  className={`size-2.5 rounded-full shrink-0 ${
                    group.implemented
                      ? "bg-emerald-500 dark:bg-emerald-400"
                      : "bg-teal-300 dark:bg-white/20"
                  }`}
                />

                {/* Class name */}
                <span className="font-minecraft text-sm text-teal-950 dark:text-white">
                  {className}
                </span>

                {/* Entry count badge */}
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 dark:bg-white/10 text-teal-600 dark:text-white/50">
                  {group.entries.length}
                </span>

                {/* Implemented badge */}
                {group.implemented && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-400/15 text-emerald-700 dark:text-emerald-400">
                    Implemented
                  </span>
                )}

                <div className="flex-1" />

                {/* Chevron */}
                <ChevronDown
                  className={`size-4 text-teal-400 dark:text-white/30 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Expanded entries */}
              {isOpen && (
                <div className="px-4 pb-3 pt-0">
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-teal-100 dark:border-white/5">
                    {(search ? matchingEntries : group.entries).map((entry) => (
                      <span
                        key={entry}
                        className="text-xs px-2 py-1 rounded-lg bg-teal-50 dark:bg-white/5 text-teal-700 dark:text-white/60 border border-teal-100 dark:border-white/5"
                      >
                        {entry}
                      </span>
                    ))}
                    {search && matchingEntries.length < group.entries.length && (
                      <span className="text-xs px-2 py-1 text-teal-400 dark:text-white/30 italic">
                        +{group.entries.length - matchingEntries.length} more
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-teal-500 dark:text-white/40">
          <p className="font-minecraft text-lg">No results found</p>
          <p className="text-sm mt-1">Try adjusting your search or filter</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="p-3 rounded-xl bg-white/60 dark:bg-white/[0.03] border border-teal-200/30 dark:border-white/10">
      <p className="text-xs text-teal-600 dark:text-white/40">{label}</p>
      <p
        className={`text-2xl font-minecraft mt-0.5 ${
          accent ? "text-emerald-600 dark:text-emerald-400" : "text-teal-950 dark:text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
        active
          ? "bg-white dark:bg-white/10 text-teal-950 dark:text-white shadow-sm"
          : "text-teal-600 dark:text-white/50 hover:text-teal-950 dark:hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
