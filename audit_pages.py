import os, re

PUBLIC = "/var/www/bridgeai/public"

def audit_file(filepath):
    try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
    except Exception as e:
        return {"error": str(e)}

    ext = filepath.rsplit(".", 1)[-1].lower()
    results = {}
    # Skip HTML partials (fragment files without <html> shell)
    if ext == "html" and not content.lstrip().startswith(("<!DOCTYPE", "<html", "<HTML")):
        return {"type": "partial", "size": len(content)}

    if ext == "html":
        cdn_scripts = re.findall(r'<script[^>]+src=["\']https?://[^"\']+["\'][^>]*>', content)
        missing_sri = [s for s in cdn_scripts if "integrity=" not in s]
        cdn_links = re.findall(r'<link[^>]+href=["\']https?://[^"\']+["\'][^>]*>', content)
        missing_link_sri = [s for s in cdn_links if "integrity=" not in s and ("stylesheet" in s or "font" in s)]
        fetch_calls = len(re.findall(r'\bfetch\s*\(', content))
        catch_calls = len(re.findall(r'\.catch\s*\(', content))
        try_blocks = len(re.findall(r'\btry\s*\{', content))
        console_logs = len(re.findall(r'\bconsole\.log\s*\(', content))
        hardcoded = re.findall(r'eyJ[A-Za-z0-9_-]{40,}', content)
        todos = re.findall(r'(TODO|FIXME|HACK|XXX)[^\n]*', content)
        has_charset = bool(re.search(r'charset\s*=\s*["\']?utf-8', content, re.IGNORECASE))
        has_viewport = bool(re.search(r'name\s*=\s*["\']viewport["\']', content))
        has_csp = bool(re.search(r'Content-Security-Policy', content))
        has_nav = bool(re.search(r'bridge-nav\.js', content))
        has_title = bool(re.search(r'<title>', content))
        results = {
            "type": "html", "size": len(content),
            "missing_sri_scripts": len(missing_sri),
            "missing_sri_links": len(missing_link_sri),
            "fetch_calls": fetch_calls, "catch_calls": catch_calls, "try_blocks": try_blocks,
            "console_logs": console_logs, "hardcoded_secrets": len(hardcoded),
            "todos": len(todos), "todo_list": todos[:3],
            "has_charset": has_charset, "has_viewport": has_viewport,
            "has_csp": has_csp, "has_nav": has_nav, "has_title": has_title,
        }
    elif ext == "js":
        fetch_calls = len(re.findall(r'\bfetch\s*\(', content))
        catch_calls = len(re.findall(r'\.catch\s*\(', content))
        try_blocks = len(re.findall(r'\btry\s*\{', content))
        console_logs = len(re.findall(r'\bconsole\.log\s*\(', content))
        hardcoded = re.findall(r'eyJ[A-Za-z0-9_-]{40,}', content)
        todos = re.findall(r'(TODO|FIXME|HACK|XXX)[^\n]*', content)
        results = {
            "type": "js", "size": len(content),
            "fetch_calls": fetch_calls, "catch_calls": catch_calls, "try_blocks": try_blocks,
            "console_logs": console_logs, "hardcoded_secrets": len(hardcoded), "todos": len(todos),
        }
    elif ext == "css":
        vars_defined = len(re.findall(r'--[\w-]+\s*:', content))
        vars_used = len(re.findall(r'var\(--[\w-]+\)', content))
        todos = re.findall(r'(TODO|FIXME)[^\n]*', content)
        results = {
            "type": "css", "size": len(content), "lines": content.count("\n"),
            "vars_defined": vars_defined, "vars_used": vars_used, "todos": len(todos),
        }
    return results

def score_file(name, data):
    issues = []
    if data.get("type") == "html":
        if data.get("missing_sri_scripts", 0) > 0:
            issues.append(f"SRI missing on {data['missing_sri_scripts']} script(s)")
        if data.get("missing_sri_links", 0) > 0:
            issues.append(f"SRI missing on {data['missing_sri_links']} link(s)")
        fc = data.get("fetch_calls", 0)
        cc = data.get("catch_calls", 0) + data.get("try_blocks", 0)
        if fc > 0 and cc == 0:
            issues.append(f"fetch x{fc} NO error handling")
        elif fc > 0 and cc < fc:
            issues.append(f"fetch x{fc} only {cc} handlers")
        if data.get("console_logs", 0) > 5:
            issues.append(f"console.log x{data['console_logs']}")
        if data.get("hardcoded_secrets", 0) > 0:
            issues.append(f"HARDCODED SECRETS x{data['hardcoded_secrets']}")
        if not data.get("has_charset"):
            issues.append("missing charset")
        if not data.get("has_viewport"):
            issues.append("missing viewport")
        if not data.get("has_title"):
            issues.append("missing title")
        if not data.get("has_nav") and name not in ["home.html","index.html","login.html","join.html","landing.html"]:
            issues.append("no bridge-nav")
        if data.get("todos", 0) > 0:
            issues.append(f"TODO x{data['todos']}")
    elif data.get("type") == "js":
        fc = data.get("fetch_calls", 0)
        cc = data.get("catch_calls", 0) + data.get("try_blocks", 0)
        if fc > 0 and cc < fc:
            issues.append(f"fetch x{fc} only {cc} handlers")
        if data.get("console_logs", 0) > 10:
            issues.append(f"console.log x{data['console_logs']}")
        if data.get("hardcoded_secrets", 0) > 0:
            issues.append(f"HARDCODED SECRETS x{data['hardcoded_secrets']}")
    return issues

all_files = []
for root, dirs, files in os.walk(PUBLIC):
    dirs[:] = [d for d in dirs if d not in ["node_modules",".git"]]
    for f in files:
        if f.endswith((".html",".js",".css")):
            all_files.append(os.path.join(root, f))
all_files.sort()

print(f"=== FULL AUDIT: {len(all_files)} files ===\n")

critical = []
warnings = []
clean = []

for filepath in all_files:
    name = os.path.relpath(filepath, PUBLIC)
    data = audit_file(filepath)
    issues = score_file(os.path.basename(filepath), data)
    if "HARDCODED SECRETS" in " ".join(issues):
        critical.append((name, issues, data))
    elif issues:
        warnings.append((name, issues, data))
    else:
        clean.append(name)

print(f"CRITICAL ({len(critical)}):")
for name, issues, data in critical:
    print(f"  !! {name}")
    for i in issues:
        print(f"     - {i}")

print(f"\nWARNINGS ({len(warnings)}):")
for name, issues, data in warnings:
    print(f"  >> {name}")
    for i in issues:
        print(f"     - {i}")

print(f"\nCLEAN ({len(clean)}):")
for n in clean:
    print(f"  ok {n}")

print(f"\n=== SUMMARY ===")
print(f"Total: {len(all_files)} | Critical: {len(critical)} | Warnings: {len(warnings)} | Clean: {len(clean)}")
