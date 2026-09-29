#!/usr/bin/env python3
"""Run autonomous browser navigation with JEV and Browser Harness."""
import sys
import subprocess
import shlex

def main():
    goal = " ".join(sys.argv[1:]).strip() or "Navegar até a tela principal"
    print(f"🌐 [JEV BROWSER PILOT]: Executando objetivo: '{goal}' via Browser Harness...")

    code = f'''
ensure_real_tab()
jev_click_goal({repr(goal)})
'''
    proc = subprocess.run(["browser-harness"], input=code, text=True, capture_output=False)
    sys.exit(proc.returncode)

if __name__ == "__main__":
    main()
