import { v } from "convex/values";
import { internalMutation } from "./triggers";
import { classTypeValidator, methodStatusValidator, methodValidator } from "./schema";

// ─── Types ────────────────────────────────────────────────────────────────────

const classInputValidator = v.object({
  class_name: v.string(),
  class_type: classTypeValidator,
  percentage_implemented: v.number(),
  methods: v.array(
    v.object({
      method_name: v.string(),
      status: methodStatusValidator,
    })
  ),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function methodsHash(methods: { method_name: string; status: string }[]): string {
  return JSON.stringify(
    [...methods].sort((a, b) => a.method_name.localeCompare(b.method_name))
  );
}

// ─── Mutation ─────────────────────────────────────────────────────────────────

export const ingestRun = internalMutation({
  args: {
    commit_sha: v.string(),
    branch: v.string(),
    pr_number: v.optional(v.number()),
    mc_version: v.string(),
    content_hash: v.string(),
    classes: v.array(classInputValidator),
  },
  handler: async (ctx, args) => {
    // ── 1. Duplicate check ──────────────────────────────────────────────────
    const existing = await ctx.db
      .query("runs")
      .withIndex("by_hash", (q) => q.eq("content_hash", args.content_hash))
      .first();

    if (existing) {
      // Ghost run for traceability — no class data inserted
      const run_id = await ctx.db.insert("runs", {
        commit_sha: args.commit_sha,
        branch: args.branch,
        pr_number: args.pr_number,
        mc_version: args.mc_version,
        content_hash: args.content_hash,
        is_duplicate: true,
        triggered_at: Date.now(),
      });
      return { run_id, is_duplicate: true };
    }

    // ── 2. Find previous non-duplicate run on this branch (before inserting) ─
    const prevRun = await ctx.db
      .query("runs")
      .withIndex("by_branch", (q) => q.eq("branch", args.branch))
      .filter((q) => q.eq(q.field("is_duplicate"), false))
      .order("desc")
      .first();

    // ── 3. Insert the run ────────────────────────────────────────────────────
    // sources + mc_versions are auto-maintained by triggers in triggers.ts
    const run_id = await ctx.db.insert("runs", {
      commit_sha: args.commit_sha,
      branch: args.branch,
      pr_number: args.pr_number,
      mc_version: args.mc_version,
      content_hash: args.content_hash,
      is_duplicate: false,
      triggered_at: Date.now(),
    });

    // ── 4. Upsert class_registry (once per mc_version) ───────────────────────
    const existingRegistry = await ctx.db
      .query("class_registry")
      .withIndex("by_version", (q) => q.eq("mc_version", args.mc_version))
      .first();

    if (!existingRegistry) {
      await ctx.db.insert("class_registry", {
        mc_version: args.mc_version,
        class_names: args.classes.map((c) => c.class_name).sort(),
      });
    }

    // ── 5. Build previous state map: class_name → methods hash ───────────────
    const prevSnapshots = prevRun
      ? await ctx.db
        .query("class_current")
        .withIndex("by_branch_mc", (q) =>
          q.eq("branch", args.branch).eq("mc_version", args.mc_version)
        )
        .collect()
      : [];

    const prevHashMap = new Map(
      prevSnapshots.map((s) => [s.class_name, methodsHash(s.methods)])
    );
    const prevCurrentMap = new Map(prevSnapshots.map((s) => [s.class_name, s]));

    // ── 6. Process classes in batches ────────────────────────────────────────
    for (let i = 0; i < args.classes.length; i += 50) {
      const batch = args.classes.slice(i, i + 50);

      await Promise.all(
        batch.map(async (cls) => {
          const newHash = methodsHash(cls.methods);
          const prevDoc = prevCurrentMap.get(cls.class_name);

          // Always upsert class_current (materialized current state per branch)
          if (prevDoc) {
            await ctx.db.patch(prevDoc._id, {
              run_id,
              percentage_implemented: cls.percentage_implemented,
              methods: cls.methods,
              class_type: cls.class_type,
            });
          } else {
            await ctx.db.insert("class_current", {
              branch: args.branch,
              mc_version: args.mc_version,
              class_name: cls.class_name,
              class_type: cls.class_type,
              run_id,
              percentage_implemented: cls.percentage_implemented,
              methods: cls.methods,
            });
          }

          // Delta: only insert class_changes if methods actually changed
          const methodsChanged = newHash !== prevHashMap.get(cls.class_name);
          if (methodsChanged) {
            await ctx.db.insert("class_changes", {
              run_id,
              mc_version: args.mc_version,
              class_name: cls.class_name,
              class_type: cls.class_type,
              percentage_implemented: cls.percentage_implemented,
              methods: cls.methods,
            });

            // Update class_best if this is now the best known state
            const currentBest = await ctx.db
              .query("class_best")
              .withIndex("by_mc_class", (q) =>
                q.eq("mc_version", args.mc_version).eq("class_name", cls.class_name)
              )
              .first();

            if (!currentBest) {
              await ctx.db.insert("class_best", {
                mc_version: args.mc_version,
                class_name: cls.class_name,
                class_type: cls.class_type,
                run_id,
                percentage_implemented: cls.percentage_implemented,
                methods: cls.methods,
              });
            } else if (cls.percentage_implemented > currentBest.percentage_implemented) {
              await ctx.db.patch(currentBest._id, {
                run_id,
                percentage_implemented: cls.percentage_implemented,
                methods: cls.methods,
                class_type: cls.class_type,
              });
            }
          }
        })
      );
    }

    return { run_id, is_duplicate: false };
  },
});
