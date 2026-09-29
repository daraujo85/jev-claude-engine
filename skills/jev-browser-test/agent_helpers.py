"""JEV System One Extension for Browser Harness
Provides sub-300ms deterministic element selection, goal verification,
and autonomous navigation loops directly inside Browser Harness.
"""
import json
import os
import time
import urllib.request
import urllib.error
from pathlib import Path

def _get_api_key():
    """Retrieve API key from environment or local config without hardcoding."""
    key = os.environ.get("TYPESAFE_API_KEY") or os.environ.get("JEV_API_KEY")
    if key:
        return key

    claude_settings = Path.home() / ".claude" / "settings.json"
    if claude_settings.is_file():
        try:
            with open(claude_settings, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("env", {}).get("TYPESAFE_API_KEY") or data.get("env", {}).get("JEV_API_KEY", "")
        except Exception:
            pass
    return ""

def _record_jev_browser_telemetry(feature, latency_ms, tokens_spared=12000, llm_latency=3500, status="success"):
    """Record savings telemetry to global and local ledgers."""
    entry = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "feature": feature,
        "provider": "typesafe",
        "jev_latency_ms": latency_ms,
        "jev_cost_usd": 0.000008,
        "estimated_llm_latency_ms": llm_latency,
        "estimated_llm_tokens_saved": tokens_spared,
        "estimated_llm_cost_saved_usd": round(tokens_spared * 0.000003, 6),
        "status": status
    }
    line = json.dumps(entry) + "\n"

    try:
        global_dir = Path.home() / ".jev"
        global_dir.mkdir(parents=True, exist_ok=True)
        with open(global_dir / "telemetry.jsonl", "a", encoding="utf-8") as f:
            f.write(line)
    except Exception:
        pass

    try:
        local_dir = Path.cwd() / ".jev"
        if local_dir.is_dir():
            with open(local_dir / "telemetry.jsonl", "a", encoding="utf-8") as f:
                f.write(line)
    except Exception:
        pass

def jev_system_one(state: str, questions: dict, feature="browser-harness", tokens_spared=12000):
    """Call JEV System One decision endpoint in ~150-300ms."""
    api_key = _get_api_key()
    endpoint = os.environ.get("JEV_GATEWAY_URL") or "https://api.typesafe.ai/v1/systemone"

    payload = {
        "model": "jev-latest",
        "state": state,
        "questions": questions
    }

    t0 = time.time()
    try:
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
        )
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        latency = int((time.time() - t0) * 1000)
        data["latency_ms"] = latency
        _record_jev_browser_telemetry(feature, latency, tokens_spared=tokens_spared)
        return data
    except Exception as e:
        latency = int((time.time() - t0) * 1000)
        _record_jev_browser_telemetry(feature, latency, tokens_spared=0, status="error")
        return {"error": str(e), "latency_ms": latency}

def jev_get_interactive_elements(limit=35):
    """Extract visible clickable elements with viewport coordinates from current Chrome tab."""
    js_code = """
    (() => {
        const interactives = [];
        const selector = 'button, a, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [onclick], [tabindex="0"]';
        const nodes = document.querySelectorAll(selector);
        let idx = 0;
        for (const el of nodes) {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
                continue;
            }
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                continue;
            }
            const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.value || el.title || el.id || '').trim().replace(/\\s+/g, ' ');
            if (!text && el.tagName.toLowerCase() !== 'input') {
                continue;
            }
            idx++;
            interactives.push({
                idx: 'el_' + idx,
                tag: el.tagName.toLowerCase(),
                id: el.id || '',
                text: text.slice(0, 80),
                type: el.type || '',
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
                w: Math.round(rect.width),
                h: Math.round(rect.height)
            });
            if (interactives.length >= %d) break;
        }
        return interactives;
    })()
    """ % limit

    try:
        from browser_harness.helpers import _runtime_evaluate
        res = _runtime_evaluate(js_code)
        return res if isinstance(res, list) else []
    except Exception:
        try:
            from browser_harness.helpers import cdp
            r = cdp("Runtime.evaluate", expression=js_code, returnByValue=True)
            return r.get("result", {}).get("value", [])
        except Exception:
            return []

