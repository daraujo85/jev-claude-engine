#!/usr/bin/env python3
"""Servidor HTTP standalone para exibição do JEV Visual Plan com autenticação por senha.

Protegido por senha (hash SHA-256) e sessão assinada via HMAC.
Sem dependências externas (apenas biblioteca padrão do Python 3).

Variáveis de ambiente:
  SHARE_TARGET              Caminho absoluto para o arquivo HTML do plano
  ARTIFACT_PASSWORD_SHA256  Hash SHA-256 da senha
  ARTIFACT_SESSION_SECRET   Chave secreta para assinatura de sessão
  PORT                      Porta local
"""

import hashlib
import hmac
import mimetypes
import os
import secrets
import sys
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, unquote, urlparse

TARGET = os.path.abspath(os.environ.get("SHARE_TARGET", "."))
PASSWORD_HASH = os.environ.get("ARTIFACT_PASSWORD_SHA256", "")
SESSION_SECRET = os.environ.get("ARTIFACT_SESSION_SECRET", secrets.token_hex(32)).encode()
PORT = int(os.environ.get("PORT", 8899))
SESSION_TTL = 60 * 60 * 24  # 24 horas

LOGIN_HTML = b'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>JEV &mdash; Visual Plan</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #0d0f14;
    color: #e8eaf0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
  }
  .card {
    width: 100%;
    max-width: 420px;
    background: #14171f;
    border: 1px solid #232834;
    border-radius: 14px;
    padding: 2.25rem 2rem;
    box-shadow: 0 20px 45px rgba(0,0,0,0.5);
  }
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 1.25rem;
    font-weight: 700;
    font-size: 1.25rem;
    letter-spacing: -0.02em;
    color: #7c8cf8;
  }
  .logo-badge {
    background: rgba(124, 140, 248, 0.15);
    color: #7c8cf8;
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 999px;
    font-weight: 600;
    border: 1px solid rgba(124, 140, 248, 0.3);
  }
  h1 {
    font-size: 1.3rem;
    font-weight: 600;
    color: #f8fafc;
    margin-bottom: 0.5rem;
  }
  p {
    font-size: 0.9rem;
    color: #8a91a3;
    line-height: 1.45;
    margin-bottom: 1.5rem;
  }
  label {
    display: block;
    font-size: 0.825rem;
    font-weight: 500;
    color: #cbd5e1;
    margin-bottom: 0.4rem;
  }
  input[type="password"] {
    width: 100%;
    padding: 0.75rem 0.9rem;
    background: #0d0f14;
    border: 1px solid #2c3342;
    border-radius: 8px;
    color: #f1f5f9;
    font-size: 1rem;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  input[type="password"]:focus {
    border-color: #7c8cf8;
    box-shadow: 0 0 0 3px rgba(124, 140, 248, 0.25);
  }
  button {
    margin-top: 1.25rem;
    width: 100%;
    padding: 0.8rem;
    background: #7c8cf8;
    color: #0d0f14;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s;
  }
  button:hover { background: #6b7cf0; }
  .error {
    margin-bottom: 1rem;
    padding: 0.65rem 0.85rem;
    border-radius: 8px;
    background: rgba(226, 102, 90, 0.15);
    border: 1px solid #7f1d1d;
    color: #fca5a5;
    font-size: 0.85rem;
  }
  .footer {
    margin-top: 1.5rem;
    text-align: center;
    font-size: 0.75rem;
    color: #64748b;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <span>JEV Engine</span>
    <span class="logo-badge">Live Visual Plan</span>
  </div>
  <h1>Plano de Execu&ccedil;&atilde;o Visual</h1>
  <p>Informe a senha para acompanhar o fluxo das etapas em tempo real (Archify).</p>
  {error}
  <form method="post" action="/login">
    <label for="password">Senha de acesso</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required placeholder="Digite a senha...">
    <button type="submit">Visualizar Fluxo</button>
  </form>
  <div class="footer">Link tempor&aacute;rio via Cloudflare Quick Tunnel</div>
</div>
</body>
</html>'''

def session_token():
    expires = str(int(time.time()) + SESSION_TTL)
    signature = hmac.new(SESSION_SECRET, expires.encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{signature}"

def valid_session(value):
    if not value or "." not in value:
        return False
    expires, signature = value.split(".", 1)
    if not expires.isdigit() or int(expires) < time.time():
        return False
    expected = hmac.new(SESSION_SECRET, expires.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)

class PlanHandler(BaseHTTPRequestHandler):
    def _body(self, body, status=200, content_type="text/plain; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def _authenticated(self):
        cookie = SimpleCookie(self.headers.get("Cookie"))
        session = cookie.get("jev_plan_session")
        return bool(session and valid_session(session.value))

    def _login(self, error=False, next_path="/"):
        form = LOGIN_HTML.replace(b'action="/login"', f'action="/login?next={quote(next_path, safe="")}"'.encode())
        body = form.replace(b"{error}", b'<div class="error">Senha incorreta. Tente novamente.</div>' if error else b"")
        self._body(body, 200, "text/html; charset=utf-8")

    def _safe_next(self, value):
        return value if value.startswith("/") and not value.startswith("//") else "/"

    def _file(self, filepath, content_type=None):
        if not os.path.isfile(filepath):
            self._body(b"404 Not Found", 404)
            return
        if not content_type:
            content_type, _ = mimetypes.guess_type(filepath)
            if not content_type:
                content_type = "application/octet-stream"
            if content_type.startswith("text/") or content_type in ("application/javascript", "application/json"):
                content_type += "; charset=utf-8"
        with open(filepath, "rb") as f:
            self._body(f.read(), 200, content_type)

    def _require_auth(self, redirect=False):
        if not PASSWORD_HASH:
            self._body(b"Autenticacao nao configurada", 503)
            return False
        if not self._authenticated():
            if redirect:
                self.send_response(303)
                self.send_header("Location", "/login?next=" + quote(self.path, safe=""))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
            else:
                self._body(b"401 Unauthorized", 401)
            return False
        return True

    def do_GET(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path in ("/health", "/ping"):
            self._body(b"ok", 200)
            return

        if parsed.path == "/login":
            next_path = self._safe_next((query.get("next") or ["/"])[0])
            self._login(next_path=next_path)
            return

        if parsed.path == "/logout":
            self.send_response(303)
            self.send_header("Location", "/login")
            self.send_header("Set-Cookie", "jev_plan_session=; Path=/; Max-Age=0")
            self.end_headers()
            return

        if not self._require_auth(redirect=True):
            return

        if os.path.isfile(TARGET):
            if parsed.path in ("/", ""):
                self._file(TARGET, "text/html; charset=utf-8")
                return
            base_dir = os.path.dirname(TARGET)
            rel = unquote(parsed.path.lstrip("/"))
            safe_path = os.path.abspath(os.path.join(base_dir, rel))
            if safe_path.startswith(base_dir) and os.path.isfile(safe_path):
                self._file(safe_path)
                return
            self._body(b"404 Not Found", 404)
        else:
            self._body(b"Plano nao encontrado", 404)

    def do_POST(self):
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/login":
            next_path = self._safe_next((query.get("next") or ["/"])[0])
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            password = parse_qs(raw.decode("utf-8", errors="replace")).get("password", [""])[0]
            password_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()

            if not PASSWORD_HASH or not hmac.compare_digest(password_hash, PASSWORD_HASH):
                self._login(error=True, next_path=next_path)
                return

            self.send_response(303)
            self.send_header("Location", next_path)
            self.send_header("Set-Cookie", f"jev_plan_session={session_token()}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_TTL}")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return

        self._body(b"405 Method Not Allowed", 405)

def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), PlanHandler)
    sys.stdout.write(f"JEV Plan server rodando em http://127.0.0.1:{PORT}\n")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == "__main__":
    main()
