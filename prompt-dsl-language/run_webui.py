import http.server
import socketserver
import os
import webbrowser

web_dir = os.path.join(os.path.dirname(__file__), 'web-redactor')
os.chdir(web_dir)

PORT = 8000

while True:
    try:
        Handler = http.server.SimpleHTTPRequestHandler
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            print(f"Сервер запущен: http://localhost:{PORT}/")
            webbrowser.open(f"http://localhost:{PORT}/")
            httpd.serve_forever()
        break
    except OSError:
        PORT += 1