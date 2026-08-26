/**
 * Flag `.on()`/`.once()` subscriptions to an emitter that outlives the
 * subscriber — the bug class found in every audited game: an Actor
 * subscribing `engine.input.keyboard.on("hold", …)` in onInitialize leaks a
 * phantom handler per construction (compounding across scene restarts), and
 * a Scene's `engine.screen.events.on("resize", …)` keeps the whole scene
 * alive.
 *
 * "Long-lived" = the receiver chain hangs off an Engine-typed link
 * (`engine.input.*`, `engine.screen.events`, `this.engine.events`, …).
 * A Scene's own `this.input.*` is scene-scoped and auto-toggled by the
 * engine, so it deliberately does NOT match (a naive on/off-balance rule
 * gets ~6 false positives per real leak on real code).
 *
 * A subscription is treated as handled when:
 *  - its result is captured (`const sub = ….on(…)` — the Subscription-close
 *    pattern), or
 *  - the same class contains an `.off("<same event>", …)` on an
 *    Engine-linked receiver.
 */
export const leakedSubscription = {
  id: "leaked-subscription",
  description: "a subscription to an engine-lifetime emitter is never removed",
  create(ctx, sf) {
    const { ts, checker, utils, report } = ctx;
    const ENGINE = new Set(["Engine"]);
    const SUBSCRIBER = new Set(["Entity", "Scene"]);

    const subs = []; // {node, eventName, classNode}
    const offs = []; // {eventName, classNode}

    function eventNameOf(call) {
      const first = call.arguments?.length ? utils.unwrap(call.arguments[0]) : null;
      return first && ts.isStringLiteral(first) ? first.text : null;
    }

    return {
      [ts.SyntaxKind.CallExpression](node) {
        const callee = utils.unwrap(node.expression);
        if (!ts.isPropertyAccessExpression(callee)) return;
        const method = callee.name.text;
        if (method !== "on" && method !== "once" && method !== "off") return;
        const classNode = utils.enclosingExcaliburClass(node, SUBSCRIBER);
        if (!classNode) return;
        if (!utils.chainContainsType(callee.expression, ENGINE)) return;
        if (method === "off") {
          offs.push({ eventName: eventNameOf(node), classNode });
          return;
        }
        // Captured result = the Subscription-close pattern; trust it.
        if (!ts.isExpressionStatement(node.parent)) return;
        subs.push({ node, eventName: eventNameOf(node), classNode });
      },
      "exit:file"() {
        for (const sub of subs) {
          const cleaned = offs.some(
            (off) => off.classNode === sub.classNode && (off.eventName === null || off.eventName === sub.eventName)
          );
          if (cleaned) continue;
          const event = sub.eventName ? `"${sub.eventName}"` : "an event";
          report({
            ...utils.lineCol(sf, sub.node),
            message: `subscription to ${event} on an engine-lifetime emitter is never removed`,
            hint: "the handler outlives this object (leaks per construction / scene re-entry) — keep the returned Subscription and close() it, or call .off(...) in onDeactivate/onPostKill.",
          });
        }
      },
    };
  },
};
