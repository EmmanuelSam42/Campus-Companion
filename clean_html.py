import re

file_path = 'c:/Users/Gifted Soul/Desktop/Projects/Campus Companion Trade/campus_companion_trade.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# The corruption looks like: 'class -some-class">' or 'class -some-class'
# We want to change 'class -' to 'class="' and handle the closing quote if it's missing.

# First, fix 'class -' to 'class="'
content = re.sub(r'class\s+-', 'class="', content)

# Now we have a lot of 'class="some-class">' where it should be 'class="some-class">'
# Wait, the quotes might be missing.
# Let's look at the patterns:
# 'class -detail-row">' -> 'class="detail-row">' (Correct)
# 'class -btn -gold"' -> 'class="btn -gold"' (Still has a hyphen)

# Let's refine the replacement to remove all leading hyphens in classes
# and ensure they are quoted.
# This is a bit complex to do with a simple regex without knowing all cases.
# Let's just do a global replace of ' -' to ' ' inside class attributes.

def fix_classes(match):
    attr_value = match.group(1)
    # Remove leading hyphen from the first class and any subsequent hyphens that start a class
    # e.g., "-btn -gold" -> "btn gold"
    fixed = attr_value.replace(' -', ' ').strip()
    if fixed.startswith('-'):
        fixed = fixed[1:]
    return f'class="{fixed}"'

# This regex finds 'class [anything]' until a quote or bracket
content = re.sub(r'class\s+([^"\'>]+)', fix_classes, content)

# Fix the " la-insight-ai-1.html" if it's still there
content = content.replace('la-insight-ai-1.html', '')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
