/**
 * dsh-talk-mode — the scope half.
 *
 * Mounted *inside* the `talk` agent preset (see `cordis.patch.yml`), so it runs
 * in that preset's scope rather than at the profile root.
 *
 * Every tool the rest of the profile registered globally — coding tools, plugin
 * tools, browser bridges, MCP servers — is denied for this scope, so a Talk turn
 * sends an empty tool catalog instead of the full schema dump.
 *
 * Safety is structural, not a promise: `tools.restrict()` refuses to run on a
 * context-global scope (`"a context-global restriction would mask every agent"`),
 * so a misconfiguration fails closed by throwing here and leaving every other
 * preset untouched. Restrictions are also per-layer and intersect, so Work
 * sessions and shipped presets keep their complete tool set.
 *
 * @module dsh-talk-mode
 */

export const name = 'talk-mode-scope'

export const inject = ['tools']

/** Reserved for the PTC presentation transport; `restrict()` rejects it. */
const RESERVED = 'run_code'

/**
 * Deny every globally visible tool for the calling preset scope.
 *
 * @param {import('@deepseek-ai/dsh-tools').Context} ctx - preset-scoped context
 * @returns {void}
 */
export function apply (ctx) {
  const denied = ctx.tools.schemas()
    .map((schema) => schema.name)
    .filter((tool) => tool !== RESERVED)

  // `restrict({})` is rejected as a no-op, so a profile that registers no
  // global tools simply needs no restriction.
  if (denied.length === 0) return

  try {
    // One intersecting mask; the scope keeps it for its whole lifetime.
    ctx.tools.restrict({ deny: denied })
    return
  } catch {
    // A single unacceptable name fails the whole mask (a name that is
    // scope-local, reserved, or unregistered since `schemas()` ran), so fall
    // back to one restriction per tool: every accepted call still intersects
    // onto the same scope layer.
  }

  for (const tool of denied) {
    try {
      ctx.tools.restrict({ deny: [tool] })
    } catch {
      // Not restrictable from this scope; nothing to hide.
    }
  }
}