def jev_decide_click(goal: str, elements=None):
    """Use JEV System One to pick the best element to click for a given goal in ~200ms."""
    if elements is None:
        elements = jev_get_interactive_elements()

    if not elements:
        return {"choice": "none", "is_reached": False, "reason": "No visible interactive elements found"}

    criteria = {}
    el_map = {}
    for el in elements:
        key = el["idx"]
        el_map[key] = el
        criteria[key] = f"<{el['tag']}> \"{el['text']}\""

    criteria["goal_reached"] = "O objetivo já foi alcançado na tela atual"
    criteria["scroll_down"] = "Rolar a página para baixo para procurar o elemento"

    summary_dom = " | ".join([f"[{el['idx']}]: <{el['tag']}> {el['text']}" for el in elements[:20]])
    state = f"OBJETIVO: \"{goal}\"\nELEMENTOS VISÍVEIS NA TELA:\n{summary_dom}"

    res = jev_system_one(
        state,
        {
            "target": {
                "type": "choice",
                "instructions": "Escolha o elemento que deve ser clicado para cumprir o objetivo, ou 'goal_reached' se já concluído, ou 'scroll_down' se precisa rolar.",
                "criteria": criteria
            }
        },
        feature="browser-harness-choice",
        tokens_spared=15000
    )

    ans = res.get("answers", {}).get("target", {})
    choice = ans.get("choice", "none")
    confidence = ans.get("confidence", 0.0)

    return {
        "choice": choice,
        "is_reached": choice == "goal_reached",
        "need_scroll": choice == "scroll_down",
        "element": el_map.get(choice),
        "confidence": confidence,
        "latency_ms": res.get("latency_ms", 150)
    }

def jev_click_goal(goal: str, max_steps=5, delay=0.5):
    """Autonomous sub-second loop: navigates and clicks toward goal using JEV decisions."""
    from browser_harness.helpers import click_at_xy, page_info

    print(f"\n🚀 [JEV UI PILOT]: Iniciando navegação rápida para: '{goal}'")
    total_tokens_spared = 0
    t_start = time.time()

    for step in range(1, max_steps + 1):
        elements = jev_get_interactive_elements()
        decision = jev_decide_click(goal, elements=elements)
        latency = decision.get("latency_ms", 0)

        if decision.get("is_reached"):
            print(f"   ✅ [Passo {step}]: Objetivo alcançado com sucesso! ({latency}ms)")
            total_tokens_spared += 15000
            break

        if decision.get("need_scroll"):
            print(f"   📜 [Passo {step}]: Rolando a página para baixo... ({latency}ms)")
            try:
                from browser_harness.helpers import cdp
                cdp("Input.dispatchMouseEvent", type="mouseWheel", x=500, y=500, deltaX=0, deltaY=400)
            except Exception:
                pass
            time.sleep(delay)
            continue

        el = decision.get("element")
        if not el:
            print(f"   ⚠️ [Passo {step}]: Nenhum elemento correspondente. Parando loop.")
            break

        conf = int(decision.get("confidence", 0) * 100)
        print(f"   🎯 [Passo {step}]: Clicando em <{el['tag']}> '{el['text']}' em ({el['x']}, {el['y']}) [{conf}% conf, {latency}ms]")
        click_at_xy(el["x"], el["y"])
        total_tokens_spared += 15000
        time.sleep(delay)

    total_time = round(time.time() - t_start, 2)
    print(f"⚡ [JEV UI PILOT Concluído]: {total_time}s decorridos | ~{total_tokens_spared:,} tokens de LLM poupados\n")
    return True

def jev_verify_page(statement: str):
    """Fast semantic check if current page satisfies statement using JEV System One noul."""
    from browser_harness.helpers import page_info
    info = page_info()
    elements = jev_get_interactive_elements(limit=20)
    dom_text = " | ".join([f"<{e['tag']}> {e['text']}" for e in elements])

    state = f"URL: {info.get('url')}\nTÍTULO: {info.get('title')}\nELEMENTOS: {dom_text}"

    res = jev_system_one(
        state,
        {
            "is_valid": {
                "type": "noul",
                "instructions": f"A página atual confirma a seguinte afirmação: '{statement}'?"
            }
        },
        feature="browser-harness-verify",
        tokens_spared=10000
    )

    ans = res.get("answers", {}).get("is_valid", {})
    raw = ans.get("noul", False)
    prob = ans.get("probability", 1.0 if raw else 0.0)
    is_true = raw if isinstance(raw, bool) else (raw >= 0.50 if isinstance(raw, (int, float)) else False)

    return {
        "verified": is_true,
        "probability": prob,
        "latency_ms": res.get("latency_ms", 120)
    }
