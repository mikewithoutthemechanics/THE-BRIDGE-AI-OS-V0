import os, re

PUBLIC = '/var/www/bridgeai/public'

# Files missing charset
missing_charset = ['outputs.html','portal.html','portfolio.html','profile.html','projects.html','runtime.html',
    'supadash-ai.html','supadash-report.html','supadash-settings.html','supadash-users.html','view-logs.html']

# Files missing viewport
missing_viewport = ['anatomical_face.html','anatomical_face_constrained_system.html','anatomical_face_embodied.html',
    'anatomical_face_facs.html','anatomical_face_tension_balanced.html','anatomical_face_vector_muscle.html',
    'godmode-terminal.html','supadash-ai.html','supadash-report.html','supadash-settings.html',
    'supadash-users.html','view-logs.html']

fixed = 0
for fname in os.listdir(PUBLIC):
    if not fname.endswith('.html'):
        continue
    path = os.path.join(PUBLIC, fname)
    needs_charset = fname in missing_charset
    needs_viewport = fname in missing_viewport
    if not needs_charset and not needs_viewport:
        continue
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except:
        print('SKIP (read error): ' + fname)
        continue

    original = content

    # Add charset if missing and there's a <head> tag
    if needs_charset and 'charset' not in content[:300].lower():
        if '<head>' in content:
            content = content.replace('<head>', '<head>\n<meta charset="UTF-8">', 1)
        elif '<head ' in content:
            content = re.sub(r'<head([^>]*)>', r'<head\1>\n<meta charset="UTF-8">', content, 1)

    # Add viewport if missing
    if needs_viewport and '<meta name="viewport"' not in content:
        # Insert after charset if present, else after <head>
        if '<meta charset' in content:
            content = content.replace('<meta charset', '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<meta charset', 1)
        elif '<head>' in content:
            content = content.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">', 1)

    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('FIXED: ' + fname)
        fixed += 1
    else:
        print('NO CHANGE: ' + fname + ' (pattern not matched)')

print('Done. Fixed: %d files' % fixed)
