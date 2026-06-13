import re, glob
TOKENS = ['bg', 'text', 'borderColor', 'accent', 'semantic', 'chart', 'colorForMode', 'modeColors']
for f in sorted(glob.glob('src/**/*.tsx', recursive=True) + glob.glob('src/**/*.ts', recursive=True)):
    if f.startswith('src/design/'):
        continue
    src = open(f).read()
    imported = set()
    for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*['\"][^'\"]*(design|neutrals|theme|tokens)[^'\"]*['\"]", src):
        for name in m.group(1).split(','):
            name = name.strip()
            if name:
                imported.add(name)
    problems = []
    for tok in TOKENS:
        lines = [ln for ln in src.splitlines() if re.search(r"(?<![\w.'\"])" + re.escape(tok) + r"\.", ln)]
        noncomment = [ln for ln in lines if not ln.strip().startswith('*') and not ln.strip().startswith('//') and '/**' not in ln]
        if noncomment and tok not in imported:
            problems.append(tok)
    if problems:
        print(f, "MISSING", problems)
print("scan done")
